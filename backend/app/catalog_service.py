from uuid import uuid4

from sqlalchemy import func, select

from .catalog_models import (
    AccessGrant,
    Allocation,
    Event,
    EventStaff,
    Member,
    MemberPermission,
    Organization,
    StaffPermission,
)
from .models import AuditLog
from .security import fail, now


def record(row, omit=()):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name not in omit}


def event_record(event):
    result = record(event)
    current = now()
    result["time_status"] = (
        "completed"
        if current >= event.ends_at
        else "active"
        if current >= event.starts_at
        else "upcoming"
    )
    return result


def capabilities(db, model, field, identifier):
    return set(
        db.scalars(select(model.capability).where(field == identifier, model.revoked_at.is_(None)))
    )


def organization_guard(db, user, org_id, capability=None, lock=False):
    query = select(Organization).where(Organization.id == org_id)
    org = db.scalar(
        query.with_for_update().execution_options(populate_existing=True) if lock else query
    )
    if not org or org.status != "active":
        fail("organization_not_found", 404)
    if org.owner_user_id == user.id:
        return org
    member = db.scalar(
        select(Member).where(
            Member.organization_id == org_id, Member.user_id == user.id, Member.status == "active"
        )
    )
    if not member:
        fail("organization_not_found", 404)
    if capability == "owner" or (
        capability
        and capability
        not in capabilities(db, MemberPermission, MemberPermission.member_id, member.id)
    ):
        fail("permission_denied", 403)
    return org


def event_caps(db, user, event):
    org = db.get(Organization, event.organization_id)
    if org.owner_user_id == user.id:
        return {
            "event_edit",
            "attendees",
            "support",
            "reports",
            "refund",
            "scan",
            "reverse_checkin",
            "staff",
        }
    member = db.scalar(
        select(Member).where(
            Member.organization_id == org.id, Member.user_id == user.id, Member.status == "active"
        )
    )
    if not member:
        return set()
    staff = db.scalar(
        select(EventStaff).where(
            EventStaff.event_id == event.id,
            EventStaff.member_id == member.id,
            EventStaff.revoked_at.is_(None),
        )
    )
    return (
        capabilities(db, StaffPermission, StaffPermission.event_staff_id, staff.id)
        if staff
        else set()
    )


def event_guard(db, user, event_id, capability=None, lock=False):
    event = db.get(Event, event_id)
    if not event:
        fail("event_not_found", 404)
    if lock:
        organization_guard(db, user, event.organization_id, lock=True)
        event = db.scalar(
            select(Event)
            .where(Event.id == event_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    org = db.get(Organization, event.organization_id)
    if not org or org.status != "active":
        fail("event_not_found", 404)
    caps = event_caps(db, user, event) if user else set()
    if capability:
        if not caps:
            fail("event_not_found", 404)
        if capability not in caps:
            fail("permission_denied", 403)
    elif not caps:
        if event.publication_state != "published" or event.moderation_state != "normal":
            fail("event_not_found", 404)
        if event.visibility == "private":
            grant = (
                db.scalar(
                    select(AccessGrant.id).where(
                        AccessGrant.event_id == event.id,
                        AccessGrant.user_id == user.id,
                        AccessGrant.revoked_at.is_(None),
                    )
                )
                if user
                else None
            )
            if not grant:
                fail("event_not_found", 404)
    return event


def catalog_audit(db, user, action, org, event=None, target=None):
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=org.id,
            event_id=event.id if event else None,
            action=action,
            entity_type=target.__table__.name if target else "event" if event else "organization",
            entity_id=target.id if target else event.id if event else org.id,
            description=action,
            correlation_id=uuid4(),
        )
    )


def set_capabilities(db, model, field_name, identifier, desired):
    field = getattr(model, field_name)
    existing = {row.capability: row for row in db.scalars(select(model).where(field == identifier))}
    for cap, row in existing.items():
        row.revoked_at = None if cap in desired else row.revoked_at or now()
    for cap in set(desired) - existing.keys():
        db.add(model(**{field_name: identifier, "capability": cap}))


def active_allocations(db, event_id, type_id=None, seat_id=None):
    query = select(func.count(Allocation.id)).where(
        Allocation.event_id == event_id, Allocation.state.in_(["held", "sold", "refund_quarantine"])
    )
    if type_id:
        query = query.where(Allocation.ticket_type_id == type_id)
    if seat_id:
        query = query.where(Allocation.event_seat_id == seat_id)
    return db.scalar(query)


def editable(event):
    if event.publication_state == "cancelled" or event.moderation_state != "normal":
        fail("event_not_editable", 409)


def changed(event):
    event.updated_at = now()
    event.availability_version += 1
