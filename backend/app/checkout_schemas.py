from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from .catalog_schemas import Name
from .schemas import Input

HOLD_MINUTES = 10
MAX_ACTIVE_HOLDS = 3
QR_PURPOSE = "ticket_qr"
QR_PREFIX = "biletflow:ticket:"


class HoldLine(Input):
    ticket_type_id: UUID
    quantity: int = Field(ge=1, le=100)
    seat_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def coherent(self):
        if len(self.seat_ids) != len(set(self.seat_ids)):
            raise ValueError("Seat selections must be unique")
        if self.seat_ids and len(self.seat_ids) != self.quantity:
            raise ValueError("Seat count must match quantity")
        return self


class HoldCreate(Input):
    items: list[HoldLine] = Field(min_length=1, max_length=20)


class RecipientInput(Input):
    # Explicit allocation keeps each recipient on the ticket type/seat the buyer chose.
    allocation_id: UUID
    name: Name
    email: EmailStr = Field(max_length=254)

    @field_validator("email", mode="before")
    @classmethod
    def normalize(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class ConfirmHold(Input):
    recipients: list[RecipientInput] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def distinct(self):
        if len({row.allocation_id for row in self.recipients}) != len(self.recipients):
            raise ValueError("Each allocation needs exactly one recipient")
        return self


class AllocationView(BaseModel):
    id: UUID
    ticket_type_id: UUID
    event_seat_id: UUID | None
    state: str


class HoldView(BaseModel):
    id: UUID
    event_id: UUID
    buyer_user_id: UUID
    status: str
    expires_at: datetime
    created_at: datetime
    allocations: list[AllocationView]


class IssuedTicket(BaseModel):
    id: UUID
    order_item_id: UUID
    event_id: UUID
    event_title: str
    event_starts_at: datetime
    venue_name: str
    ticket_type_name: str
    recipient_name: str
    seat_snapshot: dict | None
    status: str
    recipient_user_id: UUID | None
    claimed_at: datetime | None
    issued_at: datetime
    qr_payload: str | None = None


class OrderItemView(BaseModel):
    id: UUID
    unit_number: int
    ticket_type_id: UUID
    ticket_type_name: str
    recipient_name: str
    recipient_email: str
    face_value_minor: int
    discount_minor: int
    paid_minor: int
    seat_snapshot: dict | None
    ticket: IssuedTicket | None = None


class OrderView(BaseModel):
    id: UUID
    event_id: UUID
    buyer_user_id: UUID
    hold_id: UUID
    status: str
    currency: str
    gross_minor: int
    discount_minor: int
    payable_minor: int
    processing_fee_minor: int
    confirmed_at: datetime | None
    created_at: datetime
    items: list[OrderItemView]


class ClaimResult(BaseModel):
    claimed: int


class AttendeeView(BaseModel):
    ticket_id: UUID
    order_id: UUID
    ticket_type_id: UUID
    ticket_type_name: str
    recipient_name: str
    recipient_email: str
    seat_snapshot: dict | None
    status: str
    claimed: bool
    issued_at: datetime
