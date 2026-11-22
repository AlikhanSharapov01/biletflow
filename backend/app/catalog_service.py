from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.orm import aliased

from .catalog_models import (
    AccessGrant,
    Allocation,
    Event,
    EventSeat,
    EventStaff,
    Hold,
    Member,
    MemberPermission,
    Organization,
    StaffPermission,
    TicketType,
)
from .models import AuditLog
from .observability import correlation_id
from .security import fail, now


def record(row, omit=()):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name not in omit}


ACTIVE_ALLOCATION_STATES = ["held", "sold", "refund_quarantine"]


def live_allocation():
    """Active allocation, where a held one counts only until its hold expires."""
    return and_(
        Allocation.state.in_(ACTIVE_ALLOCATION_STATES),
        or_(Allocation.state != "held", Hold.expires_at > now()),
    )


def price_from_expression(current):
    """SQL form of the card's price-from rule in `event_offers`, correlated to `Event`.

    A type is in stock when it has quantity left (and, for assigned seating, a free seat).
    The price is the cheapest in-stock type still on sale at `current`, else the cheapest
    in-stock type; when the event is sold out it is the cheapest visible type. Null when
    the event has no visible type.
    """
    tt = aliased(TicketType)
    taken = (
        select(func.count(Allocation.id))
        .join(Hold, Hold.id == Allocation.hold_id)
        .where(Allocation.ticket_type_id == tt.id, live_allocation())
        .correlate(tt)
        .scalar_subquery()
    )
    seat_taken = (
        select(Allocation.id)
        .join(Hold, Hold.id == Allocation.hold_id)
        .where(Allocation.event_seat_id == EventSeat.id, live_allocation())
    )
    free_seats = (
        select(func.count(EventSeat.id))
        .where(
            EventSeat.ticket_type_id == tt.id,
            EventSeat.is_blocked.is_(False),
            ~exists(seat_taken),
        )
        .correlate(tt)
        .scalar_subquery()
    )
    event_taken = (
        select(func.count(Allocation.id))
        .join(Hold, Hold.id == Allocation.hold_id)
        .where(Allocation.event_id == Event.id, live_allocation())
        .correlate(Event)
        .scalar_subquery()
    )
    in_stock = and_(
        tt.quantity_limit - taken > 0,
        or_(Event.seating_mode != "assigned", free_seats > 0),
    )
    on_sale = in_stock & (tt.sales_close_at > current)
    cheapest_in_stock = func.min(tt.price_minor).filter(in_stock)
    return (
        select(
            case(
                (
                    or_(event_taken >= Event.capacity, func.count().filter(in_stock) == 0),
                    func.min(tt.price_minor),
                ),
                else_=func.coalesce(func.min(tt.price_minor).filter(on_sale), cheapest_in_stock),
            )
        )
        .where(tt.event_id == Event.id, tt.is_hidden.is_(False), tt.quantity_limit > 0)
        .correlate(Event)
        .scalar_subquery()
    )


def event_offers(db, events):
    """Price-from and sold-out flags per event id, in two grouped queries, plus one for assigned seating."""
    ids = [e.id for e in events]
    if not ids:
        return {}
    types = {}
    for row in db.execute(
        select(
            TicketType.id,
            TicketType.event_id,
            TicketType.price_minor,
            TicketType.quantity_limit,
            TicketType.sales_close_at,
        ).where(
            TicketType.event_id.in_(ids),
            TicketType.is_hidden.is_(False),
            TicketType.quantity_limit > 0,
        )
    ):
        types.setdefault(row.event_id, []).append(row)
    taken = {}
    per_type = {}
    for event_id, type_id, count in db.execute(
        select(Allocation.event_id, Allocation.ticket_type_id, func.count(Allocation.id))
        .join(Hold, Hold.id == Allocation.hold_id)
        .where(Allocation.event_id.in_(ids), live_allocation())
        .group_by(Allocation.event_id, Allocation.ticket_type_id)
    ):
        taken[event_id] = taken.get(event_id, 0) + count
        per_type[type_id] = count
    free_seats = {}
    assigned = [e.id for e in events if e.seating_mode == "assigned"]
    if assigned:
        taken_seat = (
            select(Allocation.id)
            .join(Hold, Hold.id == Allocation.hold_id)
            .where(Allocation.event_seat_id == EventSeat.id, live_allocation())
        )
        free_seats = {
            type_id: count
            for type_id, count in db.execute(
                select(EventSeat.ticket_type_id, func.count(EventSeat.id))
                .where(
                    EventSeat.event_id.in_(assigned),
                    EventSeat.is_blocked.is_(False),
                    ~exists(taken_seat),
                )
                .group_by(EventSeat.ticket_type_id)
            )
        }
    current = now()
    offers = {}
    for event in events:
        visible = types.get(event.id, [])
        if not visible:
            offers[event.id] = {"price_from_minor": None, "sold_out": False}
            continue
        seated = event.seating_mode == "assigned"

        def remaining(t, seated=seated):
            left = t.quantity_limit - per_type.get(t.id, 0)
            return min(left, free_seats.get(t.id, 0)) if seated else left

        in_stock = [t for t in visible if remaining(t) > 0]
        sold_out = taken.get(event.id, 0) >= event.capacity or not in_stock
        if sold_out:
            pool = visible
        else:
            pool = [t for t in in_stock if t.sales_close_at > current] or in_stock
        offers[event.id] = {
            "price_from_minor": min(t.price_minor for t in pool),
            "sold_out": sold_out,
        }
    return offers


def event_records(db, events):
    offers = event_offers(db, events)
    return [event_record(e, db, offers) for e in events]


def event_record(event, db=None, offers=None):
    result = record(event)
    current = now()
    result["time_status"] = (
        "completed"
        if current >= event.ends_at
        else "active"
        if current >= event.starts_at
        else "upcoming"
    )
    if db is not None:
        from .event_image_service import image_records

        result["images"] = image_records(db, event.id)
        result["cover_image_url"] = result["images"][0]["url"] if result["images"] else None
        result.update((event_offers(db, [event]) if offers is None else offers)[event.id])
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
            correlation_id=correlation_id(),
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
        Allocation.event_id == event_id, Allocation.state.in_(ACTIVE_ALLOCATION_STATES)
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
