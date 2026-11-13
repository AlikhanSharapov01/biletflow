"""SRS 4.14: organizer campaigns, promo validation, reservation and redemption.

Every limit is counted while the caller holds the event lock, as the database specification
requires: completed redemptions plus active reservations never exceed max_redemptions.
"""

import secrets
from uuid import uuid4

from sqlalchemy import func, select, update

from .campaign_models import (
    Campaign,
    CampaignTicketType,
    PromoCode,
    PromoRedemption,
    PromoReservation,
)
from .catalog_models import Organization, TicketType
from .catalog_service import catalog_audit, editable, event_caps, event_guard
from .checkout_models import OrderItem, Ticket, TicketOrder
from .commerce_models import Refund
from .pricing import is_eligible
from .security import derive, digest, fail, now
from .ticket_pdf import qr_matrix

LINK_PURPOSE = "campaign_link"
# No 0/O or 1/I, so a generated code survives being read aloud or retyped from a poster.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
GENERATED_CODE_LENGTH = 10
QR_CAPTION = "Promo link, not an entry ticket"


def link_token(settings, promo_id):
    # Derived, so only its hash is stored while the link can still be shown to the organizer.
    return derive(settings, LINK_PURPOSE, promo_id)


def link_url(settings, promo):
    return f"{settings.frontend_url.rstrip('/')}/c/{link_token(settings, promo.id)}"


def type_ids_of(db, campaign_id):
    return list(
        db.scalars(
            select(CampaignTicketType.ticket_type_id)
            .where(CampaignTicketType.campaign_id == campaign_id)
            .order_by(CampaignTicketType.ticket_type_id)
        )
    )


def redemption_count(db, campaign_id):
    return db.scalar(
        select(func.count(PromoRedemption.id)).where(PromoRedemption.campaign_id == campaign_id)
    )


def usage(db, campaign_id):
    """Lifetime allowance consumed: redemptions plus reservations still in progress."""
    active = db.scalar(
        select(func.count(PromoReservation.id)).where(
            PromoReservation.campaign_id == campaign_id, PromoReservation.status == "active"
        )
    )
    return redemption_count(db, campaign_id) + active


def public_discount(campaign):
    if campaign.discount_kind == "percentage":
        return "percent", campaign.percentage_bps // 100
    return "fixed", campaign.fixed_minor


def status_of(campaign):
    current = now()
    if not campaign.is_enabled:
        return "disabled"
    if current < campaign.starts_at:
        return "scheduled"
    return "active" if current < campaign.ends_at else "ended"


def promo_of(db, campaign_id):
    return db.scalar(select(PromoCode).where(PromoCode.campaign_id == campaign_id))


def campaign_view(db, settings, campaign):
    promo = promo_of(db, campaign.id)
    kind, value = public_discount(campaign)
    return {
        "id": campaign.id,
        "event_id": campaign.event_id,
        "name": campaign.name,
        "discount_kind": kind,
        "value": value,
        "starts_at": campaign.starts_at,
        "ends_at": campaign.ends_at,
        "max_redemptions": campaign.max_redemptions,
        "eligible_ticket_type_ids": []
        if campaign.all_ticket_types
        else type_ids_of(db, campaign.id),
        "code": promo.code_normalized,
        "created_at": campaign.created_at,
        "status": status_of(campaign),
        "redemptions_used": redemption_count(db, campaign.id),
        "link_url": link_url(settings, promo),
    }


def staff_event(db, user, event_id):
    """Readable by staff who can either edit the event or see its reports."""
    event = event_guard(db, user, event_id)
    caps = event_caps(db, user, event)
    if not caps:
        fail("event_not_found", 404)
    if not caps & {"event_edit", "reports"}:
        fail("permission_denied", 403)
    return event


def owned_campaign(db, event_id, campaign_id, lock=False):
    query = select(Campaign).where(Campaign.id == campaign_id, Campaign.event_id == event_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    campaign = db.scalar(query)
    if not campaign:
        fail("campaign_not_found", 404)
    return campaign


def list_campaigns(db, settings, event):
    rows = db.scalars(
        select(Campaign)
        .where(Campaign.event_id == event.id)
        .order_by(Campaign.created_at.desc(), Campaign.id)
    )
    return [campaign_view(db, settings, row) for row in rows]


def discount_columns(data):
    if data.discount_kind == "percent":
        return {
            "discount_kind": "percentage",
            "percentage_bps": data.value * 100,
            "fixed_minor": None,
        }
    return {"discount_kind": "fixed", "percentage_bps": None, "fixed_minor": data.value}


def checked_types(db, event, type_ids):
    found = set(
        db.scalars(
            select(TicketType.id).where(
                TicketType.event_id == event.id, TicketType.id.in_(type_ids)
            )
        )
    )
    if found != set(type_ids):
        fail("ticket_type_not_found", 422)


def code_taken(db, event_id, code, promo_id=None):
    query = select(PromoCode.id).where(
        PromoCode.event_id == event_id, PromoCode.code_normalized == code
    )
    if promo_id:
        query = query.where(PromoCode.id != promo_id)
    return db.scalar(query) is not None


def generated_code(db, event_id):
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(GENERATED_CODE_LENGTH))
        if not code_taken(db, event_id, code):
            return code


def audit(db, user, event, campaign, action):
    catalog_audit(db, user, action, db.get(Organization, event.organization_id), event, campaign)


def set_types(db, campaign, type_ids):
    existing = {
        row.ticket_type_id: row
        for row in db.scalars(
            select(CampaignTicketType).where(CampaignTicketType.campaign_id == campaign.id)
        )
    }
    for type_id, row in existing.items():
        if type_id not in type_ids:
            db.delete(row)
    for type_id in set(type_ids) - existing.keys():
        db.add(
            CampaignTicketType(
                event_id=campaign.event_id, campaign_id=campaign.id, ticket_type_id=type_id
            )
        )


def create_campaign(db, settings, user, event_id, data):
    event = event_guard(db, user, event_id, "event_edit", lock=True)
    editable(event)
    checked_types(db, event, data.eligible_ticket_type_ids)
    code = data.code or generated_code(db, event.id)
    if code_taken(db, event.id, code):
        fail("promo_code_taken", 409)
    campaign = Campaign(
        event_id=event.id,
        name=data.name.strip(),
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        max_redemptions=data.max_redemptions,
        all_ticket_types=not data.eligible_ticket_type_ids,
        **discount_columns(data),
    )
    db.add(campaign)
    db.flush()
    promo_id = uuid4()
    db.add(
        PromoCode(
            id=promo_id,
            event_id=event.id,
            campaign_id=campaign.id,
            code_normalized=code,
            link_token_hash=digest(link_token(settings, promo_id)),
        )
    )
    set_types(db, campaign, data.eligible_ticket_type_ids)
    db.flush()
    audit(db, user, event, campaign, "campaign.created")
    return campaign_view(db, settings, campaign)


def update_campaign(db, settings, user, event_id, campaign_id, data):
    event = event_guard(db, user, event_id, "event_edit", lock=True)
    editable(event)
    campaign = owned_campaign(db, event.id, campaign_id, lock=True)
    promo = promo_of(db, campaign.id)
    checked_types(db, event, data.eligible_ticket_type_ids)
    code = data.code or promo.code_normalized
    columns = discount_columns(data)
    new_definition = (
        columns["discount_kind"],
        columns["percentage_bps"],
        columns["fixed_minor"],
        set(data.eligible_ticket_type_ids),
        code,
    )
    old_definition = (
        campaign.discount_kind,
        campaign.percentage_bps,
        campaign.fixed_minor,
        set(type_ids_of(db, campaign.id)),
        promo.code_normalized,
    )
    if new_definition != old_definition and redemption_count(db, campaign.id):
        fail("campaign_locked", 409)
    if data.max_redemptions is not None and data.max_redemptions < usage(db, campaign.id):
        fail("promo_limit_below_usage", 409)
    if code_taken(db, event.id, code, promo.id):
        fail("promo_code_taken", 409)
    campaign.name = data.name.strip()
    campaign.starts_at, campaign.ends_at = data.starts_at, data.ends_at
    campaign.max_redemptions = data.max_redemptions
    campaign.all_ticket_types = not data.eligible_ticket_type_ids
    for name, value in columns.items():
        setattr(campaign, name, value)
    promo.code_normalized = code
    set_types(db, campaign, data.eligible_ticket_type_ids)
    db.flush()
    audit(db, user, event, campaign, "campaign.updated")
    return campaign_view(db, settings, campaign)


def disable_campaign(db, settings, user, event_id, campaign_id):
    event = event_guard(db, user, event_id, "event_edit", lock=True)
    campaign = owned_campaign(db, event.id, campaign_id, lock=True)
    if campaign.is_enabled:
        campaign.is_enabled = False
        promo_of(db, campaign.id).is_enabled = False
        audit(db, user, event, campaign, "campaign.disabled")
    return campaign_view(db, settings, campaign)


def campaign_report(db, campaign):
    orders = list(
        db.scalars(
            select(TicketOrder)
            .join(PromoRedemption, PromoRedemption.order_id == TicketOrder.id)
            .where(PromoRedemption.campaign_id == campaign.id)
        )
    )
    order_ids = [order.id for order in orders]
    statuses = list(
        db.scalars(
            select(Ticket.status)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id.in_(order_ids))
        )
    )
    attempts = [
        o.fulfillment_payment_attempt_id for o in orders if o.fulfillment_payment_attempt_id
    ]
    refunds = db.scalar(
        select(func.coalesce(func.sum(Refund.amount_minor), 0)).where(
            Refund.payment_attempt_id.in_(attempts), Refund.status == "succeeded"
        )
    )
    collected = sum(order.payable_minor for order in orders)
    fees = sum(order.processing_fee_minor for order in orders)
    refunded = sum(status == "refunded" for status in statuses)
    return {
        "campaign_id": campaign.id,
        "redemptions": len(orders),
        "orders": len(orders),
        "tickets": len(statuses),
        "tickets_refunded": refunded,
        "tickets_kept": sum(status in ("valid", "checked_in") for status in statuses),
        "gross_minor": sum(order.gross_minor for order in orders),
        "discount_minor": sum(order.discount_minor for order in orders),
        "collected_minor": collected,
        "refunds_minor": refunds,
        "fees_minor": fees,
        "net_minor": collected - refunds - fees,
        "generated_at": now(),
    }


def campaign_qr_svg(settings, promo):
    """Round modules and a printed caption, so it cannot be mistaken for a square ticket QR."""
    matrix = qr_matrix(link_url(settings, promo))
    quiet = 4
    size = len(matrix) + 2 * quiet
    band = 6
    dots = "".join(
        f'<circle cx="{c + quiet + 0.5}" cy="{r + quiet + 0.5}" r="0.46"/>'
        for r, row in enumerate(matrix)
        for c, dark in enumerate(row)
        if dark
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size + band}" '
        f'role="img" aria-label="{QR_CAPTION}">'
        f'<rect width="{size}" height="{size + band}" fill="#fff"/>'
        f'<g fill="#5b21b6">{dots}</g>'
        f'<text x="{size / 2}" y="{size + band / 2}" text-anchor="middle" font-size="2.4" '
        f'font-family="sans-serif" fill="#111">{QR_CAPTION}</text>'
        "</svg>"
    )


# ---------------------------------------------------------------------------
# Buyer side. The caller holds the event lock in every function that writes.
# ---------------------------------------------------------------------------


def find_code(db, event_id, code):
    promo = db.scalar(
        select(PromoCode).where(PromoCode.event_id == event_id, PromoCode.code_normalized == code)
    )
    if not promo:
        fail("promo_not_found", 404)
    return promo


def ensure_usable(db, campaign, promo):
    current = now()
    if not campaign.is_enabled or not promo.is_enabled:
        fail("promo_disabled", 409)
    if current >= campaign.ends_at:
        fail("promo_expired", 409)
    if current < campaign.starts_at:
        fail("promo_not_applicable", 409)
    if campaign.max_redemptions is not None and usage(db, campaign.id) >= campaign.max_redemptions:
        fail("promo_exhausted", 409)


def snapshot_of(db, campaign, promo):
    return {
        "version": 1,
        "code": promo.code_normalized,
        "discount_kind": campaign.discount_kind,
        "percentage_bps": campaign.percentage_bps,
        "fixed_minor": campaign.fixed_minor,
        "all_ticket_types": campaign.all_ticket_types,
        "ticket_type_ids": [str(value) for value in type_ids_of(db, campaign.id)],
    }


def preview(db, user, event_id, code):
    event = event_guard(db, user, event_id)
    promo = find_code(db, event.id, code)
    campaign = db.get(Campaign, promo.campaign_id)
    ensure_usable(db, campaign, promo)
    kind, value = public_discount(campaign)
    return {
        "event_id": event.id,
        "code": promo.code_normalized,
        "discount_kind": kind,
        "discount_value": value,
        "eligible_ticket_type_ids": []
        if campaign.all_ticket_types
        else type_ids_of(db, campaign.id),
        "valid_until": campaign.ends_at,
    }


def resolve_link(db, user, token):
    promo = db.scalar(select(PromoCode).where(PromoCode.link_token_hash == digest(token)))
    if not promo:
        fail("promo_not_found", 404)
    # A campaign link never bypasses the event's own visibility rules.
    event = event_guard(db, user, promo.event_id)
    return {"event_id": event.id, "code": promo.code_normalized}


def locked_campaign(db, campaign_id):
    return db.scalar(
        select(Campaign)
        .where(Campaign.id == campaign_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def reserve(db, event, hold, code, types):
    """Reserve one redemption for this hold, or raise the reason the code cannot be used."""
    found = find_code(db, event.id, code)
    campaign = locked_campaign(db, found.campaign_id)
    promo = db.scalar(
        select(PromoCode).where(PromoCode.id == found.id).execution_options(populate_existing=True)
    )
    ensure_usable(db, campaign, promo)
    snapshot = snapshot_of(db, campaign, promo)
    if not any(is_eligible(key, row.price_minor, snapshot) for key, row in types.items()):
        fail("promo_not_applicable", 409)
    db.add(
        PromoReservation(
            event_id=event.id,
            campaign_id=campaign.id,
            promo_code_id=promo.id,
            hold_id=hold.id,
            expires_at=hold.expires_at,
            discount_snapshot=snapshot,
        )
    )
    db.flush()


def reservation_for(db, hold_id):
    """The hold's reservation in any status; a hold has at most one."""
    return db.scalar(select(PromoReservation).where(PromoReservation.hold_id == hold_id))


def active_reservation(db, hold_id):
    return db.scalar(
        select(PromoReservation)
        .where(PromoReservation.hold_id == hold_id, PromoReservation.status == "active")
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def quote_still_valid(db, reservation):
    """The saved quote is honoured only while its campaign still says exactly the same thing.

    That means: the reservation is still active, campaign and code are enabled, the campaign's
    current validity window contains this moment, and the discount kind/value and eligible ticket
    types equal the snapshot taken when the quote was made. Renaming the code is not a change.
    The redemption limit needs no check: the active reservation already counts against it.
    Locks the campaign row; the caller holds the event lock.
    """
    if reservation is None:
        return False
    campaign = locked_campaign(db, reservation.campaign_id)
    promo = db.scalar(
        select(PromoCode)
        .where(PromoCode.id == reservation.promo_code_id)
        .execution_options(populate_existing=True)
    )
    current = now()
    return (
        campaign.is_enabled
        and promo.is_enabled
        and campaign.starts_at <= current < campaign.ends_at
        and snapshot_of(db, campaign, promo)
        == {**reservation.discount_snapshot, "code": promo.code_normalized}
    )


def revalidate(db, reservation):
    if not quote_still_valid(db, reservation):
        fail("promo_requote_required", 409)


def redeem(db, order, reservation):
    reservation.status = "consumed"
    db.add(
        PromoRedemption(
            event_id=order.event_id,
            campaign_id=reservation.campaign_id,
            reservation_id=reservation.id,
            order_id=order.id,
            discount_minor=order.discount_minor,
        )
    )


def release_reservation(db, hold_id):
    db.execute(
        update(PromoReservation)
        .where(PromoReservation.hold_id == hold_id, PromoReservation.status == "active")
        .values(status="released")
    )


def order_promo(db, order):
    if not order.promo_code_id:
        return None
    promo = db.get(PromoCode, order.promo_code_id)
    return {"code": promo.code_normalized, "campaign_id": order.campaign_id}


def promo_summary(reservation):
    if reservation is None:
        return None
    snapshot = reservation.discount_snapshot
    percent = snapshot["discount_kind"] == "percentage"
    return {
        "code": snapshot["code"],
        "campaign_id": reservation.campaign_id,
        "discount_kind": "percent" if percent else "fixed",
        "discount_value": snapshot["percentage_bps"] // 100 if percent else snapshot["fixed_minor"],
    }
