from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_enabled: bool


class ConnectionView(BaseModel):
    organization_id: UUID
    property_id: str | None
    is_enabled: bool
    enabled_at: datetime | None
    integration: Literal["enabled", "disabled"]


class Measurement(BaseModel):
    """Client measurement. Purchases and refunds are produced by the server only."""

    model_config = ConfigDict(extra="forbid")
    name: Literal["campaign_landing", "event_view", "checkout_start"]
    analytics_event_id: UUID
    event_id: UUID
    campaign_id: UUID | None = None
    platform: Literal["web", "mobile"]
    page_path: str | None = Field(None, max_length=2048)


class MeasurementResult(BaseModel):
    status: Literal["accepted", "duplicate", "skipped"]
    reason: Literal["disabled", "consent_required", "not_connected", "backlog_full"] | None = None


class FunnelStep(BaseModel):
    event_count: int
    users: int


class TrafficRange(BaseModel):
    from_: date = Field(serialization_alias="from")
    to: date


class TrafficReport(BaseModel):
    event_id: UUID
    source: Literal["ga4"]
    state: Literal["disabled", "not_connected", "fresh", "stale", "unavailable", "error"]
    error: Literal["ga4_unavailable", "ga4_error"] | None
    timezone: str
    range: TrafficRange
    fetched_at: datetime | None
    expires_at: datetime | None
    metrics: dict[str, FunnelStep] | None
    definitions: dict[str, str]
