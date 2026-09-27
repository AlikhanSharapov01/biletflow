from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .catalog_models import Allocation, Event, EventSeat, Hold, Organization, TicketType, Venue
from .catalog_service import active_allocations, catalog_audit, changed, event_guard
from .checkout_models import OrderItem, Ticket, TicketOrder
from .checkout_schemas import HOLD_MINUTES, MAX_ACTIVE_HOLDS, QR_PREFIX, QR_PURPOSE
from .models import OutboxJob
from .security import challenge_value, digest, fail, now


def qr_payload(settings, ticket_id):
    return QR_PREFIX + challenge_value(settings, QR_PURPOSE, ticket_id)


def close_hold(db, hold, status, reason):
    hold.status = status
    hold.closed_at = now()
    for allocation in db.scalars(
        select(Allocation)
        .where(Allocation.hold_id == hold.id, Allocation.state == "held")
        .order_by(Allocation.id)
        .with_for_update()
    ):
        allocation.state = "released"
        allocation.released_at = now()
        allocation.release_reason = reason


def expire_event_holds(db, event):
    current = now()
    expired = list(
        db.scalars(
            select(Hold)
            .where(Hold.event_id == event.id, Hold.status == "active", Hold.expires_at <= current)
            .order_by(Hold.id)
            .with_for_update()
        )
    )
    for hold in expired:
        close_hold(db, hold, "expired", "expired")
    return bool(expired)


def buyer_event(db, user, event_id):
    # Buyers pass the attendee visibility rules, not organizer membership. Lock order for
    # every checkout path is user -> event -> hold/allocations -> ticket types.
    event_guard(db, user, event_id)
    return db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def saleable_event(event):
    if (
        event.publication_state != "published"
        or event.moderation_state != "normal"
        or not event.registration_opens_at <= now() < event.registration_closes_at
    ):
        fail("event_not_on_sale", 409)


def locked_types(db, event, type_ids):
    rows = {}
    for type_id in sorted(type_ids):
        ticket = db.scalar(
            select(TicketType)
            .where(TicketType.id == type_id, TicketType.event_id == event.id)
            .with_for_update()
        )
        if not ticket or ticket.is_hidden:
            fail("ticket_type_unavailable", 409)
        if ticket.kind != "free" or ticket.price_minor != 0:
            fail("paid_checkout_unavailable", 409)
        if not ticket.sales_open_at <= now() < ticket.sales_close_at:
            fail("sales_window_closed", 409)
        rows[type_id] = ticket
    return rows


def create_hold(db, user, event_id, data):
    event = buyer_event(db, user, event_id)
    saleable_event(event)
    if expire_event_holds(db, event):
        changed(event)
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
    live_count = db.scalar(
        select(func.count(Hold.id)).where(Hold.buyer_user_id == user.id, Hold.status == "active")
    )
    if live_count >= MAX_ACTIVE_HOLDS:
        fail("too_many_active_holds", 409)
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
    types = locked_types(db, event, requested)
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


def locked_hold(db, user, hold_id):
    # Read the event id unlocked, then lock event before hold to match create_hold.
    event = buyer_event(db, user, owned_hold(db, user, hold_id).event_id)
    expired = expire_event_holds(db, event)
    if expired:
        changed(event)
    return event, owned_hold(db, user, hold_id, lock=True)


def release(db, user, hold_id):
    event, hold = locked_hold(db, user, hold_id)
    if hold.status == "consumed":
        fail("hold_already_consumed", 409)
    if hold.status == "active":
        close_hold(db, hold, "released", "abandoned")
        changed(event)
    return hold


def confirm_free(db, settings, user, hold_id, data):
    event, hold = locked_hold(db, user, hold_id)
    existing = db.scalar(select(TicketOrder).where(TicketOrder.hold_id == hold.id))
    if existing:
        # Refreshing confirmation returns the same order and never issues a second ticket set.
        return existing
    if hold.status != "active" or hold.expires_at <= now():
        fail("hold_expired", 409)
    saleable_event(event)
    allocations = list(
        db.scalars(
            select(Allocation)
            .where(Allocation.hold_id == hold.id)
            .order_by(Allocation.created_at, Allocation.id)
            .with_for_update()
        )
    )
    if not allocations or any(row.state != "held" for row in allocations):
        fail("hold_expired", 409)
    recipients = {row.allocation_id: row for row in data.recipients}
    if recipients.keys() != {row.id for row in allocations}:
        fail("recipient_allocation_mismatch", 422)
    types = locked_types(db, event, {row.ticket_type_id for row in allocations})
    venue = db.get(Venue, event.venue_id)
    confirmed = now()
    order = TicketOrder(
        event_id=event.id,
        buyer_user_id=user.id,
        hold_id=hold.id,
        status="confirmed",
        currency="KZT",
        gross_minor=0,
        discount_minor=0,
        payable_minor=0,
        processing_fee_minor=0,
        processing_rate_bps=0,
        policy_snapshot={
            "refund_allowed": event.refund_allowed,
            "refund_cutoff_at": event.refund_cutoff_at.isoformat()
            if event.refund_cutoff_at
            else None,
            "processing_rate_bps": 0,
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
        confirmed_at=confirmed,
    )
    db.add(order)
    db.flush()
    by_id = {row.id: row for row in allocations}
    # Unit numbers follow the buyer's recipient order, which is stable across retries.
    for unit, recipient in enumerate(data.recipients, 1):
        allocation = by_id[recipient.allocation_id]
        ticket_type = types[allocation.ticket_type_id]
        seat = db.get(EventSeat, allocation.event_seat_id) if allocation.event_seat_id else None
        item = OrderItem(
            order_id=order.id,
            event_id=event.id,
            hold_id=hold.id,
            ticket_type_id=allocation.ticket_type_id,
            allocation_id=allocation.id,
            unit_number=unit,
            ticket_type_name=ticket_type.name,
            recipient_name=recipient.name.strip(),
            recipient_email=recipient.email,
            face_value_minor=0,
            discount_minor=0,
            paid_minor=0,
            processing_fee_minor=0,
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
        db.add(item)
        db.flush()
        ticket_id = uuid4()
        claimed = recipient.email == user.email
        db.add(
            Ticket(
                id=ticket_id,
                event_id=event.id,
                order_item_id=item.id,
                recipient_user_id=user.id if claimed else None,
                claimed_at=confirmed if claimed else None,
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
        allocation.state = "sold"
    hold.status = "consumed"
    hold.closed_at = confirmed
    changed(event)
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
        "items": items,
    }
