import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from .catalog_schemas import Name
from .schemas import Input

CODE_PATTERN = re.compile(r"[A-Z0-9_-]{3,32}")
DiscountKind = Literal["percent", "fixed"]


def normalize_code(value):
    """Uppercase, trimmed code; blank means none. Non-strings are left for validation."""
    if not isinstance(value, str):
        return value
    return value.strip().upper() or None


class CampaignInput(Input):
    name: Name
    discount_kind: DiscountKind
    # Whole percent (1-100) for "percent", KZT minor units for "fixed".
    value: int = Field(ge=1, le=10**12)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    max_redemptions: int | None = Field(default=None, ge=1, le=1_000_000)
    # Empty means every ticket type is eligible.
    eligible_ticket_type_ids: list[UUID] = Field(default_factory=list, max_length=100)
    code: str | None = None

    @field_validator("code", mode="before")
    @classmethod
    def clean_code(cls, value):
        return normalize_code(value)

    @model_validator(mode="after")
    def coherent(self):
        if self.discount_kind == "percent" and self.value > 100:
            raise ValueError("A percentage discount is at most 100")
        if self.ends_at <= self.starts_at:
            raise ValueError("A campaign must end after it starts")
        if len(self.eligible_ticket_type_ids) != len(set(self.eligible_ticket_type_ids)):
            raise ValueError("Ticket types must be unique")
        if self.code is not None and not CODE_PATTERN.fullmatch(self.code):
            raise ValueError("A code is 3-32 letters, digits, underscores or hyphens")
        return self


class CampaignView(BaseModel):
    id: UUID
    event_id: UUID
    name: str
    discount_kind: DiscountKind
    value: int
    starts_at: datetime
    ends_at: datetime
    max_redemptions: int | None
    eligible_ticket_type_ids: list[UUID]
    code: str
    created_at: datetime
    status: Literal["scheduled", "active", "ended", "disabled"]
    redemptions_used: int
    link_url: str


class CampaignReport(BaseModel):
    campaign_id: UUID
    redemptions: int
    orders: int
    tickets: int
    tickets_refunded: int
    tickets_kept: int
    gross_minor: int
    discount_minor: int
    collected_minor: int
    refunds_minor: int
    fees_minor: int
    net_minor: int
    generated_at: datetime


class PromoPreview(BaseModel):
    event_id: UUID
    code: str
    discount_kind: DiscountKind
    discount_value: int
    # Empty means every ticket type is eligible.
    eligible_ticket_type_ids: list[UUID]
    valid_until: datetime


class CampaignLink(BaseModel):
    event_id: UUID
    code: str
