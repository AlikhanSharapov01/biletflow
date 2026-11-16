"""Read-only admin inspection of support, order, activation, campaign and offline records (#72).

Every view names its columns: no message text, QR material, token hashes, promo link tokens or
provider payloads. Nothing here changes a record or grants a role on it; the owning modules keep
their own permission checks for every action.
"""

from sqlalchemy import case, func, or_, select

from .admin_service import as_uuid, like
from .campaign_models import Campaign, PromoRedemption, PromoReservation
from .campaign_service import campaign_report, promo_of
from .catalog_models import Event
from .checkout_models import OrderItem, Ticket, TicketOrder
from .checkout_service import order_view
from .commerce_models import PaymentAttempt, PaymentIntent, Refund, SalesActivation
from .models import AuditLog, OutboxJob
from .offline_models import OfflineOperation, SyncConflict
from .offline_service import conflict_view
from .security import fail
from .support_models import CaseChange, SupportCase, SupportMessage
from .support_service import case_roles

LINKED_LIMIT = 100


def where_equal(query, pairs):
    for column, value in pairs:
        if value is not None:
            query = query.where(column == value)
    return query


# ---------------------------------------------------------------- searches


def support_cases_query(
    q=None,
    case_id=None,
    requester_user_id=None,
    order_id=None,
    ticket_id=None,
    event_id=None,
    organization_id=None,
    status=None,
    category=None,
    case_kind=None,
    escalated=None,
    **_,
):
    platform = or_(
        SupportCase.case_kind == "organizer_platform", SupportCase.escalated_at.is_not(None)
    )
    query = select(
        SupportCase.id,
        SupportCase.case_kind.label("kind"),
        SupportCase.category,
        SupportCase.subject,
        SupportCase.status,
        SupportCase.requester_user_id,
        SupportCase.organization_id,
        SupportCase.event_id,
        SupportCase.order_id,
        SupportCase.ticket_id,
        SupportCase.assigned_to_user_id,
        SupportCase.escalated_at,
        SupportCase.resolved_at,
        SupportCase.last_seq,
        SupportCase.created_at,
        SupportCase.updated_at,
        # Whether platform admins may work it through the support API.
        case((platform, True), else_=False).label("platform_access"),
    )
    if q:
        parts = [SupportCase.subject.ilike(like(q), escape="\\")]
        if as_uuid(q):
            parts.append(SupportCase.id == as_uuid(q))
        query = query.where(or_(*parts))
    query = where_equal(
        query,
        (
            (SupportCase.id, case_id),
            (SupportCase.requester_user_id, requester_user_id),
            (SupportCase.order_id, order_id),
            (SupportCase.ticket_id, ticket_id),
            (SupportCase.event_id, event_id),
            (SupportCase.organization_id, organization_id),
            (SupportCase.status, status),
            (SupportCase.category, category),
            (SupportCase.case_kind, case_kind),
        ),
    )
    if escalated is not None:
        query = query.where(
            SupportCase.escalated_at.is_not(None)
            if escalated
            else SupportCase.escalated_at.is_(None)
        )
    return query, (SupportCase.updated_at.desc(), SupportCase.id)


def activations_query(status=None, event_id=None, organization_id=None, **_):
    query = select(
        SalesActivation.id,
        SalesActivation.event_id,
        Event.title.label("event_title"),
        SalesActivation.organization_id,
        SalesActivation.status,
        SalesActivation.activation_fee_minor,
        SalesActivation.currency,
        SalesActivation.paid_attempt_id,
        SalesActivation.activated_at,
        SalesActivation.suspension_reason,
        SalesActivation.created_at,
    ).join(Event, Event.id == SalesActivation.event_id)
    query = where_equal(
        query,
        (
            (SalesActivation.status, status),
            (SalesActivation.event_id, event_id),
            (SalesActivation.organization_id, organization_id),
        ),
    )
    return query, (SalesActivation.created_at.desc(), SalesActivation.id)


def campaigns_query(
    q=None, campaign_id=None, event_id=None, organization_id=None, enabled=None, **_
):
    redemptions = (
        select(func.count(PromoRedemption.id))
        .where(PromoRedemption.campaign_id == Campaign.id)
        .scalar_subquery()
    )
    reserved = (
        select(func.count(PromoReservation.id))
        .where(PromoReservation.campaign_id == Campaign.id, PromoReservation.status == "active")
        .scalar_subquery()
    )
    query = select(
        Campaign.id,
        Campaign.event_id,
        Event.organization_id,
        Campaign.name,
        Campaign.discount_kind,
        Campaign.percentage_bps,
        Campaign.fixed_minor,
        Campaign.starts_at,
        Campaign.ends_at,
        Campaign.max_redemptions,
        Campaign.is_enabled,
        Campaign.created_at,
        redemptions.label("redemptions"),
        reserved.label("active_reservations"),
    ).join(Event, Event.id == Campaign.event_id)
    if q:
        parts = [Campaign.name.ilike(like(q), escape="\\")]
        if as_uuid(q):
            parts.append(Campaign.id == as_uuid(q))
        query = query.where(or_(*parts))
    query = where_equal(
        query,
        (
            (Campaign.id, campaign_id),
            (Campaign.event_id, event_id),
            (Event.organization_id, organization_id),
            (Campaign.is_enabled, enabled),
        ),
    )
    return query, (Campaign.created_at.desc(), Campaign.id)


def sync_conflicts_query(status=None, event_id=None, organization_id=None, ticket_id=None, **_):
    ticket = func.coalesce(OfflineOperation.resolved_ticket_id, OfflineOperation.claimed_ticket_id)
    query = (
        select(
            SyncConflict.id,
            SyncConflict.status,
            SyncConflict.reason,
            OfflineOperation.event_id,
            Event.organization_id,
            ticket.label("ticket_id"),
            SyncConflict.offline_operation_id,
            OfflineOperation.kind.label("operation_kind"),
            OfflineOperation.device_id,
            SyncConflict.existing_check_in_id,
            SyncConflict.created_at,
            SyncConflict.resolved_at,
            SyncConflict.resolved_by_user_id,
        )
        .join(OfflineOperation, OfflineOperation.id == SyncConflict.offline_operation_id)
        .join(Event, Event.id == OfflineOperation.event_id)
    )
    query = where_equal(
        query,
        (
            (SyncConflict.status, status),
            (OfflineOperation.event_id, event_id),
            (Event.organization_id, organization_id),
            (ticket, ticket_id),
        ),
    )
    return query, (SyncConflict.created_at.desc(), SyncConflict.id)


INSPECTIONS = {
    "support-cases": support_cases_query,
    "activations": activations_query,
    "campaigns": campaigns_query,
    "sync-conflicts": sync_conflicts_query,
}


def first_row(db, kind, **filters):
    query, _ = INSPECTIONS[kind](**filters)
    row = db.execute(query).mappings().first()
    return dict(row) if row else None


# ---------------------------------------------------------------- details


def support_case_detail(db, admin, case_id):
    row = first_row(db, "support-cases", case_id=case_id)
    if not row:
        fail("case_not_found", 404)
    record = db.get(SupportCase, case_id)
    history = db.execute(
        select(
            CaseChange.seq,
            CaseChange.change_kind,
            CaseChange.before_value,
            CaseChange.after_value,
            CaseChange.reason,
            CaseChange.actor_user_id,
            CaseChange.created_at,
        )
        .where(CaseChange.case_id == case_id)
        .order_by(CaseChange.seq)
        .limit(LINKED_LIMIT)
    ).mappings()
    order = db.get(TicketOrder, record.order_id) if record.order_id else None
    ticket = db.get(Ticket, record.ticket_id) if record.ticket_id else None
    return {
        "case": row,
        # What the admin may do through the support API; inspecting adds nothing.
        "viewer_roles": case_roles(db, admin, record),
        "message_count": db.scalar(
            select(func.count(SupportMessage.id)).where(SupportMessage.case_id == case_id)
        ),
        "history": [dict(change) for change in history],
        "order": {"id": order.id, "status": order.status} if order else None,
        "ticket": {"id": ticket.id, "status": ticket.status} if ticket else None,
    }


def order_detail(db, settings, admin, order_id):
    order = db.get(TicketOrder, order_id)
    if not order:
        fail("order_not_found", 404)
    view = order_view(db, settings, order, admin)
    for item in view["items"]:
        if item["ticket"]:
            item["ticket"]["qr_payload"] = None  # inspection never shows admission material
    ticket_ids = list(
        db.scalars(
            select(Ticket.id)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == order.id)
        )
    )
    attempt_ids = list(
        db.scalars(
            select(PaymentAttempt.id)
            .join(PaymentIntent, PaymentIntent.id == PaymentAttempt.intent_id)
            .where(PaymentIntent.order_id == order.id)
        )
    )
    refund_ids = list(
        db.scalars(select(Refund.id).where(Refund.payment_attempt_id.in_(attempt_ids)))
    )
    cases = db.execute(
        select(
            SupportCase.id,
            SupportCase.case_kind.label("kind"),
            SupportCase.category,
            SupportCase.status,
            SupportCase.escalated_at,
            SupportCase.created_at,
        )
        .where(
            or_(
                SupportCase.order_id == order.id,
                SupportCase.ticket_id.in_(ticket_ids),
            )
        )
        .order_by(SupportCase.created_at, SupportCase.id)
        .limit(LINKED_LIMIT)
    ).mappings()
    deliveries = db.execute(
        select(
            OutboxJob.id,
            OutboxJob.payload["ticket_id"].astext.label("ticket_id"),
            OutboxJob.status,
            OutboxJob.attempt_count,
            OutboxJob.last_error,
            OutboxJob.created_at,
            OutboxJob.completed_at,
        )
        .where(
            OutboxJob.kind == "ticket_delivery_email",
            OutboxJob.payload["ticket_id"].astext.in_([str(t) for t in ticket_ids]),
        )
        .order_by(OutboxJob.created_at, OutboxJob.id)
        .limit(LINKED_LIMIT)
    ).mappings()
    audit = db.execute(
        select(
            AuditLog.id,
            AuditLog.action,
            AuditLog.entity_type,
            AuditLog.entity_id,
            AuditLog.actor_user_id,
            AuditLog.service_actor,
            AuditLog.created_at,
        )
        .where(AuditLog.entity_id.in_([order.id, *ticket_ids, *attempt_ids, *refund_ids]))
        .order_by(AuditLog.created_at, AuditLog.id)
        .limit(LINKED_LIMIT)
    ).mappings()
    return {
        "order": view,
        "support_cases": [dict(row) for row in cases],
        "deliveries": [dict(row) for row in deliveries],
        "audit": [dict(row) for row in audit],
    }


def campaign_detail(db, campaign_id):
    row = first_row(db, "campaigns", campaign_id=campaign_id)
    if not row:
        fail("campaign_not_found", 404)
    campaign = db.get(Campaign, campaign_id)
    promo = promo_of(db, campaign.id)
    redemptions = db.execute(
        select(
            PromoRedemption.id,
            PromoRedemption.order_id,
            PromoRedemption.discount_minor,
            PromoRedemption.created_at,
        )
        .where(PromoRedemption.campaign_id == campaign.id)
        .order_by(PromoRedemption.created_at.desc(), PromoRedemption.id)
        .limit(LINKED_LIMIT)
    ).mappings()
    reservations = db.execute(
        select(PromoReservation.status, func.count(PromoReservation.id))
        .where(PromoReservation.campaign_id == campaign.id)
        .group_by(PromoReservation.status)
    )
    return {
        "campaign": row,
        "code": promo.code_normalized if promo else None,
        "report": campaign_report(db, campaign),
        "redemptions": [dict(r) for r in redemptions],
        "reservations": {status: count for status, count in reservations},
    }


def sync_conflict_detail(db, conflict_id):
    conflict = db.get(SyncConflict, conflict_id)
    if not conflict:
        fail("sync_conflict_not_found", 404)
    view = conflict_view(db, conflict)
    view["organization_id"] = db.scalar(
        select(Event.organization_id).where(Event.id == view["event_id"])
    )
    return view
