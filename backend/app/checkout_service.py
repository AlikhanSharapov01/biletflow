from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .activation_service import paid_sales_status
from .catalog_models import Allocation, Event, EventSeat, Hold, Organization, TicketType, Venue
from .catalog_service import active_allocations, catalog_audit, changed, event_guard
from .checkout_expiry import close_expired, close_hold
from .checkout_models import OrderItem, Ticket, TicketOrder
from .checkout_schemas import HOLD_MINUTES, MAX_ACTIVE_HOLDS, QR_PREFIX, QR_PURPOSE
from .commerce_models import PaymentAttempt, PaymentIntent, Refund
from .models import OutboxJob
from .notification_service import enqueue_ticket_delivered
from .payments_service import attempt_view, latest_attempt, refund_view
from .security import challenge_value, digest, fail, now


def qr_payload(settings, ticket_id):
    return QR_PREFIX + challenge_value(settings, QR_PURPOSE, ticket_id)


def buyer_event(db, user, event_id):
    # Lock hierarchy (database specification, section 4): request key, user/session,
    # organization, event, ticket types, holds, order, allocations, tickets. The
    # organization is share-locked so buyers of different events do not queue behind
    # each other, while suspension or access changes still wait for this transaction.
    event = db.get(Event, event_id)
    if not event:
        fail("event_not_found", 404)
    db.scalar(
        select(Organization)
        .where(Organization.id == event.organization_id)
        .with_for_update(read=True)
        .execution_options(populate_existing=True)
    )
    db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    # Visibility, organization status and private access are rechecked under the locks.
    return event_guard(db, user, event_id)


def saleable_event(event):
    if (
        event.publication_state != "published"
        or event.moderation_state != "normal"
        or not event.registration_opens_at <= now() < event.registration_closes_at
    ):
        fail("event_not_on_sale", 409)


def lock_types(db, event, type_ids):
    rows = {}
    for type_id in sorted(type_ids):
        rows[type_id] = db.scalar(
            select(TicketType)
            .where(TicketType.id == type_id, TicketType.event_id == event.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    return rows


def is_paid(ticket):
    return ticket.kind != "free" or ticket.price_minor != 0


def saleable_types(db, event, rows):
    paid_status = None
    for ticket in rows.values():
        if not ticket or ticket.is_hidden:
            fail("ticket_type_unavailable", 409)
        if is_paid(ticket):
            paid_status = paid_status or paid_sales_status(db, event.id)
            if paid_status != "active":
                fail("paid_sales_inactive", 409)
        if not ticket.sales_open_at <= now() < ticket.sales_close_at:
            fail("sales_window_closed", 409)
    return rows


def hold_request(event_id, data):
    # Normalized basket used for the Idempotency-Key fingerprint.
    lines = sorted(
        (str(line.ticket_type_id), line.quantity, sorted(str(seat) for seat in line.seat_ids))
        for line in data.items
    )
    return {"event_id": str(event_id), "items": [list(line) for line in lines]}


def create_hold(db, user, event_id, data):
    event = buyer_event(db, user, event_id)
    saleable_event(event)
    requested = {}
    seats = []
    for line in data.items:
        requested[line.ticket_type_id] = requested.get(line.ticket_type_id, 0) + line.quantity
        if event.seating_mode == "assigned":
            if not line.seat_ids:
                fail("seats_required", 422)
            seats.extend(line.seat_ids)
        elif line.seat_ids:
            fail("seats_not_applicable", 422)
    if len(seats) != len(set(seats)):
        fail("duplicate_seat_selection", 422)
    types = saleable_types(db, event, lock_types(db, event, requested))
    close_expired(db, event)
    previous = list(
        db.scalars(
            select(Hold)
            .where(
                Hold.event_id == event.id,
                Hold.buyer_user_id == user.id,
                Hold.status == "active",
            )
            .order_by(Hold.id)
            .with_for_update()
        )
    )
    for hold in previous:
        close_hold(db, hold, "released", "abandoned")
    if previous:
        changed(event)
    # Overdue holds on other events wait for the sweeper; they must not block this buyer.
    live_count = db.scalar(
        select(func.count(Hold.id)).where(
            Hold.buyer_user_id == user.id, Hold.status == "active", Hold.expires_at > now()
        )
    )
    if live_count >= MAX_ACTIVE_HOLDS:
        fail("too_many_active_holds", 409)
    total = sum(requested.values())
    remaining_event = event.capacity - active_allocations(db, event.id)
    if total > remaining_event:
        fail("event_capacity_exceeded", 409)
    for type_id, quantity in requested.items():
        ticket = types[type_id]
        if quantity > ticket.per_order_limit:
            fail("per_order_limit_exceeded", 409)
        if quantity > ticket.quantity_limit - active_allocations(db, event.id, type_id):
            fail("ticket_capacity_exceeded", 409)
    if event.seating_mode == "assigned":
        for line in data.items:
            for seat_id in line.seat_ids:
                seat = db.scalar(
                    select(EventSeat).where(EventSeat.id == seat_id, EventSeat.event_id == event.id)
                )
                if (
                    not seat
                    or seat.is_blocked
                    or seat.ticket_type_id != line.ticket_type_id
                    or active_allocations(db, event.id, seat_id=seat.id)
                ):
                    fail("seat_unavailable", 409)
    hold = Hold(
        event_id=event.id,
        buyer_user_id=user.id,
        expires_at=now() + timedelta(minutes=HOLD_MINUTES),
    )
    db.add(hold)
    db.flush()
    try:
        for line in data.items:
            for index in range(line.quantity):
                seat_id = line.seat_ids[index] if line.seat_ids else None
                db.add(
                    Allocation(
                        event_id=event.id,
                        hold_id=hold.id,
                        ticket_type_id=line.ticket_type_id,
                        event_seat_id=seat_id,
                    )
                )
        db.flush()
    except IntegrityError:
        fail("seat_unavailable", 409)
    changed(event)
    catalog_audit(
        db,
        user,
        "checkout.hold_created",
        db.get(Organization, event.organization_id),
        event,
        hold,
    )
    return hold


def hold_view(db, hold):
    allocations = [
        {
            "id": row.id,
            "ticket_type_id": row.ticket_type_id,
            "event_seat_id": row.event_seat_id,
            "state": row.state,
        }
        for row in db.scalars(
            select(Allocation)
            .where(Allocation.hold_id == hold.id)
            .order_by(Allocation.created_at, Allocation.id)
        )
    ]
    return {
        "id": hold.id,
        "event_id": hold.event_id,
        "buyer_user_id": hold.buyer_user_id,
        "status": hold.status,
        "expires_at": hold.expires_at,
        "created_at": hold.created_at,
        "allocations": allocations,
    }


def owned_hold(db, user, hold_id, lock=False):
    query = select(Hold).where(Hold.id == hold_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    hold = db.scalar(query)
    if not hold or hold.buyer_user_id != user.id:
        fail("hold_not_found", 404)
    return hold


def locked_hold(db, user, hold_id, with_types=False):
    # Read ids unlocked (they never change), then take locks in hierarchy order:
    # organization/event, ticket types, holds, allocations.
    event = buyer_event(db, user, owned_hold(db, user, hold_id).event_id)
    types = {}
    if with_types:
        type_ids = set(
            db.scalars(select(Allocation.ticket_type_id).where(Allocation.hold_id == hold_id))
        )
        types = lock_types(db, event, type_ids)
    close_expired(db, event)
    return event, owned_hold(db, user, hold_id, lock=True), types


def confirm_request(hold_id, data):
    # Normalized recipients used for the Idempotency-Key fingerprint and replay checks.
    return {
        "hold_id": str(hold_id),
        "recipients": sorted(
            [str(row.allocation_id), row.name.strip(), row.email] for row in data.recipients
        ),
    }


def same_recipients(db, order, data):
    stored = sorted(
        [str(item.allocation_id), item.recipient_name, item.recipient_email]
        for item in db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))
    )
    return stored == confirm_request(order.hold_id, data)["recipients"]


def release(db, user, hold_id):
    event, hold, _ = locked_hold(db, user, hold_id)
    if hold.status == "consumed":
        fail("hold_already_consumed", 409)
    if hold.status == "active":
        close_hold(db, hold, "released", "abandoned")
        changed(event)
    return hold


def held_allocations(db, hold):
    allocations = list(
        db.scalars(
            select(Allocation)
            .where(Allocation.hold_id == hold.id)
            .order_by(Allocation.created_at, Allocation.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if not allocations or any(row.state != "held" for row in allocations):
        fail("hold_expired", 409)
    return allocations


def matched_recipients(data, allocations):
    if {row.allocation_id for row in data.recipients} != {row.id for row in allocations}:
        fail("recipient_allocation_mismatch", 422)


def new_order(db, event, hold, user, status, totals, rate_bps):
    venue = db.get(Venue, event.venue_id)
    order = TicketOrder(
        event_id=event.id,
        buyer_user_id=user.id,
        hold_id=hold.id,
        status=status,
        currency="KZT",
        gross_minor=totals["gross"],
        discount_minor=0,
        payable_minor=totals["gross"],
        processing_fee_minor=totals["fee"],
        processing_rate_bps=rate_bps,
        policy_snapshot={
            "refund_allowed": event.refund_allowed,
            "refund_cutoff_at": event.refund_cutoff_at.isoformat()
            if event.refund_cutoff_at
            else None,
            "processing_rate_bps": rate_bps,
            "hold_minutes": HOLD_MINUTES,
        },
        event_snapshot={
            "title": event.title,
            "starts_at": event.starts_at.isoformat(),
            "ends_at": event.ends_at.isoformat(),
            "time_zone": event.time_zone,
            "visibility": event.visibility,
            "seating_mode": event.seating_mode,
            "venue_name": venue.name,
            "venue_city": venue.city,
        },
        quote_expires_at=hold.expires_at,
        confirmed_at=now() if status == "confirmed" else None,
    )
    db.add(order)
    db.flush()
    return order


def add_items(db, event, hold, order, data, allocations, types, prices):
    """One order item per allocation with immutable price, recipient and seat snapshots.

    `prices` lists (face_value_minor, processing_fee_minor) in recipient order.
    """
    by_id = {row.id: row for row in allocations}
    # Unit numbers follow the buyer's recipient order, which is stable across retries.
    for unit, (recipient, (face, fee)) in enumerate(zip(data.recipients, prices, strict=True), 1):
        allocation = by_id[recipient.allocation_id]
        seat = db.get(EventSeat, allocation.event_seat_id) if allocation.event_seat_id else None
        db.add(
            OrderItem(
                order_id=order.id,
                event_id=event.id,
                hold_id=hold.id,
                ticket_type_id=allocation.ticket_type_id,
                allocation_id=allocation.id,
                unit_number=unit,
                ticket_type_name=types[allocation.ticket_type_id].name,
                recipient_name=recipient.name.strip(),
                recipient_email=recipient.email,
                face_value_minor=face,
                discount_minor=0,
                paid_minor=face,
                processing_fee_minor=fee,
                seat_snapshot=(
                    {
                        "section_label": seat.section_label,
                        "row_label": seat.row_label,
                        "seat_label": seat.seat_label,
                    }
                    if seat
                    else None
                ),
            )
        )
    db.flush()


def issue_tickets(db, settings, event, order, buyer):
    """TX-08 issuance shared by free and paid fulfilment: one ticket per order item."""
    issued = order.confirmed_at
    for item in db.scalars(
        select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.unit_number)
    ):
        ticket_id = uuid4()
        claimed = item.recipient_email == buyer.email
        db.add(
            Ticket(
                id=ticket_id,
                event_id=event.id,
                order_item_id=item.id,
                recipient_user_id=buyer.id if claimed else None,
                claimed_at=issued if claimed else None,
                status="valid",
                qr_token_hash=digest(challenge_value(settings, QR_PURPOSE, ticket_id)),
            )
        )
        db.add(
            OutboxJob(
                event_id=event.id,
                kind="ticket_delivery_email",
                deduplication_key=f"ticket-delivery:{ticket_id}",
                payload={"version": 1, "ticket_id": str(ticket_id), "order_id": str(order.id)},
            )
        )
        if claimed:
            enqueue_ticket_delivered(db, ticket_id, event.id)
        db.get(Allocation, item.allocation_id).state = "sold"
    hold = db.get(Hold, order.hold_id)
    hold.status = "consumed"
    hold.closed_at = issued
    changed(event)


def confirm_free(db, settings, user, hold_id, data):
    event, hold, types = locked_hold(db, user, hold_id, with_types=True)
    existing = db.scalar(select(TicketOrder).where(TicketOrder.hold_id == hold.id))
    if existing:
        if existing.payable_minor > 0:
            fail("payment_required", 409)
        # A repeated confirmation returns the same order and never a second ticket set,
        # but only for the same recipients; a changed request must not look accepted.
        if not same_recipients(db, existing, data):
            fail("confirmation_conflict", 409)
        return existing
    if hold.status != "active" or hold.expires_at <= now():
        fail("hold_expired", 409)
    saleable_event(event)
    allocations = held_allocations(db, hold)
    matched_recipients(data, allocations)
    saleable_types(db, event, types)
    if any(is_paid(ticket) for ticket in types.values()):
        # The free endpoint never charges money; paid baskets use POST /holds/{id}/checkout.
        fail("payment_required", 409)
    order = new_order(db, event, hold, user, "confirmed", {"gross": 0, "fee": 0}, 0)
    add_items(db, event, hold, order, data, allocations, types, [(0, 0)] * len(allocations))
    issue_tickets(db, settings, event, order, user)
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "checkout.order_confirmed", org, event, order)
    return order


def issued_ticket(settings, ticket, item, order, viewer):
    # Only the claimed recipient sees the admission QR; the buyer sees delivery status.
    show_qr = ticket.recipient_user_id == viewer.id and ticket.status in ("valid", "checked_in")
    return {
        "id": ticket.id,
        "order_item_id": ticket.order_item_id,
        "event_id": ticket.event_id,
        "event_title": order.event_snapshot["title"],
        "event_starts_at": order.event_snapshot["starts_at"],
        "venue_name": order.event_snapshot["venue_name"],
        "ticket_type_name": item.ticket_type_name,
        "recipient_name": item.recipient_name,
        "seat_snapshot": item.seat_snapshot,
        "status": ticket.status,
        "recipient_user_id": ticket.recipient_user_id,
        "claimed_at": ticket.claimed_at,
        "issued_at": ticket.issued_at,
        "qr_payload": qr_payload(settings, ticket.id) if show_qr else None,
    }


def ticket_rows(*conditions):
    return (
        select(Ticket, OrderItem, TicketOrder)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .join(TicketOrder, TicketOrder.id == OrderItem.order_id)
        .where(*conditions)
    )


def claim_tickets(db, user):
    # A verified account claims only tickets nominated to its own email address.
    current = now()
    claimed = list(
        db.scalars(
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(
                OrderItem.recipient_email == user.email,
                Ticket.recipient_user_id.is_(None),
                Ticket.status == "valid",
            )
            .order_by(Ticket.id)
            .with_for_update(of=Ticket)
        )
    )
    for ticket in claimed:
        ticket.recipient_user_id, ticket.claimed_at = user.id, current
        enqueue_ticket_delivered(db, ticket.id, ticket.event_id)
    return len(claimed)


def attendee_page(db, event, limit, offset):
    rows = db.execute(
        ticket_rows(Ticket.event_id == event.id)
        .order_by(Ticket.issued_at, OrderItem.unit_number, Ticket.id)
        .limit(limit)
        .offset(offset)
    )
    return [
        {
            "ticket_id": ticket.id,
            "order_id": order.id,
            "ticket_type_id": item.ticket_type_id,
            "ticket_type_name": item.ticket_type_name,
            "recipient_name": item.recipient_name,
            "recipient_email": item.recipient_email,
            "seat_snapshot": item.seat_snapshot,
            "status": ticket.status,
            "claimed": ticket.recipient_user_id is not None,
            "issued_at": ticket.issued_at,
        }
        for ticket, item, order in rows
    ]


def payment_details(db, order):
    intent = db.scalar(select(PaymentIntent).where(PaymentIntent.order_id == order.id))
    if not intent:
        return {"payment": None, "refunds": []}
    refunds = db.scalars(
        select(Refund)
        .join(PaymentAttempt, PaymentAttempt.id == Refund.payment_attempt_id)
        .where(PaymentAttempt.intent_id == intent.id)
        .order_by(Refund.created_at, Refund.id)
    )
    return {
        "payment": attempt_view(latest_attempt(db, intent.id)),
        "refunds": [refund_view(db, refund) for refund in refunds],
    }


def order_view(db, settings, order, viewer):
    items = []
    for item in db.scalars(
        select(OrderItem)
        .where(OrderItem.order_id == order.id)
        .order_by(OrderItem.unit_number, OrderItem.id)
    ):
        ticket = db.scalar(select(Ticket).where(Ticket.order_item_id == item.id))
        items.append(
            {
                "id": item.id,
                "unit_number": item.unit_number,
                "ticket_type_id": item.ticket_type_id,
                "ticket_type_name": item.ticket_type_name,
                "recipient_name": item.recipient_name,
                "recipient_email": item.recipient_email,
                "face_value_minor": item.face_value_minor,
                "discount_minor": item.discount_minor,
                "paid_minor": item.paid_minor,
                "seat_snapshot": item.seat_snapshot,
                "ticket": issued_ticket(settings, ticket, item, order, viewer) if ticket else None,
            }
        )
    return {
        "id": order.id,
        "event_id": order.event_id,
        "buyer_user_id": order.buyer_user_id,
        "hold_id": order.hold_id,
        "status": order.status,
        "currency": order.currency,
        "gross_minor": order.gross_minor,
        "discount_minor": order.discount_minor,
        "payable_minor": order.payable_minor,
        "processing_fee_minor": order.processing_fee_minor,
        "confirmed_at": order.confirmed_at,
        "created_at": order.created_at,
        "quote_expires_at": order.quote_expires_at,
        "items": items,
        **payment_details(db, order),
    }
