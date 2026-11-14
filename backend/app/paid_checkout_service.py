"""Simulated paid orders (database specification TX-07/08/09).

Hold -> quote saved on a pending order -> payment intent and attempt -> provider result ->
fulfilment under the event lock with the same issuance code as free orders. Late, extra or
wrong-amount charges never issue tickets; they become refund obligations.
"""

from sqlalchemy import select

from .activation_service import paid_sales_status
from .campaign_service import (
    active_reservation,
    quote_still_valid,
    redeem,
    release_reservation,
    revalidate,
)
from .catalog_models import Allocation, Hold, Organization
from .catalog_service import catalog_audit
from .checkout_expiry import close_expired
from .checkout_models import TicketOrder
from .checkout_service import (
    add_items,
    confirm_free,
    held_allocations,
    issue_tickets,
    locked_hold,
    matched_recipients,
    new_order,
    saleable_event,
    saleable_types,
    same_recipients,
)
from .commerce_models import PaymentIntent
from .models import User
from .notification_service import enqueue_order_notice
from .payments_service import (
    ENVIRONMENT,
    TARGETS,
    audit,
    create_refund,
    latest_attempt,
    new_attempt,
)
from .pricing import PROCESSING_RATE_BPS, quote
from .security import fail, now


def start_checkout(db, settings, user, hold_id, data):
    event, hold, types = locked_hold(db, user, hold_id, with_types=True)
    existing = db.scalar(select(TicketOrder).where(TicketOrder.hold_id == hold.id))
    if existing:
        if not same_recipients(db, existing, data):
            fail("confirmation_conflict", 409)
        return existing
    if hold.status != "active" or hold.expires_at <= now():
        fail("hold_expired", 409)
    saleable_event(event)
    allocations = held_allocations(db, hold)
    matched_recipients(data, allocations)
    saleable_types(db, event, types)
    reservation = active_reservation(db, hold.id)
    if reservation:
        revalidate(db, reservation)
    snapshot = reservation.discount_snapshot if reservation else None
    totals, prices = quote(types, allocations, data, snapshot=snapshot)
    if totals["subtotal"] == 0:
        # A zero-total basket needs no payment (TX-07 hands it straight to TX-08).
        return confirm_free(db, settings, user, hold_id, data)
    order = new_order(db, event, hold, user, "pending", totals, PROCESSING_RATE_BPS, reservation)
    add_items(db, event, hold, order, data, allocations, types, prices)
    intent = PaymentIntent(
        event_id=event.id,
        order_id=order.id,
        payer_user_id=user.id,
        purpose="ticket_order",
        expected_minor=order.payable_minor,
        environment=ENVIRONMENT,
    )
    db.add(intent)
    db.flush()
    new_attempt(db, intent)
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "checkout.order_quoted", org, event, order)
    return order


def retry_payment(db, user, order_id):
    order = db.get(TicketOrder, order_id)
    if not order or order.buyer_user_id != user.id:
        fail("order_not_found", 404)
    event, hold, types = locked_hold(db, user, order.hold_id, with_types=True)
    order = db.scalar(
        select(TicketOrder)
        .where(TicketOrder.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order.status == "confirmed":
        return order
    if order.status != "pending" or hold.status != "active" or hold.expires_at <= now():
        # The saved quote has lapsed; a new hold and quote are needed, never a silent re-price.
        fail("quote_expired", 409)
    saleable_event(event)
    saleable_types(db, event, types)
    if order.campaign_id:
        reservation = active_reservation(db, hold.id)
        if not reservation:
            fail("promo_requote_required", 409)
        revalidate(db, reservation)
    intent = db.scalar(
        select(PaymentIntent).where(PaymentIntent.order_id == order.id).with_for_update()
    )
    latest = latest_attempt(db, intent.id)
    if not latest or latest.status == "failed":
        new_attempt(db, intent)
    return order


def on_sale(event):
    return (
        event.publication_state == "published"
        and event.moderation_state == "normal"
        and event.registration_opens_at <= now() < event.registration_closes_at
    )


def lock_order(db, event, intent):
    # Release overdue holds first, so a lapsed quote is seen as lapsed below.
    close_expired(db, event)
    hold_id = db.scalar(select(TicketOrder.hold_id).where(TicketOrder.id == intent.order_id))
    db.scalar(
        select(Hold)
        .where(Hold.id == hold_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return db.scalar(
        select(TicketOrder)
        .where(TicketOrder.id == intent.order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def order_paid(db, settings, event, order, intent, attempt, matches):
    if order.status == "confirmed":
        if order.fulfillment_payment_attempt_id != attempt.id:
            # A second successful charge never issues tickets or touches the legitimate ones.
            create_refund(db, event, attempt, "duplicate_charge")
        return
    if not matches:
        release_reservation(db, order.hold_id)
        create_refund(db, event, attempt, "blocked_fulfillment")
        return
    hold = db.get(Hold, order.hold_id)
    if order.status != "pending" or hold.status != "active" or hold.expires_at <= now():
        release_reservation(db, order.hold_id)
        create_refund(db, event, attempt, "late_payment")
        return
    allocations = list(
        db.scalars(
            select(Allocation)
            .where(Allocation.hold_id == hold.id)
            .order_by(Allocation.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if not allocations or any(row.state != "held" for row in allocations):
        release_reservation(db, order.hold_id)
        create_refund(db, event, attempt, "late_payment")
        return
    reservation = active_reservation(db, hold.id) if order.campaign_id else None
    # The charge matched the saved quote. A campaign that was disabled, ended or changed since
    # the quote means that price is no longer offered, and the buyer is never charged more
    # instead: no tickets, the allowance is released and the charge is refunded.
    if (
        not on_sale(event)
        or paid_sales_status(db, event.id) != "active"
        or (order.campaign_id and not quote_still_valid(db, reservation))
    ):
        release_reservation(db, order.hold_id)
        create_refund(db, event, attempt, "blocked_fulfillment")
        return
    order.status = "confirmed"
    order.confirmed_at = now()
    order.fulfillment_payment_attempt_id = attempt.id
    issue_tickets(db, settings, event, order, db.get(User, order.buyer_user_id))
    if reservation:
        redeem(db, order, reservation)
    audit(db, event, "checkout.order_paid", order, {"payable_minor": order.payable_minor})
    enqueue_order_notice(db, "purchase_confirmed", order, order.id)


def order_payment_failed(db, order, intent, attempt):
    # The order stays pending while its quote lasts, so the buyer can retry payment.
    if order.status == "pending":
        enqueue_order_notice(db, "payment_failed", order, attempt.id)


TARGETS["ticket_order"] = (lock_order, order_paid, order_payment_failed)
