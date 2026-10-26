from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from .schemas import Input

MAX_SYNC_OPERATIONS = 200


class EntryConfirmationView(BaseModel):
    id: UUID
    ticket_id: UUID
    event_id: UUID
    token: str  # show as a QR next to the ticket QR (digital tickets)
    code: str  # 8 digits to read out or type for printed tickets
    issued_at: datetime
    expires_at: datetime
    expires_in_seconds: int
    signing_key_id: str


class AttendeeHit(BaseModel):
    ticket_id: UUID
    attendee_name: str
    ticket_type_name: str
    seat: dict | None
    status: str
    claimed: bool
    checked_in: bool
    check_in_id: UUID | None


class DeviceInput(Input):
    device_key: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    label: str = Field(min_length=1, max_length=100, pattern=r"\S")


class DeviceView(BaseModel):
    id: UUID
    device_key: str
    label: str
    created_at: datetime
    revoked_at: datetime | None


class SigningKeys(BaseModel):
    algorithm: str
    entry_confirmation: dict
    offline_package: dict


class PackageInput(Input):
    device_id: UUID


class PackageView(BaseModel):
    package_id: UUID
    snapshot_version: int
    expires_at: datetime
    server_time: datetime
    content_hash: str
    signing_key_id: str
    signature: str
    manifest: dict


class SyncOperation(Input):
    operation_id: UUID
    sequence_number: int = Field(ge=1)
    kind: Literal["check_in", "reverse"]
    captured_at: AwareDatetime
    qr_payload: str | None = Field(default=None, max_length=512)
    entry_confirmation: str | None = Field(default=None, max_length=1024)
    entry_code: str | None = Field(default=None, pattern=r"^\d{8}$")
    parent_operation_id: UUID | None = None
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value):
        return value.strip() if value else value


class SyncInput(Input):
    device_id: UUID
    package_id: UUID
    # The device clock at upload time; kept apart from server time (skew is reported back).
    device_time: AwareDatetime
    operations: list[SyncOperation] = Field(min_length=1, max_length=MAX_SYNC_OPERATIONS)


class SyncOutcome(BaseModel):
    operation_id: UUID
    sequence_number: int
    status: Literal["accepted", "duplicate", "conflict", "rejected"]
    code: str | None
    original_status: str | None = None
    check_in_id: UUID | None = None
    ticket_id: UUID | None = None
    conflict_id: UUID | None = None


class SyncResult(BaseModel):
    package_id: UUID
    event_id: UUID
    server_time: datetime
    device_time: datetime
    clock_skew_seconds: float
    results: list[SyncOutcome]
    refreshed: dict


class ResolveInput(Input):
    note: str = Field(min_length=1, max_length=1000, pattern=r"\S")
    # Also undo the admission the conflicting upload ran into, in the same action.
    reverse_existing_check_in: bool = False
    reversal_reason: str | None = Field(default=None, min_length=1, max_length=500, pattern=r"\S")

    @model_validator(mode="after")
    def reason_with_reversal(self):
        if self.reverse_existing_check_in and self.reversal_reason is None:
            raise ValueError("reversal_reason is required to reverse the existing check-in")
        if not self.reverse_existing_check_in and self.reversal_reason is not None:
            raise ValueError("reversal_reason is only allowed with reverse_existing_check_in")
        return self
