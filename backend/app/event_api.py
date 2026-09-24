from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from pydantic import AwareDatetime
from sqlalchemy import exists, func, select, update

from . import catalog_schemas as s
from .catalog_models import (
    AccessGrant,
    Allocation,
    Category,
    Event,
    EventSeat,
    EventStaff,
    Hold,
    Layout,
    Member,
    Organization,
    Seat,
    Section,
    StaffPermission,
    TicketType,
    Venue,
    VenueRow,
)
from .catalog_service import (
    active_allocations,
    capabilities,
    catalog_audit,
    changed,
    editable,
    event_caps,
    event_guard,
    event_record,
    organization_guard,
    record,
    set_capabilities,
)
from .models import AuditLog, User
from .security import decode_access, fail, now
from .service import valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["events"])

    def viewer(db, request):
        header = request.headers.get("authorization")
        if not header:
            return None
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "bearer" or len(value) > 8192:
            fail()
        return valid_session(db, *decode_access(settings, value))[0]

    def references(db, data):
        if not db.get(Category, data.category_id) or not db.get(Venue, data.venue_id):
            fail("invalid_event_reference", 422)
        if data.venue_layout_id:
            layout = db.get(Layout, data.venue_layout_id)
            if not layout or layout.venue_id != data.venue_id:
                fail("layout_venue_mismatch", 422)

    def assign_creator(db, user, org, event):
        if user.id == org.owner_user_id:
            return
        member = db.scalar(
            select(Member).where(Member.user_id == user.id, Member.organization_id == org.id)
        )
        staff = EventStaff(event_id=event.id, organization_id=org.id, member_id=member.id)
        db.add(staff)
        db.flush()
        db.add(StaffPermission(event_staff_id=staff.id, capability="event_edit"))

    def tickets_fit(db, event):
        for ticket in db.scalars(select(TicketType).where(TicketType.event_id == event.id)):
            if (
                ticket.quantity_limit > event.capacity
                or not event.registration_opens_at
                <= ticket.sales_open_at
                < ticket.sales_close_at
                <= event.registration_closes_at
            ):
                fail("ticket_configuration_conflict", 409)

    def seats_fit(db, event):
        if event.seating_mode != "assigned":
            return
        counts = dict(
            db.execute(
                select(EventSeat.ticket_type_id, func.count(EventSeat.id))
                .where(EventSeat.event_id == event.id, EventSeat.is_blocked.is_(False))
                .group_by(EventSeat.ticket_type_id)
            ).all()
        )
        if sum(counts.values()) > event.capacity:
            fail("seat_capacity_conflict", 409)
        for type_id, count in counts.items():
            if count > db.get(TicketType, type_id).quantity_limit:
                fail("seat_ticket_limit_conflict", 409)

    def publishable(db, event):
        if event.capacity < 1 or event.ends_at <= now() or event.registration_closes_at <= now():
            fail("event_not_publishable", 409)
        usable = list(
            db.scalars(
                select(TicketType).where(
                    TicketType.event_id == event.id,
                    TicketType.is_hidden.is_(False),
                    TicketType.quantity_limit > 0,
                    TicketType.sales_close_at > now(),
                )
            )
        )
        if not usable:
            fail("usable_ticket_type_required", 409)
        tickets_fit(db, event)
        seats_fit(db, event)
        if event.seating_mode == "assigned" and not db.scalar(
            select(EventSeat.id)
            .where(
                EventSeat.event_id == event.id,
                EventSeat.is_blocked.is_(False),
                EventSeat.ticket_type_id.in_([t.id for t in usable]),
            )
            .limit(1)
        ):
            fail("usable_seats_required", 409)

    @routes.get("/categories", tags=["venues"], response_model=list[s.CategoryView])
    def categories():
        with factory() as db:
            return [record(row) for row in db.scalars(select(Category).order_by(Category.code))]

    @routes.get("/venues", tags=["venues"], response_model=list[s.VenueView])
    def venues(
        city: str | None = Query(None, max_length=100),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            query = select(Venue)
            if city:
                query = query.where(func.lower(Venue.city) == city.lower())
            return [
                record(row)
                for row in db.scalars(
                    query.order_by(Venue.name, Venue.id).limit(limit).offset(offset)
                )
            ]

    @routes.get("/venues/{venue_id}/layouts", tags=["venues"], response_model=list[s.LayoutView])
    def layouts(venue_id: UUID):
        with factory() as db:
            if not db.get(Venue, venue_id):
                fail("venue_not_found", 404)
            return [
                record(row)
                for row in db.scalars(
                    select(Layout)
                    .where(Layout.venue_id == venue_id)
                    .order_by(Layout.name, Layout.version)
                )
            ]

    @routes.get(
        "/venues/{venue_id}/layouts/{layout_id}", tags=["venues"], response_model=s.LayoutDetail
    )
    def layout_detail(venue_id: UUID, layout_id: UUID):
        with factory() as db:
            layout = db.get(Layout, layout_id)
            if not layout or layout.venue_id != venue_id:
                fail("layout_not_found", 404)
            rows = db.execute(
                select(Seat, VenueRow.label, Section.label)
                .join(VenueRow, Seat.row_id == VenueRow.id)
                .join(Section, VenueRow.section_id == Section.id)
                .where(Seat.layout_id == layout.id)
                .order_by(Section.label, VenueRow.label, Seat.label)
            )
            return {
                **record(layout),
                "seats": [
                    {**record(seat), "row_label": row, "section_label": section}
                    for seat, row, section in rows
                ],
            }

    @routes.post("/organizations/{org_id}/events", response_model=s.EventView, status_code=201)
    def create(org_id: UUID, data: s.EventInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            org = organization_guard(db, user, org_id, "manage_profile", lock=True)
            references(db, data)
            event = Event(
                organization_id=org.id, calendar_uid=f"{uuid4()}@biletflow", **data.model_dump()
            )
            db.add(event)
            db.flush()
            assign_creator(db, user, org, event)
            catalog_audit(db, user, "event.created", org, event)
            result = event_record(event)
        return result

    @routes.get("/organizations/{org_id}/events", response_model=list[s.EventView])
    def managed(
        org_id: UUID,
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            org = organization_guard(db, user, org_id)
            query = select(Event).where(Event.organization_id == org.id)
            if org.owner_user_id != user.id:
                allowed = (
                    select(EventStaff.event_id)
                    .join(Member, Member.id == EventStaff.member_id)
                    .join(StaffPermission, StaffPermission.event_staff_id == EventStaff.id)
                    .where(
                        Member.user_id == user.id,
                        Member.status == "active",
                        EventStaff.revoked_at.is_(None),
                        StaffPermission.revoked_at.is_(None),
                    )
                )
                query = query.where(Event.id.in_(allowed))
            return [
                event_record(e)
                for e in db.scalars(
                    query.order_by(Event.starts_at, Event.id).limit(limit).offset(offset)
                )
            ]

    @routes.get("/events", response_model=list[s.EventView])
    def discover(
        category_id: UUID | None = None,
        city: str | None = Query(None, max_length=100),
        q: str | None = Query(None, max_length=200),
        date_from: AwareDatetime | None = None,
        date_to: AwareDatetime | None = None,
        min_price: int | None = Query(None, ge=0),
        max_price: int | None = Query(None, ge=0),
        free: bool | None = None,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        if (
            date_from
            and date_to
            and date_from > date_to
            or min_price is not None
            and max_price is not None
            and min_price > max_price
        ):
            fail("invalid_filter_range", 422)
        with factory() as db:
            query = (
                select(Event)
                .join(Organization, Organization.id == Event.organization_id)
                .join(Venue, Venue.id == Event.venue_id)
                .where(
                    Event.publication_state == "published",
                    Event.moderation_state == "normal",
                    Event.visibility == "public",
                    Organization.status == "active",
                )
            )
            if category_id:
                query = query.where(Event.category_id == category_id)
            if city:
                query = query.where(func.lower(Venue.city) == city.lower())
            if q:
                query = query.where(Event.title.icontains(q, autoescape=True))
            if date_from:
                query = query.where(Event.starts_at >= date_from)
            if date_to:
                query = query.where(Event.starts_at <= date_to)
            if min_price is not None or max_price is not None or free is not None:
                price = select(TicketType.id).where(
                    TicketType.event_id == Event.id,
                    TicketType.is_hidden.is_(False),
                    TicketType.quantity_limit > 0,
                )
                if min_price is not None:
                    price = price.where(TicketType.price_minor >= min_price)
                if max_price is not None:
                    price = price.where(TicketType.price_minor <= max_price)
                if free is not None:
                    price = price.where(TicketType.kind == ("free" if free else "paid"))
                query = query.where(exists(price))
            return [
                event_record(e)
                for e in db.scalars(
                    query.order_by(Event.starts_at, Event.id).limit(limit).offset(offset)
                )
            ]

    @routes.get("/events/{event_id}", response_model=s.EventView)
    def detail(event_id: UUID, request: Request):
        with factory() as db:
            return event_record(event_guard(db, viewer(db, request), event_id))

    @routes.put("/events/{event_id}", response_model=s.EventView)
    def edit(event_id: UUID, data: s.EventInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            references(db, data)
            allocated = active_allocations(db, event.id)
            if allocated > data.capacity:
                fail("capacity_below_allocations", 409)
            changing_layout = any(
                getattr(event, key) != getattr(data, key)
                for key in ("venue_id", "venue_layout_id", "seating_mode")
            )
            if changing_layout and (
                db.scalar(select(Allocation.id).where(Allocation.event_id == event.id).limit(1))
                or db.scalar(select(EventSeat.id).where(EventSeat.event_id == event.id).limit(1))
            ):
                fail("layout_already_in_use", 409)
            for key, value in data.model_dump().items():
                setattr(event, key, value)
            tickets_fit(db, event)
            seats_fit(db, event)
            if event.publication_state == "published":
                publishable(db, event)
            event.calendar_sequence += 1
            changed(event)
            catalog_audit(
                db, user, "event.updated", db.get(Organization, event.organization_id), event
            )
            result = event_record(event)
        return result

    @routes.post("/events/{event_id}/publish", response_model=s.EventView)
    def publish(event_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            publishable(db, event)
            if event.publication_state != "published":
                event.publication_state = "published"
                changed(event)
                catalog_audit(
                    db, user, "event.published", db.get(Organization, event.organization_id), event
                )
            result = event_record(event)
        return result

    @routes.post("/events/{event_id}/unpublish", response_model=s.EventView)
    def unpublish(event_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            if event.publication_state == "draft":
                fail("event_not_published", 409)
            if event.publication_state != "unpublished":
                event.publication_state = "unpublished"
                changed(event)
                catalog_audit(
                    db,
                    user,
                    "event.unpublished",
                    db.get(Organization, event.organization_id),
                    event,
                )
            result = event_record(event)
        return result

    @routes.post("/events/{event_id}/cancel", response_model=s.EventView)
    def cancel(event_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            # Commerce cancellation must invalidate tickets and enqueue refunds atomically.
            # Until that module exists, never silently cancel sold/quarantined inventory.
            if db.scalar(
                select(Allocation.id)
                .where(
                    Allocation.event_id == event.id,
                    Allocation.state.in_(["sold", "refund_quarantine"]),
                )
                .limit(1)
            ):
                fail("commerce_cancellation_required", 409)
            if event.publication_state != "cancelled":
                db.execute(
                    update(Allocation)
                    .where(Allocation.event_id == event.id, Allocation.state == "held")
                    .values(state="released", released_at=now(), release_reason="abandoned")
                )
                db.execute(
                    update(Hold)
                    .where(Hold.event_id == event.id, Hold.status == "active")
                    .values(status="released", closed_at=now())
                )
                event.publication_state = "cancelled"
                event.calendar_sequence += 1
                changed(event)
                catalog_audit(
                    db, user, "event.cancelled", db.get(Organization, event.organization_id), event
                )
            result = event_record(event)
        return result

    @routes.post("/events/{event_id}/duplicate", response_model=s.EventView, status_code=201)
    def duplicate(event_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            original = event_guard(db, user, event_id, "event_edit", lock=True)
            org = organization_guard(db, user, original.organization_id, "manage_profile")
            data = {key: getattr(original, key) for key in s.EventInput.model_fields}
            event = Event(organization_id=org.id, calendar_uid=f"{uuid4()}@biletflow", **data)
            db.add(event)
            db.flush()
            types = {}
            for old in db.scalars(select(TicketType).where(TicketType.event_id == original.id)):
                new = TicketType(
                    event_id=event.id,
                    **{key: getattr(old, key) for key in s.TicketInput.model_fields},
                )
                db.add(new)
                db.flush()
                types[old.id] = new.id
            for seat in db.scalars(select(EventSeat).where(EventSeat.event_id == original.id)):
                values = record(seat, omit=("id", "created_at", "event_id", "ticket_type_id"))
                db.add(
                    EventSeat(
                        event_id=event.id, ticket_type_id=types[seat.ticket_type_id], **values
                    )
                )
            assign_creator(db, user, org, event)
            catalog_audit(db, user, "event.duplicated", org, event)
            result = event_record(event)
        return result

    @routes.post("/events/{event_id}/ticket-types", response_model=s.TicketView, status_code=201)
    def create_type(event_id: UUID, data: s.TicketInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            ticket = TicketType(event_id=event.id, **data.model_dump())
            db.add(ticket)
            db.flush()
            tickets_fit(db, event)
            changed(event)
            catalog_audit(
                db,
                user,
                "ticket_type.created",
                db.get(Organization, event.organization_id),
                event,
                ticket,
            )
        return ticket

    @routes.get("/events/{event_id}/ticket-types", response_model=list[s.TicketView])
    def list_types(event_id: UUID, request: Request):
        with factory() as db:
            user = viewer(db, request)
            event = event_guard(db, user, event_id)
            query = select(TicketType).where(TicketType.event_id == event.id)
            if not user or "event_edit" not in event_caps(db, user, event):
                query = query.where(TicketType.is_hidden.is_(False))
            return list(db.scalars(query.order_by(TicketType.created_at, TicketType.id)))

    @routes.put("/events/{event_id}/ticket-types/{type_id}", response_model=s.TicketView)
    def edit_type(event_id: UUID, type_id: UUID, data: s.TicketInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            ticket = db.scalar(
                select(TicketType).where(TicketType.id == type_id, TicketType.event_id == event.id)
            )
            if not ticket:
                fail("ticket_type_not_found", 404)
            if data.quantity_limit < active_allocations(db, event.id, type_id):
                fail("capacity_below_allocations", 409)
            if data.kind != ticket.kind and db.scalar(
                select(Allocation.id).where(Allocation.ticket_type_id == type_id).limit(1)
            ):
                fail("ticket_kind_has_history", 409)
            for key, value in data.model_dump().items():
                setattr(ticket, key, value)
            db.flush()
            tickets_fit(db, event)
            seats_fit(db, event)
            if event.publication_state == "published":
                publishable(db, event)
            changed(event)
            catalog_audit(
                db,
                user,
                "ticket_type.updated",
                db.get(Organization, event.organization_id),
                event,
                ticket,
            )
        return ticket

    @routes.post("/events/{event_id}/seats/configure", response_model=s.ConfiguredSeats)
    def configure_seats(event_id: UUID, data: s.SeatSetup, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            if event.seating_mode != "assigned":
                fail("assigned_seating_required", 409)
            if db.scalar(select(EventSeat.id).where(EventSeat.event_id == event.id).limit(1)):
                fail("seats_already_configured", 409)
            rows = list(
                db.execute(
                    select(Seat, VenueRow.label, Section.label)
                    .join(VenueRow, Seat.row_id == VenueRow.id)
                    .join(Section, VenueRow.section_id == Section.id)
                    .where(Seat.layout_id == event.venue_layout_id)
                )
            )
            if not rows or set(data.ticket_types) != {seat.price_category for seat, _, _ in rows}:
                fail("price_category_mapping_required", 422)
            for type_id in data.ticket_types.values():
                ticket = db.get(TicketType, type_id)
                if not ticket or ticket.event_id != event.id:
                    fail("ticket_type_event_mismatch", 422)
            for seat, row, section in rows:
                db.add(
                    EventSeat(
                        event_id=event.id,
                        layout_id=event.venue_layout_id,
                        venue_seat_id=seat.id,
                        ticket_type_id=data.ticket_types[seat.price_category],
                        section_label=section,
                        row_label=row,
                        seat_label=seat.label,
                    )
                )
            db.flush()
            seats_fit(db, event)
            changed(event)
            catalog_audit(
                db,
                user,
                "event.seats_configured",
                db.get(Organization, event.organization_id),
                event,
            )
        return {"configured_seats": len(rows)}

    @routes.get("/events/{event_id}/seats", response_model=s.SeatPage)
    def list_seats(
        event_id: UUID,
        request: Request,
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user = viewer(db, request)
            event = event_guard(db, user, event_id)
            query = (
                select(EventSeat, Seat, Allocation.state)
                .join(Seat, Seat.id == EventSeat.venue_seat_id)
                .outerjoin(
                    Allocation,
                    (Allocation.event_seat_id == EventSeat.id)
                    & Allocation.state.in_(["held", "sold", "refund_quarantine"]),
                )
            )
            rows = db.execute(
                query.where(EventSeat.event_id == event.id)
                .order_by(
                    EventSeat.section_label, EventSeat.row_label, EventSeat.seat_label, EventSeat.id
                )
                .limit(limit)
                .offset(offset)
            )
            gates_open = (
                event.publication_state == "published"
                and event.moderation_state == "normal"
                and event.registration_opens_at <= now() < event.registration_closes_at
            )
            items = []
            for seat, template, state in rows:
                ticket = db.get(TicketType, seat.ticket_type_id)
                saleable = (
                    gates_open
                    and not ticket.is_hidden
                    and ticket.quantity_limit > 0
                    and ticket.sales_open_at <= now() < ticket.sales_close_at
                )
                items.append(
                    {
                        **record(seat),
                        "x": template.x,
                        "y": template.y,
                        "is_accessible": template.is_accessible,
                        "status": "refund_pending"
                        if state == "refund_quarantine"
                        else state
                        or (
                            "blocked"
                            if seat.is_blocked
                            else "available"
                            if saleable
                            else "unavailable"
                        ),
                        "paid_activation_required": ticket.kind == "paid",
                    }
                )
            return {
                "availability_version": event.availability_version,
                "items": items,
                "limit": limit,
                "offset": offset,
            }

    @routes.patch("/events/{event_id}/seats/{seat_id}", response_model=s.EventSeatView)
    def edit_seat(event_id: UUID, seat_id: UUID, data: s.SeatUpdate, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "event_edit", lock=True)
            editable(event)
            seat = db.scalar(
                select(EventSeat).where(EventSeat.id == seat_id, EventSeat.event_id == event.id)
            )
            if not seat:
                fail("seat_not_found", 404)
            if active_allocations(db, event.id, seat_id=seat.id):
                fail("seat_has_allocation", 409)
            if data.ticket_type_id and data.ticket_type_id != seat.ticket_type_id:
                ticket = db.get(TicketType, data.ticket_type_id)
                if not ticket or ticket.event_id != event.id:
                    fail("ticket_type_event_mismatch", 422)
                if db.scalar(
                    select(Allocation.id).where(Allocation.event_seat_id == seat.id).limit(1)
                ):
                    fail("seat_has_history", 409)
                seat.ticket_type_id = ticket.id
            seat.is_blocked = data.is_blocked
            db.flush()
            seats_fit(db, event)
            if event.publication_state == "published":
                publishable(db, event)
            changed(event)
            catalog_audit(
                db,
                user,
                "event.seat_updated",
                db.get(Organization, event.organization_id),
                event,
                seat,
            )
            result = record(seat)
        return result

    @routes.put("/events/{event_id}/staff", response_model=s.StaffView)
    def assign_staff(event_id: UUID, data: s.StaffAssign, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "staff", lock=True)
            org = db.get(Organization, event.organization_id)
            member = db.scalar(
                select(Member).where(
                    Member.id == data.member_id,
                    Member.organization_id == org.id,
                    Member.status == "active",
                )
            )
            if not member:
                fail("member_not_found", 404)
            if org.owner_user_id != user.id and not set(data.capabilities) <= event_caps(
                db, user, event
            ):
                fail("cannot_delegate_unheld_permission", 403)
            staff = db.scalar(
                select(EventStaff).where(
                    EventStaff.event_id == event.id, EventStaff.member_id == member.id
                )
            )
            if not staff:
                staff = EventStaff(event_id=event.id, organization_id=org.id, member_id=member.id)
                db.add(staff)
                db.flush()
            elif org.owner_user_id != user.id:
                if not capabilities(
                    db, StaffPermission, StaffPermission.event_staff_id, staff.id
                ) <= event_caps(db, user, event):
                    fail("cannot_revoke_unheld_permission", 403)
            staff.revoked_at = None
            set_capabilities(db, StaffPermission, "event_staff_id", staff.id, data.capabilities)
            catalog_audit(db, user, "event.staff_assigned", org, event, staff)
            result = {**record(staff), "capabilities": sorted(set(data.capabilities))}
        return result

    @routes.get("/events/{event_id}/staff", response_model=list[s.StaffView])
    def staff_list(
        event_id: UUID,
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "staff")
            return [
                {
                    **record(staff),
                    "capabilities": sorted(
                        capabilities(db, StaffPermission, StaffPermission.event_staff_id, staff.id)
                    ),
                }
                for staff in db.scalars(
                    select(EventStaff)
                    .where(EventStaff.event_id == event.id)
                    .order_by(EventStaff.created_at, EventStaff.id)
                    .limit(limit)
                    .offset(offset)
                )
            ]

    @routes.delete("/events/{event_id}/staff/{staff_id}", response_model=s.CodeView)
    def revoke_staff(event_id: UUID, staff_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "staff", lock=True)
            staff = db.scalar(
                select(EventStaff).where(EventStaff.id == staff_id, EventStaff.event_id == event.id)
            )
            if not staff:
                fail("staff_not_found", 404)
            org = db.get(Organization, event.organization_id)
            target_member = db.get(Member, staff.member_id)
            if target_member.user_id == org.owner_user_id:
                fail("cannot_revoke_owner", 409)
            if user.id != org.owner_user_id and not capabilities(
                db, StaffPermission, StaffPermission.event_staff_id, staff.id
            ) <= event_caps(db, user, event):
                fail("cannot_revoke_unheld_permission", 403)
            staff.revoked_at = staff.revoked_at or now()
            set_capabilities(db, StaffPermission, "event_staff_id", staff.id, [])
            catalog_audit(db, user, "event.staff_revoked", org, event, staff)
        return {"code": "staff_revoked"}

    @routes.put("/events/{event_id}/access", response_model=s.AccessView)
    def grant_access(event_id: UUID, data: s.AccessInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "attendees", lock=True)
            if not db.get(User, data.user_id):
                fail("user_not_found", 404)
            grant = db.scalar(
                select(AccessGrant).where(
                    AccessGrant.event_id == event.id, AccessGrant.user_id == data.user_id
                )
            )
            if not grant:
                grant = AccessGrant(
                    event_id=event.id, user_id=data.user_id, granted_by_user_id=user.id
                )
                db.add(grant)
            else:
                grant.revoked_at = None
            db.flush()
            catalog_audit(
                db,
                user,
                "event.access_granted",
                db.get(Organization, event.organization_id),
                event,
                grant,
            )
            result = record(grant)
        return result

    @routes.delete("/events/{event_id}/access/{user_id}", response_model=s.CodeView)
    def revoke_access(event_id: UUID, user_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            event = event_guard(db, user, event_id, "attendees", lock=True)
            grant = db.scalar(
                select(AccessGrant).where(
                    AccessGrant.event_id == event.id, AccessGrant.user_id == user_id
                )
            )
            if not grant:
                fail("access_grant_not_found", 404)
            grant.revoked_at = grant.revoked_at or now()
            catalog_audit(
                db,
                user,
                "event.access_revoked",
                db.get(Organization, event.organization_id),
                event,
                grant,
            )
        return {"code": "access_revoked"}

    @routes.get("/events/{event_id}/history", response_model=list[s.HistoryView])
    def history(
        event_id: UUID,
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event_guard(db, user, event_id, "reports")
            return [
                record(row)
                for row in db.scalars(
                    select(AuditLog)
                    .where(AuditLog.event_id == event_id)
                    .order_by(AuditLog.created_at.desc(), AuditLog.id)
                    .limit(limit)
                    .offset(offset)
                )
            ]

    return routes
