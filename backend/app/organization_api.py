import hmac
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select, update

from . import catalog_schemas as s
from .catalog_models import (
    EventStaff,
    Invitation,
    Member,
    MemberPermission,
    Organization,
    StaffPermission,
)
from .catalog_service import (
    capabilities,
    catalog_audit,
    organization_guard,
    record,
    set_capabilities,
)
from .models import OutboxJob, User
from .schemas import TokenInput
from .security import challenge_value, digest, fail, now, token_id
from .service import rate_limit, valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["organizations"])

    @routes.post("/organizations", response_model=s.OrganizationView, status_code=201)
    def create(data: s.OrganizationCreate, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = Organization(owner_user_id=user.id, **data.model_dump())
            db.add(org)
            db.flush()
            db.add(Member(organization_id=org.id, user_id=user.id))
            catalog_audit(db, user, "organization.created", org)
        return org

    @routes.get("/organizations", response_model=list[s.OrganizationView])
    def listing(
        ids=Depends(principal), limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            membership = select(Member.organization_id).where(
                Member.user_id == user.id, Member.status == "active"
            )
            return list(
                db.scalars(
                    select(Organization)
                    .where(
                        Organization.status == "active",
                        or_(Organization.owner_user_id == user.id, Organization.id.in_(membership)),
                    )
                    .order_by(Organization.created_at, Organization.id)
                    .limit(limit)
                    .offset(offset)
                )
            )

    @routes.get("/organizations/{org_id}", response_model=s.OrganizationView)
    def detail(org_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return organization_guard(db, user, org_id)

    @routes.patch("/organizations/{org_id}", response_model=s.OrganizationView)
    def edit(org_id: UUID, data: s.OrganizationUpdate, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = organization_guard(db, user, org_id, "manage_profile", lock=True)
            changes = data.model_dump(exclude_unset=True)
            if any(changes.get(k) is None for k in ("name", "contact_email") if k in changes):
                fail("invalid_input", 422)
            for key, value in changes.items():
                setattr(org, key, value)
            org.updated_at = now()
            catalog_audit(db, user, "organization.updated", org)
        return org

    @routes.get("/organizations/{org_id}/members", response_model=list[s.MemberDetail])
    def members(
        org_id: UUID,
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            organization_guard(db, user, org_id, "manage_staff")
            rows = db.execute(
                select(Member, User)
                .join(User, User.id == Member.user_id)
                .where(Member.organization_id == org_id)
                .order_by(Member.created_at, Member.id)
                .limit(limit)
                .offset(offset)
            )
            return [
                {
                    **record(member),
                    "display_name": person.display_name,
                    "email": person.email,
                    "capabilities": sorted(
                        capabilities(db, MemberPermission, MemberPermission.member_id, member.id)
                    ),
                }
                for member, person in rows
            ]

    @routes.put(
        "/organizations/{org_id}/members/{member_id}/permissions", response_model=s.OrgPermissions
    )
    def permissions(org_id: UUID, member_id: UUID, data: s.OrgPermissions, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = organization_guard(db, user, org_id, "owner", lock=True)
            member = db.scalar(
                select(Member).where(
                    Member.id == member_id,
                    Member.organization_id == org_id,
                    Member.status == "active",
                )
            )
            if not member:
                fail("member_not_found", 404)
            if member.user_id == org.owner_user_id:
                fail("owner_permissions_are_implicit", 409)
            set_capabilities(db, MemberPermission, "member_id", member.id, data.capabilities)
            catalog_audit(db, user, "organization.permissions_updated", org, target=member)
        return {"capabilities": sorted(set(data.capabilities))}

    @routes.delete("/organizations/{org_id}/members/{member_id}", response_model=s.CodeView)
    def revoke_member(org_id: UUID, member_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = organization_guard(db, user, org_id, "manage_staff", lock=True)
            member = db.scalar(
                select(Member).where(Member.id == member_id, Member.organization_id == org_id)
            )
            if not member:
                fail("member_not_found", 404)
            if member.user_id == org.owner_user_id:
                fail("cannot_revoke_owner", 409)
            # Only the owner can remove another workspace administrator.
            if user.id != org.owner_user_id and "manage_staff" in capabilities(
                db, MemberPermission, MemberPermission.member_id, member.id
            ):
                fail("permission_denied", 403)
            member.status, member.revoked_at = "revoked", member.revoked_at or now()
            db.execute(
                update(MemberPermission)
                .where(MemberPermission.member_id == member.id)
                .values(revoked_at=now())
            )
            assignments = select(EventStaff.id).where(EventStaff.member_id == member.id)
            db.execute(
                update(StaffPermission)
                .where(StaffPermission.event_staff_id.in_(assignments))
                .values(revoked_at=now())
            )
            db.execute(
                update(EventStaff).where(EventStaff.member_id == member.id).values(revoked_at=now())
            )
            catalog_audit(db, user, "organization.member_revoked", org, target=member)
        return {"code": "member_revoked"}

    @routes.post(
        "/organizations/{org_id}/invitations", status_code=201, response_model=s.InvitationView
    )
    def invite(org_id: UUID, data: s.Invite, request: Request, ids=Depends(principal)):
        rate_limit(factory, settings, request.client.host, "staff_invite", str(ids[0]))
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = organization_guard(db, user, org_id, "manage_staff", lock=True)
            db.execute(
                update(Invitation)
                .where(
                    Invitation.organization_id == org.id,
                    Invitation.email == data.email,
                    Invitation.accepted_at.is_(None),
                    Invitation.revoked_at.is_(None),
                )
                .values(revoked_at=now())
            )
            identifier = uuid4()
            invitation = Invitation(
                id=identifier,
                organization_id=org.id,
                email=data.email,
                invited_by_user_id=user.id,
                token_hash=digest(challenge_value(settings, "staff_invite", identifier)),
                expires_at=now() + timedelta(days=7),
            )
            db.add(invitation)
            db.add(
                OutboxJob(
                    kind="staff_invite_email",
                    deduplication_key=f"staff-invite:{identifier}",
                    payload={"version": 1, "invitation_id": str(identifier)},
                )
            )
            db.flush()
            catalog_audit(db, user, "organization.invitation_created", org, target=invitation)
            result = record(invitation, omit=("token_hash",))
        return result

    @routes.get("/organizations/{org_id}/invitations", response_model=list[s.InvitationView])
    def invitations(
        org_id: UUID,
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            organization_guard(db, user, org_id, "manage_staff")
            return [
                record(row, omit=("token_hash",))
                for row in db.scalars(
                    select(Invitation)
                    .where(Invitation.organization_id == org_id)
                    .order_by(Invitation.created_at.desc(), Invitation.id)
                    .limit(limit)
                    .offset(offset)
                )
            ]

    @routes.delete("/organizations/{org_id}/invitations/{invitation_id}", response_model=s.CodeView)
    def revoke_invite(org_id: UUID, invitation_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = organization_guard(db, user, org_id, "manage_staff", lock=True)
            invitation = db.scalar(
                select(Invitation).where(
                    Invitation.id == invitation_id, Invitation.organization_id == org.id
                )
            )
            if not invitation:
                fail("invitation_not_found", 404)
            if invitation.accepted_at:
                fail("invitation_already_accepted", 409)
            invitation.revoked_at = invitation.revoked_at or now()
            catalog_audit(db, user, "organization.invitation_revoked", org, target=invitation)
        return {"code": "invitation_revoked"}

    @routes.post("/staff-invitations/accept", response_model=s.MemberView)
    def accept(data: TokenInput, request: Request, ids=Depends(principal)):
        rate_limit(factory, settings, request.client.host, "staff_accept", str(ids[0]))
        identifier = token_id(data.token)
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            invitation = db.get(Invitation, identifier)
            if not invitation:
                fail("invalid_invitation", 400)
            org = db.scalar(
                select(Organization)
                .where(Organization.id == invitation.organization_id)
                .with_for_update()
            )
            invitation = db.scalar(
                select(Invitation)
                .where(Invitation.id == identifier)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if (
                org.status != "active"
                or invitation.revoked_at
                or invitation.accepted_at
                or invitation.expires_at <= now()
                or invitation.email != user.email
                or not hmac.compare_digest(invitation.token_hash, digest(data.token))
            ):
                fail("invalid_invitation", 400)
            inviter = db.get(User, invitation.invited_by_user_id)
            if inviter.status != "active":
                fail("invalid_invitation", 400)
            organization_guard(db, inviter, org.id, "manage_staff")
            member = db.scalar(
                select(Member).where(Member.organization_id == org.id, Member.user_id == user.id)
            )
            if not member:
                member = Member(organization_id=org.id, user_id=user.id)
                db.add(member)
            else:
                member.status, member.revoked_at = "active", None
            invitation.accepted_at, invitation.accepted_by_user_id = now(), user.id
            db.flush()
            catalog_audit(db, user, "organization.invitation_accepted", org, target=member)
            result = record(member)
        return result

    return routes
