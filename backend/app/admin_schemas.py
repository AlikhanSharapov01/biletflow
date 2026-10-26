from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .schemas import Input

# Setting registry: key -> (default, minimum, maximum, description). All values are integers.
SETTINGS = {
    "hold_minutes": (10, 1, 60, "Checkout hold duration in minutes"),
    "activation_fee_minor": (500000, 0, 100_000_000, "Demo paid-sales activation fee, KZT minor"),
    "processing_rate_bps": (300, 0, 10000, "Demo processing rate in basis points"),
    "upload_max_mb": (5, 1, 50, "Maximum size of one uploaded file in megabytes"),
}
SettingKey = Literal["hold_minutes", "activation_fee_minor", "processing_rate_bps", "upload_max_mb"]
ReportCategory = Literal["spam", "fraud", "inappropriate", "misleading", "safety", "other"]
Reason = Field(min_length=1, max_length=500)


def stripped(value):
    return value.strip() if isinstance(value, str) else value


class ReasonInput(Input):
    reason: str = Reason

    _strip = field_validator("reason", mode="before")(stripped)


class ReportCreate(Input):
    category: ReportCategory
    description: str = Field(min_length=1, max_length=2000)

    _strip = field_validator("description", mode="before")(stripped)


class ReportResolve(Input):
    resolution: str = Field(min_length=1, max_length=2000)

    _strip = field_validator("resolution", mode="before")(stripped)


class SettingUpdate(Input):
    value: int = Field(strict=True)
    expected_version: int = Field(ge=0, le=1_000_000)
    effective_at: datetime | None = None
    reason: str | None = Field(None, min_length=1, max_length=500)

    _strip = field_validator("reason", mode="before")(stripped)


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel):
    items: list
    total: int
    limit: int
    offset: int


class AdminMe(BaseModel):
    user_id: UUID
    is_platform_admin: bool = True


class ReportView(Record):
    id: UUID
    event_id: UUID
    reporter_user_id: UUID
    category: str
    description: str
    status: str
    reviewed_by_user_id: UUID | None
    reviewed_at: datetime | None
    resolved_by_user_id: UUID | None
    resolution: str | None
    resolved_at: datetime | None
    created_at: datetime


class ReporterReceipt(Record):
    id: UUID
    event_id: UUID
    category: str
    status: str
    created_at: datetime
    duplicate: bool = False


class ModerationView(Record):
    id: UUID
    target_user_id: UUID | None
    target_event_id: UUID | None
    action: str
    reason: str
    actor_user_id: UUID
    created_at: datetime


class SettingView(BaseModel):
    key: str
    description: str
    value: int
    version: int
    effective_at: datetime | None
    default: int
    minimum: int
    maximum: int
    pending: dict | None = None


class SettingHistory(Record):
    setting_key: str
    version: int
    value: int
    effective_at: datetime
    actor_user_id: UUID
    reason: str | None
    created_at: datetime
