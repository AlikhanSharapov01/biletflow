"""SRS 4.9 / BF-13: organizer refunds, attendee requests and free cancellations.

A refund invalidates the tickets and quarantines their inventory in one transaction; the stock
returns only when the provider confirms success, so a seat cannot be resold while money is still
owed on it. Refunds are full-order only, matching the requirements baseline.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import select

from .catalog_models import Allocation, Event, Hold
from .catalog_service import changed, event_caps, event_guard
from .checkout_expiry import close_hold
from .checkout_models import OrderItem, Ticket, TicketOrder
from .commerce_models import PaymentAttempt, PaymentIntent, Refund
from .models import AuditLog
from .notification_service import enqueue_order_notice
from .payments_service import create_refund, refund_view
from .security import fail, now
from .support_models import SupportCase
from .support_schemas import CaseCreate
from .support_service import open_case

ORDER_REFUND_REASONS = ("voluntary", "event_cancelled")
DEFAULT_REQUEST_TEXT = "Refund requested for this order."


def lock_event(db, event_id):
    return db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def lock_order(db, order_id):
    return db.scalar(
        select(TicketOrder)
        .where(TicketOrder.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def staff_order(db, user, order_id, capability):
    """Answers 404/403 before any lock, then locks in hierarchy order."""
    row = db.get(TicketOrder, order_id)
    if not row:
        fail("order_not_found", 404)
    event_guard(db, user, row.event_id, capability)
    event = event_guard(db, user, row.event_id, capability, lock=True)
    return event, lock_order(db, order_id)


def buyer_order(db, user, order_id):
    row = db.get(TicketOrder, order_id)
    if not row or row.buyer_user_id != user.id:
        fail("order_not_found", 404)
    return lock_event(db, row.event_id), lock_order(db, order_id)


def locked_allocations(db, order):
    return list(
        db.scalars(
            select(Allocation)
            .join(OrderItem, OrderItem.allocation_id == Allocation.id)
            .where(OrderItem.order_id == order.id)
            .order_by(Allocation.id)
            .with_for_update(of=Allocation)
            .execution_options(populate_existing=True)
        )
    )


def locked_tickets(db, order):
    return list(
        db.scalars(
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == order.id)
            .order_by(Ticket.id)
            .with_for_update(of=Ticket)
            .execution_options(populate_existing=True)
        )
    )


def audit(db, user, event, action, target, note):
    db.add(
        AuditLog(
            actor_user_id=user.id,
            organization_id=event.organization_id,
            event_id=event.id,
            action=action,
            entity_type=target.__table__.name,
            entity_id=target.id,
            description=note or action,
            safe_change={"reason": note} if note else {},
            correlation_id=uuid4(),
        )
    )


def ensure_refund_policy(order):
    policy = order.policy_snapshot
    if not policy.get("refund_allowed"):
        fail("refund_not_allowed", 409)
    cutoff = policy.get("refund_cutoff_at")
    if cutoff and now() > datetime.fromisoformat(cutoff):
        fail("refund_cutoff_passed", 409)


def ensure_not_admitted(tickets):
    # An admitted attendee needs an authorized reversal before an ordinary refund or cancel.
    if any(ticket.status == "checked_in" for ticket in tickets):
        fail("ticket_checked_in", 409)


def fulfilled_refund(db, order):
    return db.scalar(
        select(Refund).where(Refund.payment_attempt_id == order.fulfillment_payment_attempt_id)
    )


def start_refund(db, event, order, user, reason, note):
    allocations = locked_allocations(db, order)
    tickets = locked_tickets(db, order)
    for allocation in allocations:
        if allocation.state == "sold":
            allocation.state = "refund_quarantine"
    for ticket in tickets:
        if ticket.status in ("valid", "checked_in"):
            ticket.status = "refund_pending"
    order.status = "refund_pending"
    attempt = db.get(PaymentAttempt, order.fulfillment_payment_attempt_id)
    refund = create_refund(db, event, attempt, reason, requested_by=user.id)
    refund.approved_by_user_id = user.id
    changed(event)
    audit(db, user, event, "order.refund_started", order, note)
    enqueue_order_notice(db, "refund_started", order, refund.id)
    return refund


def refund_result(db, order, refund):
    return {"order_id": order.id, "status": order.status, "refund": refund_view(db, refund)}


def refund_order(db, user, order_id, note):
    event, order = staff_order(db, user, order_id, "refund")
    if order.status in ("refund_pending", "refunded"):
        # A repeated submit returns the one existing refund and never starts a second.
        return refund_result(db, order, fulfilled_refund(db, order))
    if order.status != "confirmed":
        fail("order_not_refundable", 409)
    if order.payable_minor == 0:
        fail("free_order_use_cancel", 409)
    ensure_refund_policy(order)
    ensure_not_admitted(locked_tickets(db, order))
    return refund_result(db, order, start_refund(db, event, order, user, "voluntary", note))


def request_refund(db, user, order_id, note):
    """An attendee asks; only authorized staff can approve, through the order's support case."""
    event, order = buyer_order(db, user, order_id)
    if order.status != "confirmed":
        fail("order_not_refundable", 409)
    if order.payable_minor == 0:
        fail("free_order_use_cancel", 409)
    ensure_refund_policy(order)
    ensure_not_admitted(locked_tickets(db, order))
    existing = db.scalar(
        select(SupportCase).where(
            SupportCase.order_id == order.id,
            SupportCase.requester_user_id == user.id,
            SupportCase.category == "refund",
            SupportCase.status != "resolved",
        )
    )
    if existing:
        return {"order_id": order.id, "status": "requested", "case_id": existing.id}
    case, _, _ = open_case(
        db,
        user,
        CaseCreate(
            kind="attendee",
            category="refund",
            subject=f"Refund request: {order.event_snapshot['title']}"[:200],
            body=note or DEFAULT_REQUEST_TEXT,
            client_message_id=uuid4(),
            order_id=order.id,
        ),
    )
    audit(db, user, event, "order.refund_requested", order, note)
    return {"order_id": order.id, "status": "requested", "case_id": case.id}


def cancel_tickets(db, order, tickets):
    """Invalidate these tickets of a zero-value order and return their stock immediately."""
    current = now()
    ids = {ticket.order_item_id for ticket in tickets}
    items = {item.id: item for item in db.scalars(select(OrderItem).where(OrderItem.id.in_(ids)))}
    allocation_ids = {items[item_id].allocation_id for item_id in ids}
    for allocation in locked_allocations(db, order):
        if allocation.id in allocation_ids and allocation.state == "sold":
            allocation.state = "released"
            allocation.released_at = current
            allocation.release_reason = "free_cancel"
    for ticket in tickets:
        ticket.status = "cancelled"
    if all(ticket.status == "cancelled" for ticket in locked_tickets(db, order)):
        order.status = "cancelled"


def cancel_order(db, user, order_id, note):
    event, order = buyer_order(db, user, order_id)
    if order.status == "cancelled":
        return order
    if order.status != "confirmed":
        fail("order_not_cancellable", 409)
    if order.payable_minor > 0:
        fail("full_order_refund_required", 409)
    tickets = locked_tickets(db, order)
    ensure_not_admitted(tickets)
    active = [ticket for ticket in tickets if ticket.status == "valid"]
    cancel_tickets(db, order, active)
    changed(event)
    audit(db, user, event, "order.cancelled", order, note)
    enqueue_order_notice(db, "order_cancelled", order, order.id)
    return order


def cancel_ticket(db, user, event_id, ticket_id, note):
    event_guard(db, user, event_id, "attendees")
    event = event_guard(db, user, event_id, "attendees", lock=True)
    found = db.scalar(select(Ticket).where(Ticket.id == ticket_id, Ticket.event_id == event.id))
    if not found:
        fail("ticket_not_found", 404)
    item = db.get(OrderItem, found.order_item_id)
    order = lock_order(db, item.order_id)
    ticket = db.scalar(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if ticket.status != "cancelled":
        if order.payable_minor > 0:
            # Refunds are whole-order; cancelling one paid ticket would strand its money.
            fail("full_order_refund_required", 409)
        ensure_not_admitted([ticket])
        if ticket.status != "valid":
            fail("ticket_not_valid", 409)
        cancel_tickets(db, order, [ticket])
        changed(event)
        audit(db, user, event, "ticket.cancelled", ticket, note)
        enqueue_order_notice(db, "order_cancelled", order, ticket.id)
        if ticket.recipient_user_id and ticket.recipient_user_id != order.buyer_user_id:
            enqueue_order_notice(db, "order_cancelled", order, ticket.id, ticket.recipient_user_id)
    return {"ticket_id": ticket.id, "order_id": order.id, "status": ticket.status}


def settle_event_cancellation(db, user, event):
    """Close sales and invalidate every sold ticket; paid orders go to the refund queue.

    The caller holds the event lock and has already checked permission to cancel the event.
    """
    orders = list(
        db.scalars(
            select(TicketOrder)
            .where(TicketOrder.event_id == event.id, TicketOrder.status == "confirmed")
            .order_by(TicketOrder.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if any(order.payable_minor > 0 for order in orders) and "refund" not in event_caps(
        db, user, event
    ):
        fail("permission_denied", 403)
    holds = list(
        db.scalars(
            select(Hold)
            .where(Hold.event_id == event.id, Hold.status == "active")
            .order_by(Hold.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    for hold in holds:
        close_hold(db, hold, "released", "abandoned")
    for order in orders:
        if order.payable_minor > 0:
            start_refund(db, event, order, user, "event_cancelled", None)
        else:
            tickets = locked_tickets(db, order)
            cancel_tickets(
                db, order, [row for row in tickets if row.status in ("valid", "checked_in")]
            )


def refund_succeeded(db, event, refund):
    """Provider confirmed the money returned. Runs once, on the refund's transition to success."""
    if refund.reason in ORDER_REFUND_REASONS:
        order = db.scalar(
            select(TicketOrder)
            .where(
                TicketOrder.fulfillment_payment_attempt_id == refund.payment_attempt_id,
                TicketOrder.status == "refund_pending",
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if order:
            current = now()
            for allocation in locked_allocations(db, order):
                if allocation.state == "refund_quarantine":
                    allocation.state = "released"
                    allocation.released_at = current
                    allocation.release_reason = "refund_succeeded"
            for ticket in locked_tickets(db, order):
                if ticket.status == "refund_pending":
                    ticket.status = "refunded"
            order.status = "refunded"
            changed(event)
    attempt = db.get(PaymentAttempt, refund.payment_attempt_id)
    intent = db.get(PaymentIntent, attempt.intent_id)
    if intent.order_id:
        enqueue_order_notice(
            db, "refund_completed", db.get(TicketOrder, intent.order_id), refund.id
        )
