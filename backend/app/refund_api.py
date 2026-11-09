from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from . import checkout_schemas as s
from .checkout_service import order_view
from .refund_service import cancel_order, cancel_ticket, refund_order, request_refund
from .schemas import Input
from .service import valid_session


class ReasonInput(Input):
    reason: str = Field(default="", max_length=500)

    @property
    def note(self):
        return self.reason.strip() or None


class RefundStarted(BaseModel):
    order_id: UUID
    status: str
    refund: s.RefundSummary


class RefundRequested(BaseModel):
    order_id: UUID
    status: str
    case_id: UUID


class TicketCancelled(BaseModel):
    ticket_id: UUID
    order_id: UUID
    status: str


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["refunds and cancellations"])

    @routes.post("/orders/{order_id}/refunds", response_model=RefundStarted)
    def organizer_refund(order_id: UUID, data: ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return refund_order(db, user, order_id, data.note)

    @routes.post(
        "/orders/{order_id}/refund-requests", response_model=RefundRequested, status_code=202
    )
    def attendee_request(order_id: UUID, data: ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return request_refund(db, user, order_id, data.note)

    @routes.post("/orders/{order_id}/cancel", response_model=s.OrderView)
    def attendee_cancel(order_id: UUID, data: ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            order = cancel_order(db, user, order_id, data.note)
            db.flush()
            return order_view(db, settings, order, user)

    @routes.post("/events/{event_id}/tickets/{ticket_id}/cancel", response_model=TicketCancelled)
    def organizer_cancel(
        event_id: UUID, ticket_id: UUID, data: ReasonInput, ids=Depends(principal)
    ):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return cancel_ticket(db, user, event_id, ticket_id, data.note)

    return routes
