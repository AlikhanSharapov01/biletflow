from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select

from . import offline_schemas as s
from .admission_service import scanner_event
from .catalog_service import event_guard
from .entry_service import issue_confirmation, search_attendees
from .offline_models import ScannerDevice
from .offline_service import (
    build_package,
    device_view,
    list_conflicts,
    list_operations,
    register_device,
    resolve_conflict,
    revoke_device,
    signing_keys,
    sync,
)
from .service import rate_limit, valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["admission"])

    # ------------------------------------------------ attendee: entry confirmation

    @routes.post(
        "/tickets/{ticket_id}/entry-confirmations",
        response_model=s.EntryConfirmationView,
        status_code=201,
    )
    def entry_confirmation(ticket_id: UUID, request: Request, ids=Depends(principal)):
        rate_limit(factory, settings, request.client.host, "entry_confirmation", str(ids[0]))
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return issue_confirmation(db, settings, user, ids[1], ticket_id)

    # ------------------------------------------------ scanner: manual search

    @routes.get("/scanner/events/{event_id}/attendees", response_model=list[s.AttendeeHit])
    def find_attendees(
        event_id: UUID,
        q: str = Query(min_length=2, max_length=100),
        limit: int = Query(10, ge=1, le=25),
        ids=Depends(principal),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = scanner_event(db, user, event_id)
            return search_attendees(db, event, q, limit)

    # ------------------------------------------------ scanner: devices

    @routes.get("/scanner/signing-keys", response_model=s.SigningKeys)
    def keys(ids=Depends(principal)):
        with factory() as db:
            valid_session(db, *ids)
        return signing_keys(settings)

    @routes.post("/scanner/devices", response_model=s.DeviceView)
    def add_device(data: s.DeviceInput, response: Response, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            device, created = register_device(db, user, data)
            response.status_code = 201 if created else 200
            return device_view(device)

    @routes.get("/scanner/devices", response_model=list[s.DeviceView])
    def my_devices(ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            rows = db.scalars(
                select(ScannerDevice)
                .where(ScannerDevice.owner_user_id == user.id)
                .order_by(ScannerDevice.created_at, ScannerDevice.id)
            )
            return [device_view(row) for row in rows]

    @routes.post("/scanner/devices/{device_id}/revoke", response_model=s.DeviceView)
    def drop_device(device_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return device_view(revoke_device(db, user, device_id))

    # ------------------------------------------------ scanner: offline package and sync

    @routes.post(
        "/scanner/events/{event_id}/offline-packages",
        response_model=s.PackageView,
        status_code=201,
    )
    def offline_package(event_id: UUID, data: s.PackageInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return build_package(db, settings, user, ids[1], event_id, data.device_id)

    @routes.post("/scanner/offline/sync", response_model=s.SyncResult)
    def offline_sync(data: s.SyncInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return sync(db, settings, user, ids[1], data)

    # ------------------------------------------------ organizer: review

    @routes.get("/events/{event_id}/sync-conflicts")
    def conflicts(
        event_id: UUID,
        status: Literal["open", "resolved"] | None = None,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        ids=Depends(principal),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "attendees")
            return list_conflicts(db, event, status, limit, offset)

    @routes.get("/events/{event_id}/offline-operations")
    def operations(
        event_id: UUID,
        status: Literal["accepted", "duplicate", "rejected", "conflict"] | None = None,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        ids=Depends(principal),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "attendees")
            return list_operations(db, event, status, limit, offset)

    @routes.post("/sync-conflicts/{conflict_id}/resolve")
    def resolve(conflict_id: UUID, data: s.ResolveInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return resolve_conflict(db, user, conflict_id, data)

    return routes
