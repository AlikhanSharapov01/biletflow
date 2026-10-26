from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field

from . import checkout_schemas as s
from .catalog_models import Hold
from .checkout_expiry import sweep_event
from .checkout_models import TicketOrder
from .checkout_service import confirm_request, order_view
from .idempotency import checked_key, fingerprint, guard, remember, remembered
from .paid_checkout_service import retry_payment, start_checkout
from .payments_service import simulate_refund
from .schemas import Input
from .service import rate_limit, valid_session


class SimulatedRefundInput(Input):
    outcome: Literal["succeeded", "failed", "unknown"]
    external_event_id: str | None = Field(default=None, min_length=1, max_length=200)


class SimulatedRefundResult(BaseModel):
    provider_event_id: UUID
    external_event_id: str
    refund: s.RefundSummary


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["paid checkout (simulated)"])

    def limit_calls(request, operation, user_id):
        rate_limit(
            factory,
            settings,
            request.client.host if request.client else "unknown",
            operation,
            str(user_id),
        )

    @routes.post("/holds/{hold_id}/checkout", response_model=s.OrderView)
    def checkout(
        hold_id: UUID,
        data: s.ConfirmHold,
        request: Request,
        ids=Depends(principal),
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    ):
        key = checked_key(idempotency_key)
        limit_calls(request, "checkout_paid", ids[0])
        with factory() as db:
            hold = db.get(Hold, hold_id)
            event_id = hold.event_id if hold and hold.buyer_user_id == ids[0] else None
        if event_id:
            sweep_event(factory, event_id)
        request_hash = fingerprint(confirm_request(hold_id, data))
        with factory.begin() as db:
            if key:
                guard(db, ids[0], "order.checkout", key)
            user, _ = valid_session(db, *ids, lock=True)
            if key and (done := remembered(db, user.id, "order.checkout", key, request_hash)):
                return order_view(db, settings, db.get(TicketOrder, done.resource_id), user)
            order = start_checkout(db, settings, user, hold_id, data)
            if key:
                remember(db, user.id, "order.checkout", key, request_hash, "order", order.id, 200)
            return order_view(db, settings, order, user)

    @routes.post("/orders/{order_id}/payment-attempts", response_model=s.OrderView)
    def pay_again(
        order_id: UUID,
        request: Request,
        ids=Depends(principal),
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    ):
        key = checked_key(idempotency_key)
        limit_calls(request, "checkout_paid", ids[0])
        request_hash = fingerprint({"order_id": str(order_id)})
        with factory.begin() as db:
            if key:
                guard(db, ids[0], "order.pay", key)
            user, _ = valid_session(db, *ids, lock=True)
            if key and (done := remembered(db, user.id, "order.pay", key, request_hash)):
                return order_view(db, settings, db.get(TicketOrder, done.resource_id), user)
            order = retry_payment(db, user, order_id)
            if key:
                remember(db, user.id, "order.pay", key, request_hash, "order", order.id, 200)
            return order_view(db, settings, order, user)

    @routes.post(
        "/simulator/refunds/{refund_attempt_id}/events", response_model=SimulatedRefundResult
    )
    def simulated_refund(
        refund_attempt_id: UUID, data: SimulatedRefundInput, ids=Depends(principal)
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
        return simulate_refund(factory, settings, user, refund_attempt_id, data)

    return routes
