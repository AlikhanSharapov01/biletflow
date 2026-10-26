from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select

from . import admin_schemas as s
from .admin_models import EventReport, ModerationAction, SettingVersion
from .admin_service import (
    EXPORT_MAX_ROWS,
    SEARCHES,
    admin_audit,
    admin_guard,
    change_setting,
    export_csv,
    moderate_event,
    moderate_user,
    report_page,
    resolve_report,
    review_report,
    search_page,
    setting_view,
    submit_report,
)
from .security import fail
from .service import valid_session

ADMIN = "/api/v1/admin"
Limit = Query(50, ge=1, le=100)
Offset = Query(0, ge=0, le=100000)
Q = Query(None, min_length=1, max_length=100)
UserStatus = Literal["active", "suspended"]
Moderation = Literal["normal", "suspended"]
Publication = Literal["draft", "published", "unpublished", "cancelled"]
OrderStatus = Literal[
    "pending", "confirmed", "failed", "expired", "cancelled", "refund_pending", "refunded"
]
TicketStatus = Literal["valid", "checked_in", "refund_pending", "refunded", "cancelled"]
ReportStatus = Literal["open", "reviewing", "resolved"]
Kind = Literal["users", "events", "orders", "tickets"]


def router(factory, settings, principal):
    routes = APIRouter(tags=["admin"])

    @routes.get(ADMIN + "/me", response_model=s.AdminMe)
    def admin_me(ids=Depends(principal)):
        with factory() as db:
            return {"user_id": admin_guard(db, ids).id}

    # ------------------------------------------------------------ search
    @routes.get(ADMIN + "/users", response_model=s.Page)
    def users(
        ids=Depends(principal),
        q: str | None = Q,
        status: UserStatus | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            admin_guard(db, ids)
            return search_page(db, "users", limit, offset, q=q, status=status)

    @routes.get(ADMIN + "/events", response_model=s.Page)
    def events(
        ids=Depends(principal),
        q: str | None = Q,
        moderation_state: Moderation | None = None,
        publication_state: Publication | None = None,
        organization_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            admin_guard(db, ids)
            return search_page(
                db,
                "events",
                limit,
                offset,
                q=q,
                moderation_state=moderation_state,
                publication_state=publication_state,
                organization_id=organization_id,
            )

    @routes.get(ADMIN + "/orders", response_model=s.Page)
    def orders(
        ids=Depends(principal),
        q: str | None = Q,
        status: OrderStatus | None = None,
        event_id: UUID | None = None,
        buyer_user_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            admin_guard(db, ids)
            return search_page(
                db,
                "orders",
                limit,
                offset,
                q=q,
                status=status,
                event_id=event_id,
                buyer_user_id=buyer_user_id,
            )

    @routes.get(ADMIN + "/tickets", response_model=s.Page)
    def tickets(
        ids=Depends(principal),
        q: str | None = Q,
        status: TicketStatus | None = None,
        event_id: UUID | None = None,
        order_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            admin_guard(db, ids)
            return search_page(
                db,
                "tickets",
                limit,
                offset,
                q=q,
                status=status,
                event_id=event_id,
                order_id=order_id,
            )

    # ------------------------------------------------------------ moderation
    @routes.post(ADMIN + "/users/{user_id}/suspend", response_model=s.ModerationView)
    def suspend_user(user_id: UUID, data: s.ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            return moderate_user(db, admin, user_id, True, data.reason)

    @routes.post(ADMIN + "/users/{user_id}/reinstate", response_model=s.ModerationView)
    def reinstate_user(user_id: UUID, data: s.ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            return moderate_user(db, admin, user_id, False, data.reason)

    @routes.post(ADMIN + "/events/{event_id}/suspend", response_model=s.ModerationView)
    def suspend_event(event_id: UUID, data: s.ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            return moderate_event(db, admin, event_id, True, data.reason)

    @routes.post(ADMIN + "/events/{event_id}/reinstate", response_model=s.ModerationView)
    def reinstate_event(event_id: UUID, data: s.ReasonInput, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            return moderate_event(db, admin, event_id, False, data.reason)

    @routes.get(ADMIN + "/moderation-actions", response_model=list[s.ModerationView])
    def moderation_history(
        ids=Depends(principal),
        user_id: UUID | None = None,
        event_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            admin_guard(db, ids)
            query = select(ModerationAction)
            if user_id:
                query = query.where(ModerationAction.target_user_id == user_id)
            if event_id:
                query = query.where(ModerationAction.target_event_id == event_id)
            return list(
                db.scalars(
                    query.order_by(ModerationAction.created_at.desc(), ModerationAction.id)
                    .limit(limit)
                    .offset(offset)
                )
            )

    # ------------------------------------------------------------ reports
    @routes.post(
        "/api/v1/events/{event_id}/reports",
        response_model=s.ReporterReceipt,
        status_code=201,
        tags=["reports"],
    )
    def report_event(
        event_id: UUID, data: s.ReportCreate, response: Response, ids=Depends(principal)
    ):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            report, duplicate = submit_report(db, user, event_id, data)
            if duplicate:
                response.status_code = 200
            return {
                "id": report.id,
                "event_id": report.event_id,
                "category": report.category,
                "status": report.status,
                "created_at": report.created_at,
                "duplicate": duplicate,
            }

    @routes.get(ADMIN + "/reports", response_model=s.Page)
    def report_queue(
        ids=Depends(principal),
        status: ReportStatus | None = None,
        event_id: UUID | None = None,
        limit: int = Limit,
        offset: int = Offset,
    ):
        with factory() as db:
            admin_guard(db, ids)
            page = report_page(db, limit, offset, status, event_id)
            page["items"] = [s.ReportView.model_validate(row) for row in page["items"]]
            return page

    @routes.get(ADMIN + "/reports/{report_id}", response_model=s.ReportView)
    def report_detail(report_id: UUID, ids=Depends(principal)):
        with factory() as db:
            admin_guard(db, ids)
            report = db.get(EventReport, report_id)
            if not report:
                fail("report_not_found", 404)
            return report

    @routes.post(ADMIN + "/reports/{report_id}/review", response_model=s.ReportView)
    def start_review(report_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            return review_report(db, admin, report_id)

    @routes.post(ADMIN + "/reports/{report_id}/resolve", response_model=s.ReportView)
    def finish_review(report_id: UUID, data: s.ReportResolve, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            return resolve_report(db, admin, report_id, data.resolution)

    # ------------------------------------------------------------ settings
    @routes.get(ADMIN + "/settings", response_model=list[s.SettingView])
    def list_settings(ids=Depends(principal)):
        with factory() as db:
            admin_guard(db, ids)
            return [setting_view(db, key) for key in s.SETTINGS]

    @routes.put(ADMIN + "/settings/{key}", response_model=s.SettingView)
    def put_setting(key: s.SettingKey, data: s.SettingUpdate, ids=Depends(principal)):
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            change_setting(db, admin, key, data)
            db.flush()
            return setting_view(db, key)

    @routes.get(ADMIN + "/settings/{key}/history", response_model=list[s.SettingHistory])
    def setting_history(
        key: s.SettingKey, ids=Depends(principal), limit: int = Limit, offset: int = Offset
    ):
        with factory() as db:
            admin_guard(db, ids)
            return list(
                db.scalars(
                    select(SettingVersion)
                    .where(SettingVersion.setting_key == key)
                    .order_by(SettingVersion.version.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )

    # ------------------------------------------------------------ CSV export
    @routes.get(ADMIN + "/exports/{kind}.csv")
    def export(
        kind: Kind,
        ids=Depends(principal),
        q: str | None = Q,
        status: str | None = Query(None, max_length=32),
        event_id: UUID | None = None,
        limit: int = Query(1000, ge=1, le=EXPORT_MAX_ROWS),
    ):
        if kind not in SEARCHES:
            fail("export_not_found", 404)
        filters = {"q": q, "status": status}
        if kind == "events":
            filters = {"q": q, "moderation_state": status}
        elif kind in ("orders", "tickets"):
            filters["event_id"] = event_id
        if status and kind != "events":
            allowed = {
                "users": ("active", "suspended"),
                "orders": OrderStatus.__args__,
                "tickets": TicketStatus.__args__,
            }[kind]
            if status not in allowed:
                fail("invalid_filter", 422)
        if status and kind == "events" and status not in ("normal", "suspended"):
            fail("invalid_filter", 422)
        with factory.begin() as db:
            admin = admin_guard(db, ids)
            body = export_csv(db, kind, limit, **filters)
            admin_audit(
                db,
                admin,
                "admin.export",
                "export",
                admin.id,
                safe_change={
                    "kind": kind,
                    "limit": limit,
                    "filters": {k: str(v) for k, v in filters.items() if v},
                },
            )
        return Response(
            body,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{kind}.csv"'},
        )

    return routes
