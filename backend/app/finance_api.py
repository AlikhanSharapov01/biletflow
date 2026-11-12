from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from .activation_service import finance_event
from .finance_models import DemoPayout
from .finance_service import create, totals, transition, view
from .idempotency import checked_key, guard
from .payments_service import simulation_enabled
from .schemas import Input
from .security import fail
from .service import valid_session


class PayoutInput(Input):
    amount_minor: int = Field(gt=0, le=9223372036854775807, strict=True)


class SimulationInput(Input):
    status: Literal["eligible", "sent", "failed"]


class PayoutView(BaseModel):
    id: UUID
    event_id: UUID
    organization_id: UUID
    payout_profile_id: UUID
    requested_by_user_id: UUID
    amount_minor: int
    currency: str
    environment: Literal["simulation"]
    simulated: bool
    status: Literal["pending", "eligible", "sent", "failed", "adjusted"]
    transfer_status: Literal["pending", "eligible", "sent", "failed"]
    adjustment_minor: int
    sent_at: datetime | None
    created_at: datetime


class EventFinance(BaseModel):
    event_id: UUID
    currency: str
    simulated: bool
    simulation_only: bool
    environments: list[str]
    gross_minor: int
    discount_minor: int
    collected_minor: int
    fulfilled_collected_minor: int
    charged_fees_minor: int
    fee_reversals_minor: int
    fees_minor: int
    refunds_minor: int
    pending_refunds_minor: int
    activation_charges_minor: int
    activation_refunds_minor: int
    pending_activation_refunds_minor: int
    net_minor: int
    balance_minor: int
    reserved_minor: int
    sent_minor: int
    estimated_payout_minor: int
    payout_eligible_at: datetime
    generated_at: datetime


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1/events", tags=["finance (simulated payouts)"])

    def read(db, ids, event_id):
        db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
        db.execute(text("SET LOCAL statement_timeout = '5s'"))
        user, _ = valid_session(db, *ids)
        return finance_event(db, user, event_id)[1]

    @routes.get("/{event_id}/finance", response_model=EventFinance)
    def summary(event_id: UUID, ids=Depends(principal)):
        with factory() as db:
            event = read(db, ids, event_id)
            return totals(db, event)

    @routes.get("/{event_id}/finance/payouts", response_model=list[PayoutView])
    def history(
        event_id: UUID,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        ids=Depends(principal),
    ):
        with factory() as db:
            read(db, ids, event_id)
            rows = db.scalars(
                select(DemoPayout)
                .where(DemoPayout.event_id == event_id)
                .order_by(DemoPayout.created_at.desc(), DemoPayout.id.desc())
                .limit(limit)
                .offset(offset)
            )
            return [view(db, row) for row in rows]

    @routes.post("/{event_id}/finance/payouts", response_model=PayoutView, status_code=201)
    def reserve(
        event_id: UUID,
        data: PayoutInput,
        ids=Depends(principal),
        idempotency_key: str = Header(..., alias="Idempotency-Key"),
    ):
        if not simulation_enabled(settings):
            fail("not_found", 404)
        key = checked_key(idempotency_key)
        with factory.begin() as db:
            guard(db, ids[0], "finance.payout", key)
            user, _ = valid_session(db, *ids, lock=True)
            _, event = finance_event(db, user, event_id, lock=True)
            return view(db, create(db, event, user, key, data.amount_minor))

    @routes.post("/{event_id}/finance/payouts/{payout_id}/simulate", response_model=PayoutView)
    def simulate(event_id: UUID, payout_id: UUID, data: SimulationInput, ids=Depends(principal)):
        if not simulation_enabled(settings):
            fail("not_found", 404)
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            _, event = finance_event(db, user, event_id, lock=True)
            return view(db, transition(db, event, payout_id, data.status, user))

    return routes
