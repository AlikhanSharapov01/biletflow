from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel

from .admission_history_service import (
    as_aware,
    history_csv,
    history_page,
    ticket_admission,
)
from .catalog_models import Organization
from .catalog_service import event_guard
from .security import fail
from .service import valid_session
from .ticket_document_service import delivery_ticket


class Person(BaseModel):
    id: UUID
    display_name: str


class Reversal(BaseModel):
    reason: str
    actor: Person
    created_at: datetime


class CheckInHistoryItem(BaseModel):
    check_in_id: UUID
    ticket_id: UUID
    attendee_name: str
    ticket_type_name: str
    seat: dict | None
    source: Literal["online", "offline_sync"]
    accepted_at: datetime
    captured_at: datetime
    scanner: Person
    device_label: str | None
    operation_id: UUID
    reversed_at: datetime | None
    reversal: Reversal | None


class CheckInHistory(BaseModel):
    items: list[CheckInHistoryItem]
    total: int
    limit: int
    offset: int


class AdmissionWindow(BaseModel):
    opens_at: datetime
    closes_at: datetime


class TicketAdmission(BaseModel):
    ticket_id: UUID
    status: str
    checked_in_at: datetime | None
    reversed_at: datetime | None
    admission_window: AdmissionWindow


def history_filters(
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    source: Literal["online", "offline_sync"] | None = None,
    state: Literal["current", "reversed"] | None = None,
    ticket_type_id: UUID | None = None,
    q: str | None = Query(None, min_length=2, max_length=100),
):
    if q is not None:
        q = q.strip()
        if len(q) < 2:
            fail("invalid_input", 422)
    return {
        "from_": as_aware(from_),
        "to": as_aware(to),
        "source": source,
        "state": state,
        "ticket_type_id": ticket_type_id,
        "q": q,
    }


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["admission"])

    @routes.get("/events/{event_id}/check-ins", response_model=CheckInHistory)
    def check_ins(
        event_id: UUID,
        filters=Depends(history_filters),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        ids=Depends(principal),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "attendees")
            return history_page(db, event, limit, offset, **filters)

    @routes.get(
        "/events/{event_id}/check-ins.csv",
        response_class=Response,
        responses={200: {"content": {"text/csv": {}}}},
    )
    def check_ins_csv(event_id: UUID, filters=Depends(history_filters), ids=Depends(principal)):
        # The export is read-only apart from its audit row, which needs a write transaction.
        with factory.begin() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "attendees")
            org = db.get(Organization, event.organization_id)
            content = history_csv(db, user, org, event, **filters)
        return Response(
            content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="check-ins-{event_id}.csv"'},
        )

    @routes.get("/tickets/{ticket_id}/admission", response_model=TicketAdmission)
    def admission_status(ticket_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            ticket, _, _ = delivery_ticket(db, user, ticket_id)
            return ticket_admission(db, ticket)

    return routes
