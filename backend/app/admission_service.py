from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, union, update

from .admission_models import CheckIn, CheckInReversal
from .catalog_models import Event, EventStaff, Member, Organization, StaffPermission, Venue
from .catalog_service import catalog_audit, event_guard, event_record
from .checkout_models import OrderItem, Ticket
from .checkout_schemas import QR_PREFIX
from .security import digest, fail, now


def scanner_event_query(user):
    owned = (
        select(Event.id)
        .join(Organization, Organization.id == Event.organization_id)
        .where(Organization.owner_user_id == user.id)
    )
    staffed = (
        select(EventStaff.event_id)
        .join(Member, Member.id == EventStaff.member_id)
        .join(StaffPermission, StaffPermission.event_staff_id == EventStaff.id)
        .where(
            Member.user_id == user.id,
            Member.status == "active",
            EventStaff.revoked_at.is_(None),
            StaffPermission.capability == "scan",
            StaffPermission.revoked_at.is_(None),
        )
    )
    return (
        select(Event, Venue)
        .join(Venue, Venue.id == Event.venue_id)
        .join(Organization, Organization.id == Event.organization_id)
        .where(
            Event.id.in_(union(owned, staffed).scalar_subquery()),
            Event.publication_state == "published",
            Organization.status == "active",
        )
    )


def scanner_event_view(event, venue):
    record = event_record(event)
    return {
        **{key: record[key] for key in ("id", "title", "starts_at", "ends_at", "time_zone")},
        "admission_opens_at": event.admission_opens_at,
        "admission_closes_at": event.admission_closes_at,
        "time_status": record["time_status"],
        "venue": {"name": venue.name, "address": venue.address, "city": venue.city},
    }


def scanner_event(db, user, event_id):
    event = event_guard(db, user, event_id, "scan")
    if event.publication_state != "published":
        fail("event_not_found", 404)
    return event


def admission_open(event):
    if event.publication_state != "published" or event.moderation_state != "normal":
        fail("admission_closed", 409)
    current = now()
    if current < event.admission_opens_at:
        fail("admission_not_open", 409)
    if current >= event.admission_closes_at:
        fail("admission_closed", 409)


def payload_ticket(db, payload):
    # Campaign QR codes and any other strings are rejected before any ticket lookup.
    if not payload.startswith(QR_PREFIX):
        fail("not_a_ticket_qr", 422)
    # Only the HMAC digest is stored, so a forged or edited payload simply matches nothing.
    ticket = db.scalar(
        select(Ticket).where(Ticket.qr_token_hash == digest(payload.removeprefix(QR_PREFIX)))
    )
    if not ticket:
        fail("ticket_not_found", 404)
    return ticket


def result_view(db, check_in, replayed=False):
    ticket = db.get(Ticket, check_in.ticket_id)
    item = db.get(OrderItem, ticket.order_item_id)
    return {
        "result": "admitted",
        "check_in_id": check_in.id,
        "ticket_id": ticket.id,
        "event_id": check_in.event_id,
        "attendee_name": item.recipient_name,
        "ticket_type_name": item.ticket_type_name,
        "seat": item.seat_snapshot,
        "checked_in_at": check_in.accepted_at,
        "replayed": replayed,
    }


def current_check_in(db, ticket_id):
    return db.scalar(
        select(CheckIn).where(CheckIn.ticket_id == ticket_id, CheckIn.reversed_at.is_(None))
    )


def check_in(db, user, session_id, event_id, data):
    # Authorized scanners of an unpublished or cancelled event get admission_closed, not 404.
    event = event_guard(db, user, event_id, "scan")
    admission_open(event)
    ticket = payload_ticket(db, data.qr_payload)
    if ticket.event_id != event.id:
        fail("wrong_event", 409)
    if data.operation_id:
        earlier = db.scalar(
            select(CheckIn).where(
                CheckIn.scanner_user_id == user.id, CheckIn.operation_id == data.operation_id
            )
        )
        if earlier:
            # A retried request returns its original outcome; reusing the key elsewhere fails.
            # A key whose admission was reversed is spent: it must not report "admitted" again.
            if earlier.ticket_id != ticket.id or earlier.reversed_at is not None:
                fail("operation_conflict", 409)
            return result_view(db, earlier, replayed=True)
    if ticket.recipient_user_id is None:
        fail("ticket_unclaimed", 409)
    # One conditional update is the whole admission decision: of two racing scanners,
    # PostgreSQL lets only the first move the ticket from valid to checked_in.
    admitted = db.execute(
        update(Ticket)
        .where(Ticket.id == ticket.id, Ticket.status == "valid")
        .values(status="checked_in")
        .returning(Ticket.id)
        .execution_options(synchronize_session=False)
    ).first()
    if not admitted:
        db.refresh(ticket)
        if ticket.status == "checked_in":
            earlier = current_check_in(db, ticket.id)
            raise HTTPException(
                409,
                detail={
                    "code": "already_checked_in",
                    "checked_in_at": earlier.accepted_at.isoformat() if earlier else None,
                },
            )
        raise HTTPException(409, detail={"code": "ticket_not_valid", "status": ticket.status})
    current = now()
    row = CheckIn(
        ticket_id=ticket.id,
        event_id=event.id,
        scanner_user_id=user.id,
        scanner_session_id=session_id,
        operation_id=data.operation_id or uuid4(),
        source="online",
        accepted_at=current,
        captured_at=data.captured_at or current,
    )
    db.add(row)
    db.flush()
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "admission.checked_in", org, event, row)
    return result_view(db, row)


def reverse(db, user, check_in_id, data):
    row = db.get(CheckIn, check_in_id)
    if not row:
        fail("check_in_not_found", 404)
    try:
        event = event_guard(db, user, row.event_id, "reverse_checkin")
    except HTTPException as error:
        # Outsiders must not learn that a check-in id exists.
        if error.status_code == 404:
            fail("check_in_not_found", 404)
        raise
    # Lock only after authorization so outsiders cannot block scanners on this row.
    row = db.scalar(
        select(CheckIn)
        .where(CheckIn.id == check_in_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row.reversed_at is not None:
        fail("already_reversed", 409)
    row.reversed_at = now()
    reason = data.reason.strip()
    db.add(CheckInReversal(check_in_id=row.id, actor_user_id=user.id, reason=reason))
    # A ticket refunded or cancelled after entry keeps that status; only checked_in reopens.
    db.execute(
        update(Ticket)
        .where(Ticket.id == row.ticket_id, Ticket.status == "checked_in")
        .values(status="valid")
        .execution_options(synchronize_session=False)
    )
    db.flush()
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "admission.reversed", org, event, row)
    status = db.scalar(select(Ticket.status).where(Ticket.id == row.ticket_id))
    return {
        "check_in_id": row.id,
        "ticket_id": row.ticket_id,
        "ticket_status": status,
        "reversed_at": row.reversed_at,
        "reason": reason,
    }


def counts(db, event):
    registered, admitted = db.execute(
        select(
            func.count().filter(Ticket.status.in_(["valid", "checked_in"])),
            func.count().filter(Ticket.status == "checked_in"),
        ).where(Ticket.event_id == event.id)
    ).one()
    return {"event_id": event.id, "registered": registered, "admitted": admitted}
