from uuid import UUID

from fastapi import APIRouter, Depends

from . import admission_schemas as s
from .admission_service import (
    check_in,
    counts,
    reverse,
    scanner_event,
    scanner_event_query,
    scanner_event_view,
)
from .catalog_models import Event, Venue
from .service import valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1/scanner", tags=["admission"])

    @routes.get("/events", response_model=list[s.ScannerEvent])
    def assigned_events(ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            rows = db.execute(scanner_event_query(user).order_by(Event.starts_at, Event.id))
            return [scanner_event_view(event, venue) for event, venue in rows]

    @routes.get("/events/{event_id}", response_model=s.ScannerEvent)
    def assigned_event(event_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = scanner_event(db, user, event_id)
            return scanner_event_view(event, db.get(Venue, event.venue_id))

    @routes.get("/events/{event_id}/counts", response_model=s.AdmissionCounts)
    def admission_counts(event_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return counts(db, scanner_event(db, user, event_id))

    @routes.post("/events/{event_id}/check-ins", response_model=s.CheckInResult)
    def admit(event_id: UUID, data: s.CheckInInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return check_in(db, settings, user, ids[1], event_id, data)

    @routes.post("/check-ins/{check_in_id}/reverse", response_model=s.ReversalResult)
    def undo(check_in_id: UUID, data: s.ReversalInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return reverse(db, user, check_in_id, data)

    return routes
