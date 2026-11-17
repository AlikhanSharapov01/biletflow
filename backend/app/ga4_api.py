from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from .catalog_service import catalog_audit, organization_guard
from .ga4_models import GA4Connection
from .ga4_schemas import (
    ConnectionUpdate,
    ConnectionView,
    Measurement,
    MeasurementResult,
    TrafficReport,
)
from .ga4_service import (
    collect,
    connection_view,
    measurement_rate_limit,
    refusal,
    set_connection,
    traffic_report,
)
from .service import valid_session


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["ga4"])

    @routes.get("/organizations/{organization_id}/ga4-connection", response_model=ConnectionView)
    def connection(organization_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            org = organization_guard(db, user, organization_id, "owner")
            row = db.scalar(select(GA4Connection).where(GA4Connection.organization_id == org.id))
            return connection_view(settings, org.id, row)

    @routes.put("/organizations/{organization_id}/ga4-connection", response_model=ConnectionView)
    def update_connection(organization_id: UUID, data: ConnectionUpdate, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids)
            org = organization_guard(db, user, organization_id, "owner", lock=True)
            row = set_connection(db, settings, org, data.is_enabled)
            if row:
                action = "ga4.connection_enabled" if row.is_enabled else "ga4.connection_disabled"
                catalog_audit(db, user, action, org, None, row)
            return connection_view(settings, org.id, row)

    @routes.post("/analytics/measurements", status_code=202, response_model=MeasurementResult)
    def measurement(data: Measurement, request: Request, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            refused = refusal(settings, user)
        if refused:
            return refused
        ip = request.client.host if request.client else "unknown"
        measurement_rate_limit(factory, settings, ip, user.id)
        with factory.begin() as db:
            user, _ = valid_session(db, *ids)
            return collect(db, settings, user, data)

    @routes.get("/events/{event_id}/analytics/traffic", response_model=TrafficReport)
    def traffic(
        event_id: UUID,
        request: Request,
        from_: date | None = Query(None, alias="from"),
        to: date | None = None,
        ids=Depends(principal),
    ):
        provider = request.app.state.ga4
        return traffic_report(factory, settings, provider, ids, event_id, from_, to)

    return routes
