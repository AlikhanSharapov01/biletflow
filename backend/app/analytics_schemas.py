from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class AnalyticsFilters(BaseModel):
    from_: datetime | None = Field(None, alias="from")
    to: datetime | None = None
    ticket_type_id: UUID | None = None
    campaign_id: UUID | None = None


class Metadata(BaseModel):
    event_id: UUID
    timezone: str
    generated_at: datetime
    filters: AnalyticsFilters
    definitions: dict[str, str]


class Inventory(BaseModel):
    capacity: int
    sold: int
    held: int
    expired_held: int
    available: int
    blocked: int
    refund_pending: int
    sold_percentage: float


class Revenue(BaseModel):
    currency: Literal["KZT"]
    environments: list[Literal["simulation", "sandbox"]]
    simulated: bool
    gross_minor: int
    discount_minor: int
    fulfilled_collected_minor: int
    collected_minor: int
    charged_fees_minor: int
    fee_reversals_minor: int
    fees_minor: int
    refunds_minor: int
    pending_refunds_minor: int
    net_minor: int


class Attendance(BaseModel):
    issued: int
    checked_in: int
    not_checked_in: int
    not_checked_in_label: Literal["absent", "not_yet_checked_in"]
    percentage: float


class TicketTypeMetrics(BaseModel):
    ticket_type_id: UUID
    name: str
    capacity: int
    sold: int
    checked_in: int
    revenue_minor: int


class CampaignMetrics(BaseModel):
    campaign_id: UUID | None
    name: str
    redemptions: int
    original_tickets: int
    refunded_tickets: int
    retained_tickets: int
    discount_minor: int
    revenue_minor: int
    collected_minor: int
    refunds_minor: int
    pending_refunds_minor: int
    fees_minor: int


class EventAnalytics(Metadata):
    inventory: Inventory
    revenue: Revenue
    attendance: Attendance
    by_ticket_type: list[TicketTypeMetrics]
    by_campaign: list[CampaignMetrics]


class SalesPoint(BaseModel):
    bucket_start: datetime
    tickets: int
    revenue_minor: int


class SalesSeries(Metadata):
    bucket: Literal["day", "hour"]
    points: list[SalesPoint]
