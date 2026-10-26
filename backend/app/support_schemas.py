from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from .schemas import Input

Category = Literal[
    "delivery", "payment", "refund", "seating", "event_info", "check_in", "account", "technical"
]
Status = Literal["open", "in_progress", "waiting_for_customer", "resolved"]
Body = Field(min_length=1, max_length=5000, pattern=r"\S")
Reason = Field(min_length=1, max_length=500, pattern=r"\S")
# The configured per-message limit (ATTACHMENT_MAX_PER_MESSAGE <= 20) is enforced by the API.
AttachmentIds = Field(default_factory=list, max_length=20)


def distinct(ids):
    if len(set(ids)) != len(ids):
        raise ValueError("Attachments must be distinct")
    return ids


class CaseCreate(Input):
    kind: Literal["attendee", "organizer_platform"]
    category: Category
    subject: str = Field(min_length=1, max_length=200, pattern=r"\S")
    body: str = Body
    # Retry key of the first message: resending the same request returns the same case.
    client_message_id: UUID
    organization_id: UUID | None = None
    event_id: UUID | None = None
    order_id: UUID | None = None
    ticket_id: UUID | None = None
    attachment_ids: list[UUID] = AttachmentIds

    _distinct = field_validator("attachment_ids")(distinct)

    @model_validator(mode="after")
    def coherent(self):
        if self.kind == "attendee":
            if self.organization_id is not None:
                raise ValueError("Attendee cases take their organization from the event")
            if not (self.event_id or self.order_id or self.ticket_id):
                raise ValueError("Attendee cases need an event, order or ticket")
        else:
            if self.organization_id is None:
                raise ValueError("Platform cases need organization_id")
            if self.order_id or self.ticket_id:
                raise ValueError("Platform cases cannot link orders or tickets")
        return self


class MessageCreate(Input):
    client_message_id: UUID
    body: str = Body
    # Files uploaded earlier through POST /cases/{id}/attachments.
    attachment_ids: list[UUID] = AttachmentIds

    _distinct = field_validator("attachment_ids")(distinct)


class StatusChange(Input):
    status: Status
    reason: str | None = Field(default=None, min_length=1, max_length=500, pattern=r"\S")


class Assignment(Input):
    assignee_user_id: UUID | None
    reason: str | None = Field(default=None, min_length=1, max_length=500, pattern=r"\S")


class Escalation(Input):
    reason: str = Reason


class Person(BaseModel):
    id: UUID
    display_name: str


class CaseView(BaseModel):
    id: UUID
    kind: str
    category: str
    subject: str
    status: str
    requester: Person
    organization_id: UUID | None
    event_id: UUID | None
    order_id: UUID | None
    ticket_id: UUID | None
    assigned_to: Person | None
    escalated_at: datetime | None
    resolved_at: datetime | None
    last_seq: int
    created_at: datetime
    updated_at: datetime
    # How the caller relates to the case: requester, support (event staff) or platform.
    viewer_roles: list[str]


class CasePage(BaseModel):
    items: list[CaseView]
    total: int
    limit: int
    offset: int


class AttachmentView(BaseModel):
    id: UUID
    file_id: UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class UploadedFile(BaseModel):
    file_id: UUID
    mime_type: str
    size_bytes: int
    sha256: str
    status: str
    # Until then the file can be linked to a message of the same case by its uploader.
    expires_at: datetime


class DownloadLink(BaseModel):
    url: str
    expires_at: datetime


class MessageView(BaseModel):
    seq: int
    type: Literal["message"] = "message"
    id: UUID
    case_id: UUID
    author: Person
    author_role: Literal["requester", "support"]
    client_message_id: UUID
    body: str
    created_at: datetime
    replayed: bool = False
    attachments: list[AttachmentView] = []


class ChangeView(BaseModel):
    seq: int
    type: Literal["change"] = "change"
    id: UUID
    case_id: UUID
    actor: Person
    change_kind: str
    before_value: str | None
    after_value: str | None
    reason: str | None
    created_at: datetime


class UpdatePage(BaseModel):
    items: list[dict]
    next_after: int
    has_more: bool


class CaseCreated(BaseModel):
    case: CaseView
    message: MessageView
