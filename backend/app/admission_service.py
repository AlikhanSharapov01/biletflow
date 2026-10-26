from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, union, update

from .admission_models import CheckIn, CheckInReversal
from .catalog_models import Event, EventStaff, Member, Organization, StaffPermission, Venue
from .catalog_service import catalog_audit, event_guard, event_record
from .checkout_models import OrderItem, Ticket
from .checkout_schemas import QR_PREFIX
from .entry_service import consume_confirmation, inspect_confirmation
from .offline_models import ScannerDevice
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


def ticket_by_id(db, event, ticket_id):
    # Manual check-in picks a ticket found by attendee search; the same rules apply afterwards.
    ticket = db.scalar(select(Ticket).where(Ticket.id == ticket_id, Ticket.event_id == event.id))
    if not ticket:
        fail("ticket_not_found", 404)
    return ticket


def scanner_device(db, user, device_id):
    device = db.scalar(
        select(ScannerDevice).where(
            ScannerDevice.id == device_id, ScannerDevice.owner_user_id == user.id
        )
    )
    if not device:
        fail("device_not_found", 404)
    if device.revoked_at is not None:
        fail("device_revoked", 403)
    return device


def ensure_claimed(ticket):
    if ticket.recipient_user_id is None:
        fail("ticket_unclaimed", 409)


def status_conflict(db, ticket):
    """The 409 for a ticket that is not valid: duplicate entry or unusable status."""
    if ticket.status == "checked_in":
        earlier = current_check_in(db, ticket.id)
        return HTTPException(
            409,
            detail={
                "code": "already_checked_in",
                "checked_in_at": earlier.accepted_at.isoformat() if earlier else None,
            },
        )
    return HTTPException(409, detail={"code": "ticket_not_valid", "status": ticket.status})


def check_in(db, settings, user, session_id, event_id, data):
    # Authorized scanners of an unpublished or cancelled event get admission_closed, not 404.
    event = event_guard(db, user, event_id, "scan")
    admission_open(event)
    ticket = (
        payload_ticket(db, data.qr_payload)
        if data.qr_payload
        else ticket_by_id(db, event, data.ticket_id)
    )
    if ticket.event_id != event.id:
        fail("wrong_event", 409)
    device = scanner_device(db, user, data.device_id) if data.device_id else None
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
    current = now()
    row = admit(
        db,
        settings,
        user,
        session_id,
        event,
        ticket,
        operation_id=data.operation_id or uuid4(),
        captured_at=data.captured_at or current,
        source="online",
        device_id=device.id if device else None,
        token=data.entry_confirmation,
        code=data.entry_code,
    )
    return result_view(db, row)


# Confirmation failure code -> VerificationResult.confirmation (sign_in_required is refined below).
CONFIRMATION_STATES = {
    "confirmation_expired": "expired",
    "confirmation_used": "used",
    "invalid_confirmation": "invalid",
}


def confirmation_state(error, token, code):
    reported = error.detail["code"]
    if reported == "sign_in_required":
        return "sign_in_required" if token or code else "missing"
    return CONFIRMATION_STATES[reported]


def verify(db, settings, user, event_id, data):
    """Preview what check_in would do for this ticket, without writing anything.

    Runs the same checks in the same order as check_in/admit and reports the code a real
    check-in would return as a 200 rejection. It is only a preview: it admits nobody, consumes
    no confirmation, and does not guarantee a later admission (another scanner may admit the
    ticket first, or the confirmation may expire in between). Malformed input and unknown
    resources keep their 4xx status.
    """
    event = event_guard(db, user, event_id, "scan")
    ticket, rejection, state = None, None, None
    try:
        admission_open(event)
        found = (
            payload_ticket(db, data.qr_payload)
            if data.qr_payload
            else ticket_by_id(db, event, data.ticket_id)
        )
        if found.event_id != event.id:
            fail("wrong_event", 409)
        ticket = found
        if data.device_id:
            scanner_device(db, user, data.device_id)
        ensure_claimed(ticket)
        if ticket.status != "valid":
            raise status_conflict(db, ticket)
    except HTTPException as error:
        if error.status_code != 409:
            raise
        rejection = error
    if ticket and settings.admission_require_entry_confirmation:
        # Checked even after an earlier rejection so the scanner sees the confirmation state,
        # but that rejection keeps its place in the order: duplicates come first.
        try:
            inspect_confirmation(db, settings, ticket, data.entry_confirmation, data.entry_code)
            state = "valid"
        except HTTPException as error:
            if rejection is None and error.status_code != 409:
                raise  # a malformed or forged token is bad input, not a verdict
            state = confirmation_state(error, data.entry_confirmation, data.entry_code)
            rejection = rejection or error
    elif ticket:
        state = "not_required"
    detail = rejection.detail if rejection else {}
    item = db.get(OrderItem, ticket.order_item_id) if ticket else None
    return {
        "result": "rejected" if rejection else "would_admit",
        "code": detail.get("code"),
        "ticket_id": ticket.id if ticket else None,
        "event_id": event.id,
        "attendee_name": item.recipient_name if item else None,
        "ticket_type_name": item.ticket_type_name if item else None,
        "seat": item.seat_snapshot if item else None,
        "ticket_status": ticket.status if ticket else None,
        "checked_in_at": detail.get("checked_in_at"),
        "confirmation": state,
        "checked_at": now(),
    }


def admit(
    db,
    settings,
    user,
    session_id,
    event,
    ticket,
    *,
    operation_id,
    captured_at,
    source,
    device_id=None,
    token=None,
    code=None,
    offline_capture=None,
):
    """Admit one ticket: the shared decision for online check-in and offline sync.

    Raises HTTPException with a stable code when the ticket cannot be admitted. The caller's
    transaction (or savepoint) then rolls back every write made here.
    """
    ensure_claimed(ticket)
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
        raise status_conflict(db, ticket)
    # Consumed in this same transaction: a rejected confirmation undoes the admission above.
    confirmation = None
    if settings.admission_require_entry_confirmation:
        confirmation = consume_confirmation(
            db, settings, ticket, token, code, captured_at=offline_capture
        )
    row = CheckIn(
        ticket_id=ticket.id,
        event_id=event.id,
        entry_confirmation_id=confirmation.id if confirmation else None,
        scanner_user_id=user.id,
        scanner_session_id=session_id,
        device_id=device_id,
        operation_id=operation_id,
        source=source,
        accepted_at=now(),
        captured_at=captured_at,
    )
    db.add(row)
    db.flush()
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "admission.checked_in", org, event, row)
    return row


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
    return apply_reversal(db, user, event, check_in_id, data.reason.strip())


def apply_reversal(db, user, event, check_in_id, reason):
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
