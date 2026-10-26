"""Ticket PDF access and email delivery status/resend (BF-10)."""

from datetime import timedelta

from sqlalchemy import select

from .catalog_models import Event, Organization
from .catalog_service import catalog_audit
from .checkout_models import Ticket
from .checkout_service import qr_payload, ticket_rows
from .models import OutboxJob
from .security import fail, now
from .ticket_file_service import PDF_STATES, stored_ticket_pdf
from .ticket_pdf import render_ticket_pdf

RESEND_COOLDOWN = timedelta(seconds=60)
RESEND_LIMIT = 5
DELIVERY_KIND = "ticket_delivery_email"
JOB_STATUS = {"pending": "queued", "leased": "sending", "done": "delivered", "dead": "failed"}


def recipient_ticket(db, user, ticket_id):
    """The ticket row set for its claimed recipient; everyone else gets the same 404."""
    row = db.execute(
        ticket_rows(Ticket.id == ticket_id, Ticket.recipient_user_id == user.id)
    ).first()
    if not row:
        fail("ticket_not_found", 404)
    return row


def delivery_ticket(db, user, ticket_id, lock=False):
    """Buyer or claimed recipient of the ticket; others cannot tell it exists."""
    query = ticket_rows(Ticket.id == ticket_id)
    if lock:
        query = query.with_for_update(of=Ticket)
    row = db.execute(query).first()
    if not row or user.id not in (row[2].buyer_user_id, row[0].recipient_user_id):
        fail("ticket_not_found", 404)
    return row


def ticket_pdf(settings, ticket, item, order, db=None, storage=None):
    # Refunded, refund-pending and cancelled tickets get no document at all, so an old
    # download can never be re-issued as something that looks valid.
    if ticket.status not in PDF_STATES:
        fail("ticket_not_valid", 409)
    if db is not None and storage is not None:
        stored = stored_ticket_pdf(db, storage, ticket)
        if stored is not None:
            return stored
    return render_ticket_pdf(
        ticket=ticket,
        item=item,
        snapshot=order.event_snapshot,
        payload=qr_payload(settings, ticket.id),
    )


def delivery_jobs(db, ticket_id):
    return list(
        db.scalars(
            select(OutboxJob)
            .where(
                OutboxJob.kind == DELIVERY_KIND,
                OutboxJob.payload["ticket_id"].astext == str(ticket_id),
            )
            .order_by(OutboxJob.created_at.desc(), OutboxJob.id)
        )
    )


def delivery_view(db, ticket, item):
    jobs = delivery_jobs(db, ticket.id)
    latest = jobs[0] if jobs else None
    resends = max(0, len(jobs) - 1)
    next_at = latest.created_at + RESEND_COOLDOWN if latest else None
    delivered = [job.completed_at for job in jobs if job.status == "done"]
    return {
        "ticket_id": ticket.id,
        "ticket_status": ticket.status,
        "recipient_email": item.recipient_email,
        "status": JOB_STATUS[latest.status] if latest else "none",
        "attempt_count": latest.attempt_count if latest else 0,
        "last_error": latest.last_error if latest and latest.status != "done" else None,
        "last_delivered_at": max(delivered) if delivered else None,
        "resend_count": resends,
        "can_resend": (
            ticket.status == "valid"
            and resends < RESEND_LIMIT
            and (next_at is None or next_at <= now())
        ),
        "next_resend_at": next_at if next_at and next_at > now() else None,
    }


def resend_delivery(db, user, ticket_id):
    ticket, item, order = delivery_ticket(db, user, ticket_id, lock=True)
    # The row lock serializes concurrent resends so the count and cooldown are exact.
    db.refresh(ticket)
    if ticket.status != "valid":
        fail("ticket_not_valid", 409)
    jobs = delivery_jobs(db, ticket.id)
    if len(jobs) - 1 >= RESEND_LIMIT:
        fail("resend_limit_reached", 429)
    if jobs and jobs[0].created_at + RESEND_COOLDOWN > now():
        fail("resend_too_soon", 429)
    # Same ticket, same QR: only another email job is queued (no token rotation).
    db.add(
        OutboxJob(
            event_id=ticket.event_id,
            kind=DELIVERY_KIND,
            deduplication_key=f"ticket-delivery:{ticket.id}:resend:{len(jobs)}",
            payload={"version": 1, "ticket_id": str(ticket.id), "order_id": str(order.id)},
        )
    )
    event = db.get(Event, ticket.event_id)
    catalog_audit(
        db,
        user,
        "ticket.delivery_resent",
        db.get(Organization, event.organization_id),
        event,
        ticket,
    )
    db.flush()
    return ticket, item
