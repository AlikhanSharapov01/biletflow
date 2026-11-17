"""Admin routes for exhausted background work and its bounded retry (#73)."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import text

from . import admin_schemas as s
from .admin_jobs import (
    delivery_page,
    delivery_view,
    job_page,
    job_view,
    retry_delivery,
    retry_job,
)
from .admin_service import admin_guard
from .idempotency import checked_key, fingerprint, guard, remember, remembered
from .models import OutboxJob
from .notification_models import NotificationDelivery
from .notification_service import CHANNELS
from .security import fail

ADMIN = "/api/v1/admin"
Limit = Query(50, ge=1, le=100)
Offset = Query(0, ge=0, le=100000)
JobStatus = Literal["pending", "leased", "done", "dead"]
DeliveryStatus = Literal["pending", "sent", "failed"]
NoticeKind = Literal[tuple(CHANNELS)]


def router(factory, settings, principal):
    routes = APIRouter(tags=["admin"])

    def found(db, model, identifier, code):
        row = db.get(model, identifier)
        if not row:
            fail(code, 404)
        return row

    def retried(ids, raw_key, operation, target, identifier, reason, action, view):
        """Optional Idempotency-Key: an identical retry returns the current row unchanged."""
        key = checked_key(raw_key)
        request_hash = fingerprint({"id": str(identifier), "reason": reason})
        with factory.begin() as db:
            if key:
                guard(db, ids[0], operation, key)
            admin = admin_guard(db, ids)
            if key and remembered(db, admin.id, operation, key, request_hash):
                return view(db, db.get(target, identifier))
            row = action(db, admin, identifier, reason)
            if key:
                remember(
                    db, admin.id, operation, key, request_hash, target.__table__.name, row.id, 200
                )
            return view(db, row)

    @routes.get(ADMIN + "/jobs", response_model=s.Page)
    def jobs(
        ids=Depends(principal),
        status: JobStatus | None = None,
        kind: str | None = Query(None, min_length=1, max_length=64),
        event_id: UUID | None = None,
        linked_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            db.execute(text("SET LOCAL statement_timeout = '5s'"))
            admin_guard(db, ids)
            return job_page(db, limit, offset, status, kind, event_id, linked_id)

    @routes.get(ADMIN + "/jobs/{job_id}")
    def job(job_id: UUID, ids=Depends(principal)):
        with factory() as db:
            admin_guard(db, ids)
            return job_view(db, found(db, OutboxJob, job_id, "job_not_found"))

    @routes.post(ADMIN + "/jobs/{job_id}/retry")
    def retry_one_job(
        job_id: UUID,
        data: s.ReasonInput,
        ids=Depends(principal),
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    ):
        return retried(
            ids,
            idempotency_key,
            "admin.job_retried",
            OutboxJob,
            job_id,
            data.reason,
            retry_job,
            job_view,
        )

    @routes.get(ADMIN + "/notification-deliveries", response_model=s.Page)
    def deliveries(
        ids=Depends(principal),
        status: DeliveryStatus | None = None,
        channel: Literal["email", "in_app"] | None = None,
        kind: NoticeKind | None = None,
        recipient_user_id: UUID | None = None,
        event_id: UUID | None = None,
        notification_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            db.execute(text("SET LOCAL statement_timeout = '5s'"))
            admin_guard(db, ids)
            return delivery_page(
                db,
                limit,
                offset,
                status=status,
                channel=channel,
                kind=kind,
                recipient_user_id=recipient_user_id,
                event_id=event_id,
                notification_id=notification_id,
            )

    @routes.get(ADMIN + "/notification-deliveries/{delivery_id}")
    def delivery(delivery_id: UUID, ids=Depends(principal)):
        with factory() as db:
            admin_guard(db, ids)
            row = found(db, NotificationDelivery, delivery_id, "delivery_not_found")
            return delivery_view(db, row)

    @routes.post(ADMIN + "/notification-deliveries/{delivery_id}/retry")
    def retry_one_delivery(
        delivery_id: UUID,
        data: s.ReasonInput,
        ids=Depends(principal),
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    ):
        return retried(
            ids,
            idempotency_key,
            "admin.notification_delivery_retried",
            NotificationDelivery,
            delivery_id,
            data.reason,
            retry_delivery,
            delivery_view,
        )

    return routes
