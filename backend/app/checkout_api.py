from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from . import checkout_schemas as s
from .catalog_service import event_guard
from .checkout_models import Ticket, TicketOrder
from .checkout_service import (
    attendee_page,
    claim_tickets,
    confirm_free,
    create_hold,
    hold_view,
    issued_ticket,
    order_view,
    owned_hold,
    release,
    ticket_rows,
)
from .security import fail
from .service import rate_limit, valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["checkout"])

    def limit_calls(request, operation, user_id):
        rate_limit(
            factory,
            settings,
            request.client.host if request.client else "unknown",
            operation,
            str(user_id),
        )

    @routes.post("/events/{event_id}/holds", response_model=s.HoldView, status_code=201)
    def reserve(event_id: UUID, data: s.HoldCreate, request: Request, ids=Depends(principal)):
        limit_calls(request, "checkout_hold", ids[0])
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return hold_view(db, create_hold(db, user, event_id, data))

    @routes.get("/holds/{hold_id}", response_model=s.HoldView)
    def read_hold(hold_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return hold_view(db, owned_hold(db, user, hold_id))

    @routes.delete("/holds/{hold_id}", response_model=s.HoldView)
    def release_hold(hold_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return hold_view(db, release(db, user, hold_id))

    @routes.post("/holds/{hold_id}/confirm", response_model=s.OrderView)
    def confirm(hold_id: UUID, data: s.ConfirmHold, request: Request, ids=Depends(principal)):
        limit_calls(request, "checkout_confirm", ids[0])
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            order = confirm_free(db, settings, user, hold_id, data)
            return order_view(db, settings, order, user)

    @routes.get("/orders", response_model=list[s.OrderView])
    def orders(
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            rows = db.scalars(
                select(TicketOrder)
                .where(TicketOrder.buyer_user_id == user.id)
                .order_by(TicketOrder.created_at.desc(), TicketOrder.id)
                .limit(limit)
                .offset(offset)
            )
            return [order_view(db, settings, order, user) for order in rows]

    @routes.get("/orders/{order_id}", response_model=s.OrderView)
    def order_detail(order_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            order = db.get(TicketOrder, order_id)
            if not order or order.buyer_user_id != user.id:
                fail("order_not_found", 404)
            return order_view(db, settings, order, user)

    @routes.post("/tickets/claim", response_model=s.ClaimResult)
    def claim(request: Request, ids=Depends(principal)):
        limit_calls(request, "ticket_claim", ids[0])
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return {"claimed": claim_tickets(db, user)}

    @routes.get("/tickets", response_model=list[s.IssuedTicket])
    def tickets(
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            rows = db.execute(
                ticket_rows(Ticket.recipient_user_id == user.id)
                .order_by(Ticket.issued_at.desc(), Ticket.id)
                .limit(limit)
                .offset(offset)
            )
            return [issued_ticket(settings, *row, user) for row in rows]

    @routes.get("/tickets/{ticket_id}", response_model=s.IssuedTicket)
    def ticket_detail(ticket_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            row = db.execute(
                ticket_rows(Ticket.id == ticket_id, Ticket.recipient_user_id == user.id)
            ).first()
            if not row:
                fail("ticket_not_found", 404)
            return issued_ticket(settings, *row, user)

    @routes.get("/events/{event_id}/attendees", response_model=list[s.AttendeeView])
    def attendees(
        event_id: UUID,
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "attendees")
            return attendee_page(db, event, limit, offset)

    return routes
