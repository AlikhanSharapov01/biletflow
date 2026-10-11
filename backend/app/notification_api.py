from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select

from .notification_models import Notification
from .notification_service import mark_read, render, target_of, unread_count
from .security import fail
from .service import valid_session


class Target(BaseModel):
    type: str
    id: str | None


class NotificationView(BaseModel):
    id: UUID
    kind: str
    locale: str
    title: str
    body: str
    event_id: UUID | None
    target: Target
    payload: dict
    read_at: datetime | None
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


class Updated(BaseModel):
    updated: int


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["notifications"])

    def view(row):
        title, body = render(settings, row.kind, row.locale, row.safe_payload)
        return {
            "id": row.id,
            "kind": row.kind,
            "locale": row.locale,
            "title": title,
            "body": body,
            "event_id": row.event_id,
            "target": target_of(row.kind, row.safe_payload),
            "payload": row.safe_payload,
            "read_at": row.read_at,
            "created_at": row.created_at,
        }

    @routes.get("/notifications", response_model=list[NotificationView])
    def inbox(
        ids=Depends(principal),
        unread_only: bool = False,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            query = select(Notification).where(Notification.recipient_user_id == user.id)
            if unread_only:
                query = query.where(Notification.read_at.is_(None))
            rows = db.scalars(
                query.order_by(Notification.created_at.desc(), Notification.id.desc())
                .limit(limit)
                .offset(offset)
            )
            return [view(row) for row in rows]

    @routes.get("/notifications/unread-count", response_model=UnreadCount)
    def unread(ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return {"unread": unread_count(db, user.id)}

    @routes.post("/notifications/read-all", response_model=Updated)
    def read_all(ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return {"updated": mark_read(db, user.id)}

    @routes.post("/notifications/{notification_id}/read", response_model=NotificationView)
    def read_one(notification_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            row = db.scalar(
                select(Notification).where(
                    Notification.id == notification_id, Notification.recipient_user_id == user.id
                )
            )
            if not row:
                fail("notification_not_found", 404)
            mark_read(db, user.id, notification_id)
            db.refresh(row)
            return view(row)

    return routes
