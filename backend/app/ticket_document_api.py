from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from .service import rate_limit, valid_session
from .ticket_document_service import (
    delivery_ticket,
    delivery_view,
    recipient_ticket,
    resend_delivery,
    ticket_pdf,
)


class DeliveryView(BaseModel):
    ticket_id: UUID
    ticket_status: str
    recipient_email: str
    status: str  # none | queued | sending | delivered | failed
    attempt_count: int
    last_error: str | None
    last_delivered_at: datetime | None
    resend_count: int
    can_resend: bool
    next_resend_at: datetime | None


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1/tickets", tags=["ticket-documents"])

    @routes.get(
        "/{ticket_id}/pdf",
        response_class=Response,
        responses={200: {"content": {"application/pdf": {}}}},
    )
    def pdf(ticket_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            ticket, item, order = recipient_ticket(db, user, ticket_id)
            content = ticket_pdf(settings, ticket, item, order)
        return Response(
            content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="biletflow-ticket-{ticket_id}.pdf"'
            },
        )

    @routes.get("/{ticket_id}/delivery", response_model=DeliveryView)
    def delivery(ticket_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            ticket, item, _ = delivery_ticket(db, user, ticket_id)
            return delivery_view(db, ticket, item)

    @routes.post("/{ticket_id}/delivery/resend", response_model=DeliveryView, status_code=202)
    def resend(ticket_id: UUID, request: Request, ids=Depends(principal)):
        rate_limit(
            factory,
            settings,
            request.client.host if request.client else "unknown",
            "ticket_resend",
            str(ids[0]),
        )
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            ticket, item = resend_delivery(db, user, ticket_id)
            return delivery_view(db, ticket, item)

    return routes
