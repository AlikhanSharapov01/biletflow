from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text

from .analytics_schemas import EventAnalytics, SalesSeries
from .analytics_service import report_csv, sales_series, summary
from .catalog_models import Organization
from .catalog_service import catalog_audit, event_guard
from .security import fail
from .service import valid_session


def analytics_filters(
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    ticket_type_id: UUID | None = None,
    campaign_id: UUID | None = None,
):
    if any(value is not None and value.utcoffset() is None for value in (from_, to)):
        fail("invalid_analytics_filter", 422)
    if from_ is not None and to is not None and from_ >= to:
        fail("invalid_range", 422)
    return {"from_": from_, "to": to, "ticket_type_id": ticket_type_id, "campaign_id": campaign_id}


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1/events", tags=["analytics"])

    def read(event_id, ids, filters, bucket=None):
        with factory() as db:
            db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
            db.execute(text("SET LOCAL statement_timeout = '5s'"))
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "reports")
            return (
                sales_series(db, event, filters, bucket) if bucket else summary(db, event, filters)
            )

    @routes.get("/{event_id}/analytics", response_model=EventAnalytics)
    def analytics(event_id: UUID, filters=Depends(analytics_filters), ids=Depends(principal)):
        return read(event_id, ids, filters)

    @routes.get("/{event_id}/analytics/sales-series", response_model=SalesSeries)
    def series(
        event_id: UUID,
        bucket: Literal["day", "hour"] = "day",
        filters=Depends(analytics_filters),
        ids=Depends(principal),
    ):
        return read(event_id, ids, filters, bucket)

    @routes.get(
        "/{event_id}/analytics/export.csv",
        response_class=Response,
        responses={200: {"content": {"text/csv": {}}}},
    )
    def export(
        event_id: UUID,
        bucket: Literal["day", "hour"] = "day",
        filters=Depends(analytics_filters),
        ids=Depends(principal),
    ):
        # One repeatable-read snapshot as for the JSON reports; writable only for the audit row.
        with factory.begin() as db:
            db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            db.execute(text("SET LOCAL statement_timeout = '5s'"))
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "reports")
            content = report_csv(db, event, filters, bucket)
            org = db.get(Organization, event.organization_id)
            catalog_audit(db, user, "analytics.exported", org, event, event)
        return Response(
            content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="analytics-{event_id}.csv"'},
        )

    return routes
