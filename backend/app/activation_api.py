from uuid import UUID

from fastapi import APIRouter, Depends, Header

from . import activation_schemas as s
from .activation_service import (
    accept_terms,
    add_payout_profile,
    add_verification,
    checklist,
    finance_event,
    start_activation,
)
from .catalog_models import Event
from .idempotency import checked_key, fingerprint, guard, remember, remembered
from .payments_service import simulate
from .service import valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["paid sales (simulated)"])

    @routes.get("/events/{event_id}/paid-sales", response_model=s.Checklist)
    def read_checklist(event_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            _, event = finance_event(db, user, event_id)
            return checklist(db, event)

    @routes.post(
        "/organizations/{org_id}/paid-sales/payout-profile", response_model=s.SimulatedRecord
    )
    def payout_profile(org_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return add_payout_profile(db, user, org_id)

    @routes.post(
        "/organizations/{org_id}/paid-sales/identity-verification",
        response_model=s.SimulatedRecord,
    )
    def identity_verification(org_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return add_verification(db, user, org_id)

    @routes.post("/events/{event_id}/paid-sales/terms", response_model=s.Checklist)
    def terms(event_id: UUID, data: s.TermsInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return accept_terms(db, user, event_id, data.terms_version)

    @routes.post("/events/{event_id}/paid-sales/activation", response_model=s.Checklist)
    def activate(
        event_id: UUID,
        ids=Depends(principal),
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    ):
        key = checked_key(idempotency_key)
        request_hash = fingerprint({"event_id": str(event_id)})
        with factory.begin() as db:
            if key:
                guard(db, ids[0], "paid_sales.activate", key)
            user, _ = valid_session(db, *ids, lock=True)
            if key and remembered(db, user.id, "paid_sales.activate", key, request_hash):
                return checklist(db, db.get(Event, event_id))
            activation = start_activation(db, user, event_id)
            if key:
                remember(
                    db,
                    user.id,
                    "paid_sales.activate",
                    key,
                    request_hash,
                    "sales_activation",
                    activation.id,
                    200,
                )
            return checklist(db, db.get(Event, event_id))

    @routes.post("/simulator/payments/{attempt_id}/events", response_model=s.SimulatedPaymentResult)
    def simulated_payment(attempt_id: UUID, data: s.SimulatedPaymentInput, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
        return simulate(factory, settings, user, attempt_id, data)

    return routes
