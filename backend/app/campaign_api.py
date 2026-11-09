from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response

from . import campaign_schemas as s
from .campaign_schemas import normalize_code
from .campaign_service import (
    campaign_qr_svg,
    campaign_report,
    campaign_view,
    create_campaign,
    disable_campaign,
    list_campaigns,
    owned_campaign,
    preview,
    promo_of,
    resolve_link,
    staff_event,
    update_campaign,
)
from .catalog_service import event_guard
from .security import decode_access, fail
from .service import rate_limit, valid_session

# Public lookups are limited tightly enough that guessing codes is pointless, while a whole
# campus sharing one address can still open a campaign link.
LOOKUPS_PER_ACCOUNT = 30
LOOKUPS_PER_ADDRESS = 120


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1", tags=["campaigns"])
    lookup_limits = settings.model_copy(
        update={"rate_identity_limit": LOOKUPS_PER_ACCOUNT, "rate_ip_limit": LOOKUPS_PER_ADDRESS}
    )

    def viewer(db, request):
        header = request.headers.get("authorization")
        if not header:
            return None
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "bearer" or len(value) > 8192:
            fail()
        return valid_session(db, *decode_access(settings, value))[0]

    def limit_lookup(request, operation, user):
        rate_limit(
            factory,
            lookup_limits,
            request.client.host if request.client else "unknown",
            operation,
            str(user.id) if user else None,
        )

    @routes.get("/events/{event_id}/campaigns", response_model=list[s.CampaignView])
    def campaigns(event_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return list_campaigns(db, settings, staff_event(db, user, event_id))

    @routes.post("/events/{event_id}/campaigns", response_model=s.CampaignView, status_code=201)
    def create(event_id: UUID, data: s.CampaignInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return create_campaign(db, settings, user, event_id, data)

    @routes.get("/events/{event_id}/campaigns/{campaign_id}", response_model=s.CampaignView)
    def read(event_id: UUID, campaign_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = staff_event(db, user, event_id)
            return campaign_view(db, settings, owned_campaign(db, event.id, campaign_id))

    @routes.put("/events/{event_id}/campaigns/{campaign_id}", response_model=s.CampaignView)
    def edit(event_id: UUID, campaign_id: UUID, data: s.CampaignInput, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return update_campaign(db, settings, user, event_id, campaign_id, data)

    @routes.post(
        "/events/{event_id}/campaigns/{campaign_id}/disable", response_model=s.CampaignView
    )
    def disable(event_id: UUID, campaign_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            return disable_campaign(db, settings, user, event_id, campaign_id)

    @routes.get("/events/{event_id}/campaigns/{campaign_id}/qr.svg")
    def qr(event_id: UUID, campaign_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = staff_event(db, user, event_id)
            campaign = owned_campaign(db, event.id, campaign_id)
            svg = campaign_qr_svg(settings, promo_of(db, campaign.id))
        return Response(svg, media_type="image/svg+xml")

    @routes.get(
        "/events/{event_id}/campaigns/{campaign_id}/report", response_model=s.CampaignReport
    )
    def report(event_id: UUID, campaign_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            event = event_guard(db, user, event_id, "reports")
            return campaign_report(db, owned_campaign(db, event.id, campaign_id))

    @routes.get("/events/{event_id}/promo-codes/{code}/preview", response_model=s.PromoPreview)
    def promo_preview(event_id: UUID, code: str, request: Request):
        with factory() as db:
            user = viewer(db, request)
        limit_lookup(request, "promo_preview", user)
        with factory() as db:
            return preview(db, user, event_id, normalize_code(code) or "")

    @routes.get("/campaign-links/{token}", response_model=s.CampaignLink)
    def campaign_link(token: str, request: Request):
        with factory() as db:
            user = viewer(db, request)
        limit_lookup(request, "campaign_link", user)
        if len(token) > 128:
            fail("promo_not_found", 404)
        with factory() as db:
            return resolve_link(db, user, token)

    return routes
