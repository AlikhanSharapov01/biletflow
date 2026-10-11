"""BF-11: signed-in attendee entry confirmations and manual attendee search."""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update

from .admission_models import CheckIn
from .catalog_models import Event
from .checkout_models import OrderItem, Ticket
from .models import AuthSession
from .offline_models import EntryConfirmation
from .security import derive, digest, fail, now
from .signing import ENTRY_PURPOSE, entry_token, key_id, read_entry_token

# Slack for comparing a device-reported capture time with server-issued timestamps.
OFFLINE_LEEWAY = timedelta(seconds=60)


def code_digest(settings, ticket_id, code):
    return derive(settings, "entry_code", f"{ticket_id}:{code}")


def issue_confirmation(db, settings, user, session_id, ticket_id):
    # Only the signed-in recipient may ask; anyone else learns nothing about the ticket.
    ticket = db.scalar(
        select(Ticket)
        .where(Ticket.id == ticket_id, Ticket.recipient_user_id == user.id)
        .with_for_update()
    )
    if not ticket:
        fail("ticket_not_found", 404)
    event = db.get(Event, ticket.event_id)
    if event.publication_state != "published" or event.moderation_state != "normal":
        fail("admission_closed", 409)
    if ticket.status != "valid":
        from fastapi import HTTPException

        code = "already_checked_in" if ticket.status == "checked_in" else "ticket_not_valid"
        raise HTTPException(409, detail={"code": code, "status": ticket.status})
    session = db.get(AuthSession, session_id)
    issued = now()
    # Whole seconds so the signed claim and the stored expiry agree exactly.
    expires_ts = int(
        min(
            issued + timedelta(seconds=settings.entry_confirmation_seconds), session.expires_at
        ).timestamp()
    )
    expires = datetime.fromtimestamp(expires_ts, UTC)
    if expires <= issued:
        fail("sign_in_required", 409)
    # A newer confirmation replaces any earlier one for this ticket.
    db.execute(
        update(EntryConfirmation)
        .where(
            EntryConfirmation.ticket_id == ticket.id,
            EntryConfirmation.consumed_at.is_(None),
            EntryConfirmation.revoked_at.is_(None),
        )
        .values(revoked_at=issued)
        .execution_options(synchronize_session=False)
    )
    identifier = uuid4()
    token = entry_token(
        settings,
        {
            "v": 1,
            "cid": str(identifier),
            "tid": str(ticket.id),
            "eid": str(ticket.event_id),
            "iat": int(issued.timestamp()),
            "exp": expires_ts,
        },
    )
    code = f"{secrets.randbelow(10**8):08d}"
    db.add(
        EntryConfirmation(
            id=identifier,
            ticket_id=ticket.id,
            event_id=ticket.event_id,
            attendee_user_id=user.id,
            session_id=session_id,
            token_hash=digest(token),
            code_hash=code_digest(settings, ticket.id, code),
            signing_key_id=key_id(settings, ENTRY_PURPOSE),
            expires_at=expires,
            created_at=issued,
        )
    )
    db.flush()
    return {
        "id": identifier,
        "ticket_id": ticket.id,
        "event_id": ticket.event_id,
        "token": token,
        "code": code,
        "issued_at": issued,
        "expires_at": expires,
        "expires_in_seconds": expires_ts - int(issued.timestamp()),
        "signing_key_id": key_id(settings, ENTRY_PURPOSE),
    }


def consume_confirmation(db, settings, ticket, token, code, *, captured_at=None):
    """Validate and consume the confirmation for this ticket, or fail with a stable code.

    Runs inside the admission transaction, so a failure rolls the admission back and a success
    commits admission and consumption together. ``captured_at`` is the device-reported time
    for an offline upload: expiry is then judged against it (with slack) and the live session
    check is skipped, because a disconnected device could not have known about a later logout.
    """
    if not token and not code:
        fail("sign_in_required", 409)
    row = None
    if token:
        claims = read_entry_token(settings, token)
        if not claims:
            fail("invalid_confirmation", 422)
        try:
            identifier = UUID(claims["cid"])
            bound = (UUID(claims["tid"]), UUID(claims["eid"]))
        except (KeyError, ValueError, TypeError):
            fail("invalid_confirmation", 422)
        if bound != (ticket.id, ticket.event_id):
            fail("invalid_confirmation", 409)
        row = db.get(EntryConfirmation, identifier)
        if not row or row.token_hash != digest(token):
            fail("invalid_confirmation", 422)
    else:
        row = db.scalar(
            select(EntryConfirmation)
            .where(
                EntryConfirmation.ticket_id == ticket.id,
                EntryConfirmation.code_hash == code_digest(settings, ticket.id, code),
            )
            .order_by(EntryConfirmation.created_at.desc())
            .limit(1)
        )
        if not row:
            fail("invalid_confirmation", 422)
    if row.attendee_user_id != ticket.recipient_user_id or row.event_id != ticket.event_id:
        fail("invalid_confirmation", 409)
    current = now()
    if row.consumed_at is not None or row.revoked_at is not None:
        fail("confirmation_used", 409)
    if captured_at is None:
        if row.expires_at <= current:
            fail("confirmation_expired", 409)
        session = db.get(AuthSession, row.session_id)
        if not session or session.revoked_at or session.expires_at <= current:
            fail("sign_in_required", 409)
    else:
        if captured_at > row.expires_at + OFFLINE_LEEWAY:
            fail("confirmation_expired", 409)
        if captured_at < row.created_at - OFFLINE_LEEWAY:
            fail("invalid_confirmation", 409)
    # The conditional update is the single-use guarantee, even for concurrent submissions.
    statement = (
        update(EntryConfirmation)
        .where(
            EntryConfirmation.id == row.id,
            EntryConfirmation.consumed_at.is_(None),
            EntryConfirmation.revoked_at.is_(None),
        )
        .values(consumed_at=current)
        .returning(EntryConfirmation.id)
        .execution_options(synchronize_session=False)
    )
    if captured_at is None:
        statement = statement.where(EntryConfirmation.expires_at > current)
    if not db.execute(statement).first():
        fail("confirmation_used", 409)
    return row


def like_escape(value):
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_attendees(db, event, query, limit):
    """Minimal attendee data for manual lookup: no email, order, payment or buyer details."""
    needle = query.strip()
    rows = db.execute(
        select(Ticket, OrderItem, CheckIn.id)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .outerjoin(CheckIn, (CheckIn.ticket_id == Ticket.id) & CheckIn.reversed_at.is_(None))
        .where(
            Ticket.event_id == event.id,
            or_(
                OrderItem.recipient_name.ilike(f"%{like_escape(needle)}%", escape="\\"),
                OrderItem.recipient_email == needle.lower(),
            ),
        )
        .order_by(OrderItem.recipient_name, Ticket.id)
        .limit(limit)
    )
    return [
        {
            "ticket_id": ticket.id,
            "attendee_name": item.recipient_name,
            "ticket_type_name": item.ticket_type_name,
            "seat": item.seat_snapshot,
            "status": ticket.status,
            "claimed": ticket.recipient_user_id is not None,
            "checked_in": ticket.status == "checked_in",
            "check_in_id": check_in_id,
        }
        for ticket, item, check_in_id in rows
    ]
