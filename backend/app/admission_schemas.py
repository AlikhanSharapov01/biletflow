from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from .schemas import Input


class ScannerVenue(BaseModel):
    name: str
    address: str
    city: str


class ScannerEvent(BaseModel):
    # Field names match mobile/src/api/scanner.ts (AssignedEvent).
    id: UUID
    title: str
    venue: ScannerVenue
    starts_at: datetime
    ends_at: datetime
    time_zone: str
    admission_opens_at: datetime
    admission_closes_at: datetime
    time_status: str


class CheckInInput(Input):
    # Exactly one of qr_payload (scan) or ticket_id (manual search result).
    qr_payload: str | None = Field(default=None, min_length=1, max_length=512)
    ticket_id: UUID | None = None
    # Proof that the attendee is signed in (BF-11): the token shown as a QR, or the 8-digit
    # code for printed tickets. Required unless ADMISSION_REQUIRE_ENTRY_CONFIRMATION=false.
    entry_confirmation: str | None = Field(default=None, min_length=1, max_length=1024)
    entry_code: str | None = Field(default=None, pattern=r"^\d{8}$")
    # Registered scanner device (optional); recorded on the check-in.
    device_id: UUID | None = None
    # Client retry key: resending the same operation returns the original result.
    operation_id: UUID | None = None
    captured_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def one_identifier(self):
        if (self.qr_payload is None) == (self.ticket_id is None):
            raise ValueError("Provide exactly one of qr_payload or ticket_id")
        return self


class CheckInResult(BaseModel):
    result: str
    check_in_id: UUID
    ticket_id: UUID
    event_id: UUID
    attendee_name: str
    ticket_type_name: str
    seat: dict | None
    checked_in_at: datetime
    replayed: bool = False


class ReversalInput(Input):
    reason: str = Field(min_length=1, max_length=500, pattern=r"\S")


class ReversalResult(BaseModel):
    check_in_id: UUID
    ticket_id: UUID
    ticket_status: str
    reversed_at: datetime
    reason: str


class AdmissionCounts(BaseModel):
    event_id: UUID
    registered: int
    admitted: int
