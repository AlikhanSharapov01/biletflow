from fastapi import APIRouter, Response
from pydantic import BaseModel

from .platform_settings import public_settings


class PublicSettings(BaseModel):
    hold_minutes: int
    processing_rate_bps: int
    activation_fee_minor: int
    upload_max_bytes: int
    currency: str


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["settings"])

    @routes.get("/settings/public", response_model=PublicSettings)
    def read_public_settings(response: Response):
        """Values currently in force for new holds, quotes, activations and uploads."""
        response.headers["Cache-Control"] = "no-store"
        with factory() as db:
            return public_settings(db, settings)

    return routes
