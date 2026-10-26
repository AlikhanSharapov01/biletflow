from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .schemas import Input


class TermsInput(Input):
    terms_version: str = Field(min_length=1, max_length=100)


class TermsView(BaseModel):
    version: str
    text: str
    accepted: bool


class PaymentView(BaseModel):
    id: UUID
    status: str
    charged_minor: int
    environment: str
    provider_payment_id: str | None
    simulated: bool


class Checklist(BaseModel):
    event_id: UUID
    status: str
    simulated: bool
    missing: list[str]
    paid_ticket_type: bool
    payout_profile_verified: bool
    identity_verified: bool
    terms: TermsView
    activation_fee_minor: int
    currency: str
    activated_at: datetime | None
    suspension_reason: str | None
    payment: PaymentView | None


class SimulatedRecord(BaseModel):
    id: UUID
    status: str
    environment: str


class SimulatedPaymentInput(Input):
    outcome: Literal["pending", "succeeded", "failed"]
    # Optional provider event id: resend the same id to simulate a duplicate notification.
    external_event_id: str | None = Field(default=None, min_length=1, max_length=200)
    # Optional captured amount, to simulate a provider reporting a wrong amount.
    amount_minor: int | None = Field(default=None, ge=1, le=10**12)


class SimulatedPaymentResult(BaseModel):
    provider_event_id: UUID
    external_event_id: str
    attempt: PaymentView
