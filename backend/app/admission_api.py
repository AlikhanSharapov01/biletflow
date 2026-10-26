from uuid import UUID

from fastapi import APIRouter, Depends, Request

from . import admission_schemas as s
from .admission_service import (
    check_in,
    counts,
    reverse,
    scanner_event,
    scanner_event_query,
    scanner_event_view,
    verify,
)
from .catalog_models import Event, Venue
from .service import rate_limit, valid_session

# Previews are cheap reads that scanners repeat for every attendee in the queue: 60 a minute per
# account (the shared limiter's window is rate_window_seconds). The per-address bucket is wider
# because a whole venue shares one network address.
PREVIEW_PER_ACCOUNT = 60
PREVIEW_PER_ADDRESS = 600


def router(factory, settings, principal):
    preview_limits = settings.model_copy(
        update={"rate_identity_limit": PREVIEW_PER_ACCOUNT, "rate_ip_limit": PREVIEW_PER_ADDRESS}
    )

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

    @routes.post("/events/{event_id}/verifications", response_model=s.VerificationResult)
    def verification(
        event_id: UUID, data: s.VerificationInput, request: Request, ids=Depends(principal)
    ):
        """Preview a check-in: same checks as check-ins, but nothing is admitted or consumed.

        A preview never guarantees a later admission; a rejection is a 200 whose ``code`` is
        the one a real check-in would return.
        """
        rate_limit(
            factory,
            preview_limits,
            request.client.host if request.client else "unknown",
            "scanner_verification",
            str(ids[0]),
        )
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return verify(db, settings, user, event_id, data)

    @routes.post("/check-ins/{check_in_id}/reverse", response_model=s.ReversalResult)
    def undo(check_in_id: UUID, data: s.ReversalInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return reverse(db, user, check_in_id, data)

    return routes
