"""BF-16 support rules: relationship-based access, idempotent messages, status and assignment.

Every mutation locks the case row, appends numbered history (`seq`), writes audit and
notification outbox rows in the same transaction, and does no external call. Live delivery and
email happen after commit.
"""

from uuid import UUID

from sqlalchemy import and_, func, or_, select, text, union

from .admin_models import PlatformAdmin
from .catalog_models import (
    Event,
    EventStaff,
    Member,
    Organization,
    StaffPermission,
)
from .catalog_service import event_caps, event_guard, organization_guard
from .checkout_models import OrderItem, Ticket, TicketOrder
from .file_models import StoredFile, SupportAttachment
from .models import AuditLog, OutboxJob, User
from .notification_service import enqueue_support_notice
from .security import fail, now
from .support_models import CaseChange, SupportCase, SupportMessage

MAX_RECIPIENTS = 25
OPEN_STATUSES = ("open", "in_progress", "waiting_for_customer")


# --- relationships -------------------------------------------------------------------------


def is_platform_admin(db, user):
    return (
        db.scalar(
            select(PlatformAdmin.id).where(
                PlatformAdmin.user_id == user.id, PlatformAdmin.revoked_at.is_(None)
            )
        )
        is not None
    )


def is_event_support(db, user, case):
    if case.case_kind != "attendee" or case.event_id is None:
        return False
    event = db.get(Event, case.event_id)
    org = db.get(Organization, event.organization_id)
    if org.status != "active":
        return False
    return "support" in event_caps(db, user, event)


def case_roles(db, user, case):
    """Current relationship of user to case. Assignment alone grants nothing."""
    roles = []
    if case.requester_user_id == user.id:
        roles.append("requester")
    if is_event_support(db, user, case):
        roles.append("support")
    if (case.case_kind == "organizer_platform" or case.escalated_at is not None) and (
        is_platform_admin(db, user)
    ):
        roles.append("platform")
    return roles


def get_case(db, user, case_id, lock=False):
    case = db.get(SupportCase, case_id)
    roles = case_roles(db, user, case) if case else []
    if not roles:
        # Knowing an identifier never reveals that a case exists.
        fail("case_not_found", 404)
    if lock:
        case = db.scalar(
            select(SupportCase)
            .where(SupportCase.id == case_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        roles = case_roles(db, user, case)
        if not roles:
            fail("case_not_found", 404)
    return case, roles


def require_staff(roles):
    if not ({"support", "platform"} & set(roles)):
        fail("permission_denied", 403)


def staff_case_filter(db, user):
    owned = select(Organization.id).where(
        Organization.owner_user_id == user.id, Organization.status == "active"
    )
    staffed = (
        select(EventStaff.event_id)
        .join(Member, Member.id == EventStaff.member_id)
        .join(StaffPermission, StaffPermission.event_staff_id == EventStaff.id)
        .join(Organization, Organization.id == Member.organization_id)
        .where(
            Member.user_id == user.id,
            Member.status == "active",
            Organization.status == "active",
            EventStaff.revoked_at.is_(None),
            StaffPermission.capability == "support",
            StaffPermission.revoked_at.is_(None),
        )
    )
    condition = and_(
        SupportCase.case_kind == "attendee",
        or_(
            SupportCase.organization_id.in_(owned),
            SupportCase.event_id.in_(staffed),
        ),
    )
    if is_platform_admin(db, user):
        condition = or_(
            condition,
            SupportCase.case_kind == "organizer_platform",
            SupportCase.escalated_at.is_not(None),
        )
    return condition


def staff_user_ids(db, case):
    """Users currently allowed to work the case as staff (bounded)."""
    ids = set()
    if case.case_kind == "attendee" and case.event_id:
        owner = select(Organization.owner_user_id).where(
            Organization.id == case.organization_id, Organization.status == "active"
        )
        staffed = (
            select(Member.user_id)
            .join(EventStaff, EventStaff.member_id == Member.id)
            .join(StaffPermission, StaffPermission.event_staff_id == EventStaff.id)
            .join(Organization, Organization.id == Member.organization_id)
            .where(
                EventStaff.event_id == case.event_id,
                Member.status == "active",
                Organization.status == "active",
                EventStaff.revoked_at.is_(None),
                StaffPermission.capability == "support",
                StaffPermission.revoked_at.is_(None),
            )
        )
        ids |= set(db.scalars(union(owner, staffed).limit(MAX_RECIPIENTS)))
    if case.case_kind == "organizer_platform" or case.escalated_at is not None:
        ids |= set(
            db.scalars(
                select(PlatformAdmin.user_id)
                .where(PlatformAdmin.revoked_at.is_(None))
                .order_by(PlatformAdmin.created_at, PlatformAdmin.id)
                .limit(MAX_RECIPIENTS)
            )
        )
    return ids


# --- persistence helpers -------------------------------------------------------------------


def support_audit(db, user, action, case, **change):
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=case.organization_id,
            event_id=case.event_id,
            action=action,
            entity_type="support_case",
            entity_id=case.id,
            description=action,
            safe_change={"case_id": str(case.id), **{k: str(v) for k, v in change.items()}},
            correlation_id=case.id,
        )
    )


def notify(db, case, actor, recipients, reason, ref_id):
    """Notification intent in the business transaction; the worker emails after commit."""
    for recipient in sorted(set(recipients) - {actor.id}, key=str)[:MAX_RECIPIENTS]:
        # In-app inbox entry (BF-15); the email below stays with the support worker.
        enqueue_support_notice(
            db,
            recipient_user_id=recipient,
            case_id=case.id,
            change="reply" if reason == "message" else "status",
            change_id=ref_id,
            event_id=case.event_id,
            status=case.status,
        )
        db.add(
            OutboxJob(
                event_id=case.event_id,
                kind="support_email",
                deduplication_key=f"support:{reason}:{ref_id}:{recipient}",
                payload={
                    "version": 1,
                    "case_id": str(case.id),
                    "recipient_user_id": str(recipient),
                    "reason": reason,
                },
            )
        )


def record_change(db, case, actor, kind, before, after, reason=None):
    case.last_seq += 1
    row = CaseChange(
        case_id=case.id,
        seq=case.last_seq,
        actor_user_id=actor.id,
        change_kind=kind,
        before_value=before,
        after_value=after,
        reason=reason,
    )
    case.updated_at = now()
    db.add(row)
    db.flush()
    return row


def add_message(db, case, author, client_message_id, body):
    case.last_seq += 1
    row = SupportMessage(
        case_id=case.id,
        seq=case.last_seq,
        author_user_id=author.id,
        client_message_id=client_message_id,
        body=body,
    )
    case.updated_at = now()
    db.add(row)
    db.flush()
    return row


def set_status(db, case, actor, status, reason):
    before = case.status
    case.status = status
    case.resolved_at = now() if status == "resolved" else None
    row = record_change(db, case, actor, "status", before, status, reason)
    support_audit(db, actor, "support.status_changed", case, before=before, after=status)
    return row


# --- views ---------------------------------------------------------------------------------


def people(db, ids):
    ids = {i for i in ids if i}
    rows = db.execute(select(User.id, User.display_name).where(User.id.in_(ids))) if ids else []
    return {row.id: {"id": row.id, "display_name": row.display_name} for row in rows}


def case_views(db, rows):
    """rows: [(case, roles)]."""
    named = people(
        db, [c.requester_user_id for c, _ in rows] + [c.assigned_to_user_id for c, _ in rows]
    )
    return [
        {
            "id": case.id,
            "kind": case.case_kind,
            "category": case.category,
            "subject": case.subject,
            "status": case.status,
            "requester": named[case.requester_user_id],
            "organization_id": case.organization_id,
            "event_id": case.event_id,
            "order_id": case.order_id,
            "ticket_id": case.ticket_id,
            "assigned_to": named.get(case.assigned_to_user_id),
            "escalated_at": case.escalated_at,
            "resolved_at": case.resolved_at,
            "last_seq": case.last_seq,
            "created_at": case.created_at,
            "updated_at": case.updated_at,
            "viewer_roles": roles,
        }
        for case, roles in rows
    ]


def attachment_views(db, message_ids):
    """Attachments of all given messages in one query, grouped by message id."""
    grouped = {}
    if not message_ids:
        return grouped
    rows = db.execute(
        select(SupportAttachment, StoredFile)
        .join(StoredFile, StoredFile.id == SupportAttachment.file_id)
        .where(SupportAttachment.message_id.in_(message_ids))
        .order_by(SupportAttachment.created_at, SupportAttachment.id)
    )
    for attachment, file in rows:
        grouped.setdefault(attachment.message_id, []).append(
            {
                "id": attachment.id,
                "file_id": file.id,
                "original_filename": attachment.original_filename,
                "mime_type": file.mime_type,
                "size_bytes": file.size_bytes,
                "created_at": attachment.created_at,
            }
        )
    return grouped


def linked_file_ids(db, message_id):
    return set(
        db.scalars(
            select(SupportAttachment.file_id).where(SupportAttachment.message_id == message_id)
        )
    )


def message_views(db, case, messages, replayed=False):
    named = people(db, [m.author_user_id for m in messages])
    attached = attachment_views(db, [m.id for m in messages])
    return [
        {
            "seq": m.seq,
            "type": "message",
            "id": m.id,
            "case_id": m.case_id,
            "author": named[m.author_user_id],
            "author_role": "requester" if m.author_user_id == case.requester_user_id else "support",
            "client_message_id": m.client_message_id,
            "body": m.body,
            "created_at": m.created_at,
            "replayed": replayed,
            "attachments": attached.get(m.id, []),
        }
        for m in messages
    ]


def change_views(db, changes):
    named = people(db, [c.actor_user_id for c in changes])
    return [
        {
            "seq": c.seq,
            "type": "change",
            "id": c.id,
            "case_id": c.case_id,
            "actor": named[c.actor_user_id],
            "change_kind": c.change_kind,
            "before_value": c.before_value,
            "after_value": c.after_value,
            "reason": c.reason,
            "created_at": c.created_at,
        }
        for c in changes
    ]


# --- operations ----------------------------------------------------------------------------


def resolve_attendee_context(db, user, data):
    order = ticket = None
    if data.order_id:
        order = db.get(TicketOrder, data.order_id)
        if not order or order.buyer_user_id != user.id:
            fail("order_not_found", 404)
    if data.ticket_id:
        ticket = db.get(Ticket, data.ticket_id)
        if not ticket or ticket.recipient_user_id != user.id:
            fail("ticket_not_found", 404)
    events = {x for x in (data.event_id, order and order.event_id, ticket and ticket.event_id) if x}
    if len(events) != 1:
        fail("context_mismatch", 422)
    if order and ticket:
        item = db.get(OrderItem, ticket.order_item_id)
        if item.order_id != order.id:
            fail("context_mismatch", 422)
    event_id = events.pop()
    if not (order or ticket):
        # Event-only cases need an event the caller may actually see.
        event_guard(db, user, event_id)
    event = db.get(Event, event_id)
    if not event:
        fail("event_not_found", 404)
    return event


def resolve_organizer_context(db, user, data):
    org = organization_guard(db, user, data.organization_id, "manage_profile")
    if data.event_id:
        event = event_guard(db, user, data.event_id)
        if event.organization_id != org.id:
            fail("event_not_found", 404)
        return org, event
    return org, None


def same_creation(case, first, data, attached):
    return (
        case.case_kind == data.kind
        and case.category == data.category
        and case.subject == data.subject.strip()
        and first.body == data.body.strip()
        and case.order_id == data.order_id
        and case.ticket_id == data.ticket_id
        and (data.event_id is None or case.event_id == data.event_id)
        and (data.kind == "attendee" or case.organization_id == data.organization_id)
        and attached == set(data.attachment_ids)
    )


def open_case(db, user, data):
    # Serializes concurrent retries of the same creation request.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"support-open:{user.id}:{data.client_message_id}"},
    )
    earlier = db.execute(
        select(SupportCase, SupportMessage)
        .join(SupportMessage, SupportMessage.case_id == SupportCase.id)
        .where(
            SupportCase.requester_user_id == user.id,
            SupportMessage.author_user_id == user.id,
            SupportMessage.client_message_id == data.client_message_id,
            SupportMessage.seq == 1,
        )
    ).first()
    if earlier:
        case, first = earlier
        if not same_creation(case, first, data, linked_file_ids(db, first.id)):
            fail("client_message_conflict", 409)
        return case, first, True
    if data.kind == "attendee":
        event = resolve_attendee_context(db, user, data)
        org = db.get(Organization, event.organization_id)
    else:
        org, event = resolve_organizer_context(db, user, data)
    case = SupportCase(
        requester_user_id=user.id,
        organization_id=org.id,
        event_id=event.id if event else None,
        order_id=data.order_id,
        ticket_id=data.ticket_id,
        case_kind=data.kind,
        category=data.category,
        subject=data.subject.strip(),
        status="open",
        last_seq=0,
    )
    db.add(case)
    db.flush()
    first = add_message(db, case, user, data.client_message_id, data.body.strip())
    support_audit(
        db, user, "support.case_opened", case, kind=case.case_kind, category=case.category
    )
    notify(db, case, user, staff_user_ids(db, case), "case_opened", case.id)
    return case, first, False


def post_message(db, user, case_id, data):
    get_case(db, user, case_id)
    case, roles = get_case(db, user, case_id, lock=True)
    body = data.body.strip()
    earlier = db.scalar(
        select(SupportMessage).where(
            SupportMessage.case_id == case.id,
            SupportMessage.author_user_id == user.id,
            SupportMessage.client_message_id == data.client_message_id,
        )
    )
    if earlier:
        if earlier.body != body or linked_file_ids(db, earlier.id) != set(data.attachment_ids):
            fail("client_message_conflict", 409)
        return case, roles, earlier, True
    requester_side = "requester" in roles
    if case.status == "resolved" and not requester_side:
        # Staff reply to a resolved case would silently hide it from the queue.
        fail("case_resolved", 409)
    if requester_side:
        # A requester reply reopens a resolved case and answers a request for information.
        if case.status == "resolved":
            set_status(db, case, user, "open", "requester_reply")
        elif case.status == "waiting_for_customer":
            set_status(db, case, user, "in_progress", "requester_reply")
    row = add_message(db, case, user, data.client_message_id, body)
    support_audit(db, user, "support.message_sent", case, message_id=row.id)
    if requester_side:
        recipients = {case.assigned_to_user_id} if case.assigned_to_user_id else None
        recipients = recipients or staff_user_ids(db, case)
    else:
        recipients = {case.requester_user_id, case.assigned_to_user_id} - {None}
    notify(db, case, user, recipients, "message", row.id)
    return case, roles, row, False


def change_status(db, user, case_id, data):
    get_case(db, user, case_id)
    case, roles = get_case(db, user, case_id, lock=True)
    require_staff(roles)
    if case.status == "resolved":
        fail("case_resolved", 409)
    if data.status == case.status:
        fail("status_unchanged", 409)
    row = set_status(db, case, user, data.status, data.reason)
    notify(
        db,
        case,
        user,
        {case.requester_user_id, case.assigned_to_user_id} - {None},
        "status",
        row.id,
    )
    return case, roles, row


def assign(db, user, case_id, data):
    get_case(db, user, case_id)
    case, roles = get_case(db, user, case_id, lock=True)
    require_staff(roles)
    if case.status == "resolved":
        fail("case_resolved", 409)
    if data.assignee_user_id == case.assigned_to_user_id:
        fail("assignment_unchanged", 409)
    if data.assignee_user_id:
        assignee = db.get(User, data.assignee_user_id)
        eligible = (
            assignee
            and assignee.status == "active"
            and assignee.email_verified_at is not None
            and {"support", "platform"} & set(case_roles(db, assignee, case))
        )
        if not eligible:
            # Assignee must hold a current support or platform relationship to this case.
            fail("assignee_not_eligible", 422)
    before = case.assigned_to_user_id
    case.assigned_to_user_id = data.assignee_user_id
    row = record_change(
        db,
        case,
        user,
        "assignment",
        str(before) if before else None,
        str(data.assignee_user_id) if data.assignee_user_id else None,
        data.reason,
    )
    support_audit(
        db, user, "support.assigned", case, before=before or "", after=data.assignee_user_id or ""
    )
    notify(
        db,
        case,
        user,
        ({data.assignee_user_id} if data.assignee_user_id else set()) | {case.requester_user_id},
        "assignment",
        row.id,
    )
    return case, roles, row


def escalate(db, user, case_id, data):
    get_case(db, user, case_id)
    case, roles = get_case(db, user, case_id, lock=True)
    if "support" not in roles:
        # Organizer staff escalate; the requester asks in the thread, the platform already has it.
        fail("permission_denied", 403)
    if case.case_kind != "attendee":
        fail("not_escalatable", 409)
    if case.escalated_at is not None:
        fail("already_escalated", 409)
    if case.status == "resolved":
        fail("case_resolved", 409)
    case.escalated_at = now()
    row = record_change(db, case, user, "escalation", None, "platform", data.reason)
    if case.assigned_to_user_id:
        # Organizer-side assignment does not carry over to the platform queue.
        before = case.assigned_to_user_id
        case.assigned_to_user_id = None
        record_change(db, case, user, "assignment", str(before), None, "escalated")
    support_audit(db, user, "support.escalated", case)
    notify(
        db, case, user, staff_user_ids(db, case) | {case.requester_user_id}, "escalation", row.id
    )
    return case, case_roles(db, user, case), row


def list_cases(db, user, view, status, category, event_id, limit, offset):
    query = select(SupportCase)
    if view == "queue":
        query = query.where(staff_case_filter(db, user))
    else:
        query = query.where(SupportCase.requester_user_id == user.id)
    if status:
        query = query.where(SupportCase.status == status)
    if category:
        query = query.where(SupportCase.category == category)
    if event_id:
        query = query.where(SupportCase.event_id == event_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    cases = db.scalars(
        query.order_by(SupportCase.updated_at.desc(), SupportCase.id).limit(limit).offset(offset)
    ).all()
    return total, [(c, case_roles(db, user, c)) for c in cases]


def updates(db, case, after, limit):
    """Messages and history after the cursor, merged in commit order."""
    messages = db.scalars(
        select(SupportMessage)
        .where(SupportMessage.case_id == case.id, SupportMessage.seq > after)
        .order_by(SupportMessage.seq)
        .limit(limit + 1)
    ).all()
    changes = db.scalars(
        select(CaseChange)
        .where(CaseChange.case_id == case.id, CaseChange.seq > after)
        .order_by(CaseChange.seq)
        .limit(limit + 1)
    ).all()
    items = sorted(
        message_views(db, case, messages) + change_views(db, changes), key=lambda i: i["seq"]
    )
    has_more = len(items) > limit
    items = items[:limit]
    return {
        "items": items,
        "next_after": items[-1]["seq"] if items else after,
        "has_more": has_more,
    }


def message_page(db, case, after, limit):
    rows = db.scalars(
        select(SupportMessage)
        .where(SupportMessage.case_id == case.id, SupportMessage.seq > after)
        .order_by(SupportMessage.seq)
        .limit(limit + 1)
    ).all()
    items = message_views(db, case, rows[:limit])
    return {
        "items": items,
        "next_after": items[-1]["seq"] if items else after,
        "has_more": len(rows) > limit,
    }


def parse_uuid(value):
    try:
        return UUID(str(value))
    except ValueError:
        return None
