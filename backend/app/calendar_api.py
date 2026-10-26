from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from .calendar_service import (
    build_ics,
    calendar_event,
    is_public,
    service_links,
    venue_of,
)
from .catalog_models import Event
from .security import decode_access, fail
from .service import valid_session


class CalendarLinks(BaseModel):
    google: str
    outlook: str
    office365: str
    ics_path: str
    ics_requires_sign_in: bool
    calendar_sequence: int


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["calendar"])

    def viewer(db, request):
        header = request.headers.get("authorization")
        if not header:
            return None
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "bearer" or len(value) > 8192:
            fail()
        return valid_session(db, *decode_access(settings, value))[0]

    def load(db, request, event_id):
        user = viewer(db, request)
        event = db.get(Event, event_id)
        if not event:
            fail("event_not_found", 404)
        calendar_event(db, user, event)
        return event

    @routes.get("/events/{event_id}/calendar.ics", response_class=Response)
    def export(event_id: UUID, request: Request):
        with factory() as db:
            event = load(db, request, event_id)
            body = build_ics(settings, event, venue_of(db, event))
            name = f"biletflow-{event.id}.ics"
        return Response(
            body,
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    @routes.get("/events/{event_id}/calendar-links", response_model=CalendarLinks)
    def links(event_id: UUID, request: Request):
        with factory() as db:
            event = load(db, request, event_id)
            if event.publication_state == "cancelled":
                # A new calendar entry for a cancelled event would only mislead; the .ics still
                # carries STATUS:CANCELLED so existing entries can be updated.
                fail("event_cancelled", 409)
            result = service_links(settings, event, venue_of(db, event))
            result.update(
                ics_path=f"/api/v1/events/{event.id}/calendar.ics",
                ics_requires_sign_in=not is_public(event),
                calendar_sequence=event.calendar_sequence,
            )
        return result

    return routes
