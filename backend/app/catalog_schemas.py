from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from .schemas import EmailInput, Input

Name = Annotated[str, Field(min_length=1, max_length=200, pattern=r"\S")]
OrgCapability = Literal["manage_profile", "manage_staff", "finance"]
EventCapability = Literal[
    "event_edit", "attendees", "support", "reports", "refund", "scan", "reverse_checkin", "staff"
]


class OrganizationCreate(Input):
    name: Name
    contact_email: EmailStr
    contact_phone: str | None = Field(None, max_length=32)


class OrganizationUpdate(Input):
    name: Name | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(None, max_length=32)


class Invite(EmailInput):
    pass


class OrgPermissions(Input):
    capabilities: list[OrgCapability] = Field(max_length=3)


class StaffAssign(Input):
    member_id: UUID
    capabilities: list[EventCapability] = Field(min_length=1, max_length=8)


class EventInput(Input):
    category_id: UUID
    venue_id: UUID
    venue_layout_id: UUID | None = None
    title: Name
    description: str = Field(default="", max_length=20000)
    visibility: Literal["public", "unlisted", "private"] = "public"
    seating_mode: Literal["general", "assigned"] = "general"
    capacity: int = Field(ge=0, le=100000)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    time_zone: str = "Asia/Almaty"
    registration_opens_at: AwareDatetime
    registration_closes_at: AwareDatetime
    admission_opens_at: AwareDatetime
    admission_closes_at: AwareDatetime
    refund_allowed: bool = True
    refund_cutoff_at: AwareDatetime | None = None

    @field_validator("time_zone")
    @classmethod
    def timezone_exists(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown IANA time zone") from None
        return value

    @model_validator(mode="after")
    def coherent(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Event end must follow start")
        if not self.registration_opens_at < self.registration_closes_at <= self.ends_at:
            raise ValueError("Invalid registration window")
        if not self.admission_opens_at < self.admission_closes_at <= self.ends_at:
            raise ValueError("Invalid admission window")
        if self.refund_allowed and (
            self.refund_cutoff_at is None or self.refund_cutoff_at > self.starts_at
        ):
            raise ValueError("A refund cutoff no later than the start is required")
        if (self.seating_mode == "assigned") != (self.venue_layout_id is not None):
            raise ValueError("Only assigned events require a layout")
        return self


class TicketInput(Input):
    name: Name
    description: str = Field(default="", max_length=5000)
    kind: Literal["free", "paid"]
    price_minor: int = Field(ge=0, le=100_000_000)
    quantity_limit: int = Field(ge=0, le=100000)
    per_order_limit: int = Field(ge=1, le=100)
    sales_open_at: AwareDatetime
    sales_close_at: AwareDatetime
    is_hidden: bool = False

    @model_validator(mode="after")
    def coherent(self):
        if (self.kind == "free") != (self.price_minor == 0):
            raise ValueError("Free prices must be zero; paid prices must be positive")
        if self.sales_close_at <= self.sales_open_at:
            raise ValueError("Invalid ticket sales window")
        return self


class SeatSetup(Input):
    # Map predefined price categories to this event's ticket types.
    ticket_types: dict[str, UUID] = Field(min_length=1, max_length=100)


class SeatUpdate(Input):
    is_blocked: bool
    ticket_type_id: UUID | None = None


class AccessInput(Input):
    user_id: UUID


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime


class OrganizationView(Record):
    owner_user_id: UUID
    name: str
    contact_email: str
    contact_phone: str | None
    status: str


class EventView(Record, EventInput):
    model_config = ConfigDict(from_attributes=True, extra="ignore")
    organization_id: UUID
    publication_state: str
    moderation_state: str
    calendar_uid: str
    calendar_sequence: int
    availability_version: int
    updated_at: datetime
    time_status: str


class TicketView(Record, TicketInput):
    model_config = ConfigDict(from_attributes=True, extra="ignore")
    event_id: UUID


class CodeView(BaseModel):
    code: str


class MemberView(Record):
    organization_id: UUID
    user_id: UUID
    status: str
    revoked_at: datetime | None


class MemberDetail(MemberView):
    display_name: str
    email: str
    capabilities: list[OrgCapability]


class InvitationView(Record):
    organization_id: UUID
    email: str
    invited_by_user_id: UUID
    expires_at: datetime
    accepted_by_user_id: UUID | None
    accepted_at: datetime | None
    revoked_at: datetime | None


class CategoryView(Record):
    code: str
    name_kk: str
    name_ru: str
    name_en: str


class VenueView(Record):
    name: str
    address: str
    city: str
    country_code: str


class LayoutView(Record):
    venue_id: UUID
    name: str
    version: int
    canvas_width: int
    canvas_height: int


class PhysicalSeatView(Record):
    layout_id: UUID
    row_id: UUID
    label: str
    price_category: str
    is_accessible: bool
    x: float
    y: float
    row_label: str
    section_label: str


class LayoutDetail(LayoutView):
    seats: list[PhysicalSeatView]


class ConfiguredSeats(BaseModel):
    configured_seats: int


class EventSeatView(Record):
    event_id: UUID
    layout_id: UUID
    venue_seat_id: UUID
    ticket_type_id: UUID
    section_label: str
    row_label: str
    seat_label: str
    is_blocked: bool


class SeatAvailability(EventSeatView):
    x: float
    y: float
    is_accessible: bool
    status: Literal["available", "unavailable", "blocked", "held", "sold", "refund_pending"]
    paid_activation_required: bool


class SeatPage(BaseModel):
    availability_version: int
    items: list[SeatAvailability]
    limit: int
    offset: int


class StaffView(Record):
    event_id: UUID
    organization_id: UUID
    member_id: UUID
    revoked_at: datetime | None
    capabilities: list[EventCapability]


class AccessView(Record):
    event_id: UUID
    user_id: UUID
    granted_by_user_id: UUID
    revoked_at: datetime | None


class HistoryView(Record):
    event_id: UUID | None
    organization_id: UUID | None
    actor_user_id: UUID | None
    service_actor: str | None
    action: str
    entity_type: str
    entity_id: UUID
    description: str
    safe_change: dict
    correlation_id: UUID
