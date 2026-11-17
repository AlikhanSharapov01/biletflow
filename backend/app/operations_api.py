from fastapi import APIRouter, Depends

from . import operations_schemas as s
from .admin_service import admin_guard
from .operations_service import job_metrics
from .security import now


def router(factory, settings, principal, metrics):
    routes = APIRouter(prefix="/api/v1/admin/operations", tags=["operations"])

    @routes.get("/metrics", response_model=s.OperationsMetrics)
    def operations_metrics(ids=Depends(principal)):
        # Request figures are this API process since start; job figures come from the database.
        with factory() as db:
            admin_guard(db, ids)
            jobs = job_metrics(db)
        return {"generated_at": now(), "requests": metrics.snapshot(), "jobs": jobs}

    return routes
