"""Authoritative cash aggregates plus simulation-only payout reservations."""

from uuid import uuid4

from sqlalchemy import func, select, text

from .analytics_service import ITEMS, TOTALS, normalize
from .catalog_service import record
from .commerce_models import PaymentAttempt, PaymentIntent, PayoutProfile
from .finance_models import DemoPayout, FinanceEntry
from .models import AuditLog
from .notification_service import enqueue
from .security import fail, now

FILTERS = {"from_": None, "to": None, "ticket_type_id": None, "campaign_id": None}


def totals(db, event):
    db.flush()
    money = normalize(
        db.execute(
            text(ITEMS + "SELECT " + TOTALS + " FROM items"), FILTERS | {"event_id": event.id}
        )
        .mappings()
        .one()
    )
    activation = (
        db.execute(
            text("""
        SELECT coalesce(sum(a.charged_minor),0) AS charges,
          coalesce(sum(r.amount_minor) FILTER (WHERE r.status='succeeded'),0) AS refunds,
          coalesce(sum(r.amount_minor) FILTER (WHERE r.status IN ('requested','pending','failed')),0) AS pending
        FROM biletflow.payment_intent p JOIN biletflow.payment_attempt a ON a.intent_id=p.id AND a.status='succeeded'
        LEFT JOIN biletflow.refund r ON r.payment_attempt_id=a.id
        WHERE p.event_id=:event_id AND p.purpose='activation'
    """),
            {"event_id": event.id},
        )
        .mappings()
        .one()
    )
    environments = list(
        db.scalars(
            text(
                "SELECT DISTINCT environment FROM biletflow.payment_intent WHERE event_id=:event_id ORDER BY environment"
            ),
            {"event_id": event.id},
        )
    )
    reserved = db.scalar(
        select(func.coalesce(func.sum(DemoPayout.amount_minor), 0)).where(
            DemoPayout.event_id == event.id, DemoPayout.status.in_(("pending", "eligible"))
        )
    )
    sent = -db.scalar(
        select(func.coalesce(func.sum(FinanceEntry.amount_minor), 0)).where(
            FinanceEntry.event_id == event.id, FinanceEntry.kind == "payout"
        )
    )
    net = money["net_minor"] - int(activation["charges"]) + int(activation["refunds"])
    balance = net - sent
    payable = max(
        0, balance - money["pending_refunds_minor"] - int(activation["pending"]) - reserved
    )
    return {
        key: money[key]
        for key in (
            "gross_minor",
            "discount_minor",
            "collected_minor",
            "fulfilled_collected_minor",
            "charged_fees_minor",
            "fee_reversals_minor",
            "fees_minor",
            "refunds_minor",
            "pending_refunds_minor",
        )
    } | {
        "event_id": event.id,
        "currency": "KZT",
        "simulated": environments in ([], ["simulation"]),
        "simulation_only": environments in ([], ["simulation"]),
        "environments": environments,
        "activation_charges_minor": int(activation["charges"]),
        "activation_refunds_minor": int(activation["refunds"]),
        "pending_activation_refunds_minor": int(activation["pending"]),
        "net_minor": net,
        "balance_minor": balance,
        "reserved_minor": int(reserved),
        "sent_minor": int(sent),
        "estimated_payout_minor": payable,
        "payout_eligible_at": event.ends_at,
        "generated_at": now(),
    }


def view(db, payout):
    result = record(payout)
    adjustment = db.scalar(
        select(func.coalesce(func.sum(FinanceEntry.amount_minor), 0)).where(
            FinanceEntry.payout_id == payout.id, FinanceEntry.kind != "payout"
        )
    )
    adjusted = db.scalar(
        select(FinanceEntry.id)
        .where(FinanceEntry.payout_id == payout.id, FinanceEntry.kind != "payout")
        .limit(1)
    )
    return result | {
        "simulated": True,
        "adjustment_minor": int(adjustment),
        "status": "adjusted" if adjusted else payout.status,
        "transfer_status": payout.status,
    }


def notice(db, payout, state, change_id=None, actor_id=None):
    enqueue(
        db,
        f"notify-payout:{payout.id}:{state}:{change_id or 'state'}",
        {
            "notice": "payout_status",
            "event_id": str(payout.event_id),
            "recipient_user_id": str(payout.requested_by_user_id),
            "payout_id": str(payout.id),
            "status": state,
            "simulated": True,
            "change_id": str(change_id or state),
        },
        payout.event_id,
    )
    db.add(
        AuditLog(
            actor_user_id=actor_id,
            service_actor=None if actor_id else "finance",
            organization_id=payout.organization_id,
            event_id=payout.event_id,
            action="finance.payout_" + state,
            entity_type="demo_payout",
            entity_id=payout.id,
            description="Simulated payout " + state,
            safe_change={"simulated": True},
            correlation_id=uuid4(),
        )
    )


def create(db, event, user, key, amount):
    existing = db.scalar(
        select(DemoPayout).where(
            DemoPayout.requested_by_user_id == user.id, DemoPayout.request_key == key
        )
    )
    if existing:
        if existing.event_id != event.id or existing.amount_minor != amount:
            fail("idempotency_key_reused", 409)
        return existing
    data = totals(db, event)
    if not data["simulation_only"]:
        fail("payout_environment_mismatch", 409)
    if amount > data["estimated_payout_minor"]:
        fail("insufficient_payable_balance", 409)
    profile = db.scalar(
        select(PayoutProfile).where(
            PayoutProfile.organization_id == event.organization_id,
            PayoutProfile.environment == "simulation",
            PayoutProfile.status == "verified",
        )
    )
    if not profile:
        fail("payout_profile_not_verified", 409)
    payout = DemoPayout(
        event_id=event.id,
        organization_id=event.organization_id,
        payout_profile_id=profile.id,
        requested_by_user_id=user.id,
        request_key=key,
        amount_minor=amount,
    )
    db.add(payout)
    db.flush()
    notice(db, payout, "pending", actor_id=user.id)
    return payout


def transition(db, event, payout_id, state, user):
    payout = db.scalar(
        select(DemoPayout)
        .where(DemoPayout.id == payout_id, DemoPayout.event_id == event.id)
        .with_for_update()
    )
    if not payout:
        fail("payout_not_found", 404)
    if payout.status == state:
        return payout
    allowed = {"pending": ("eligible", "failed"), "eligible": ("sent", "failed")}
    if state not in allowed.get(payout.status, ()):
        fail("invalid_payout_transition", 409)
    if state != "failed":
        if event.ends_at > now():
            fail("payout_not_yet_eligible", 409)
        data = totals(db, event)
        profile = db.get(PayoutProfile, payout.payout_profile_id)
        if (
            not data["simulation_only"]
            or profile.status != "verified"
            or profile.environment != "simulation"
        ):
            fail("payout_profile_not_verified", 409)
        if (
            data["balance_minor"]
            - data["pending_refunds_minor"]
            - data["pending_activation_refunds_minor"]
            < data["reserved_minor"]
        ):
            fail("insufficient_payable_balance", 409)
    payout.status = state
    if state == "sent":
        payout.sent_at = now()
        db.add(
            FinanceEntry(
                event_id=event.id,
                payout_id=payout.id,
                kind="payout",
                amount_minor=-payout.amount_minor,
            )
        )
    notice(db, payout, state, actor_id=user.id)
    return payout


def reconcile_reservations(db, event):
    """Caller holds the event mutex; batch liabilities before checking reserved cash."""
    reservations = list(
        db.scalars(
            select(DemoPayout)
            .where(DemoPayout.event_id == event.id, DemoPayout.status.in_(("pending", "eligible")))
            .order_by(DemoPayout.created_at, DemoPayout.id)
            .with_for_update()
        )
    )
    if not reservations:
        return
    data = totals(db, event)
    remaining = (
        data["balance_minor"]
        - data["pending_refunds_minor"]
        - data["pending_activation_refunds_minor"]
    )
    for payout in reservations:
        if payout.amount_minor > remaining:
            payout.status = "failed"
            notice(db, payout, "failed")
        else:
            remaining -= payout.amount_minor


def refund_changed(db, event, refund, succeeded=False):
    """Caller holds the common event mutex, including compensation and activation refunds."""
    payment = db.get(PaymentAttempt, refund.payment_attempt_id)
    if payment.environment != "simulation":
        return
    reconcile_reservations(db, event)
    if not succeeded:
        return
    payout = db.scalar(
        select(DemoPayout)
        .where(DemoPayout.event_id == event.id, DemoPayout.status == "sent")
        .order_by(DemoPayout.sent_at.desc(), DemoPayout.id)
        .limit(1)
    )
    if not payout or db.scalar(select(FinanceEntry.id).where(FinanceEntry.refund_id == refund.id)):
        return
    # Adjustment history references canonical refunds; balance already includes their effect.
    intent = db.get(PaymentIntent, payment.intent_id)
    if intent.purpose == "activation":
        db.add(
            FinanceEntry(
                event_id=event.id,
                payout_id=payout.id,
                refund_id=refund.id,
                kind="activation_refund",
                amount_minor=refund.amount_minor,
            )
        )
        notice(db, payout, "adjusted", refund.id)
        return
    fee = (
        db.scalar(
            text("""SELECT CASE WHEN p.purpose='ticket_order' THEN
        CASE WHEN a.id=o.fulfillment_payment_attempt_id THEN
        (SELECT coalesce(sum(i.processing_fee_minor),0) FROM biletflow.order_item i WHERE i.order_id=o.id)
        ELSE a.processing_fee_minor END ELSE 0 END
        FROM biletflow.payment_attempt a JOIN biletflow.payment_intent p ON p.id=a.intent_id
        LEFT JOIN biletflow.ticket_order o ON o.id=p.order_id WHERE a.id=:id"""),
            {"id": refund.payment_attempt_id},
        )
        or 0
    )
    db.add(
        FinanceEntry(
            event_id=event.id,
            payout_id=payout.id,
            refund_id=refund.id,
            kind="refund",
            amount_minor=-refund.amount_minor,
        )
    )
    db.add(
        FinanceEntry(
            event_id=event.id,
            payout_id=payout.id,
            refund_id=refund.id,
            kind="fee_reversal",
            amount_minor=int(fee),
        )
    )
    notice(db, payout, "adjusted", refund.id)
