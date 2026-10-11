from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field

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
    qr_payload: str = Field(min_length=1, max_length=512)
    # Client retry key: resending the same operation returns the original result.
    operation_id: UUID | None = None
    captured_at: AwareDatetime | None = None


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
