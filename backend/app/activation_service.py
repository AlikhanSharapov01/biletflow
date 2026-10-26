"""Per-event paid-sales activation (BF-06, database specification TX-16). Simulation only."""

import hashlib
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from .catalog_models import Event, Organization, TicketType
from .catalog_service import catalog_audit, organization_guard
from .commerce_models import (
    PaymentAttempt,
    PaymentIntent,
    PayoutProfile,
    SalesActivation,
    TermsAcceptance,
    VerificationRecord,
)
from .models import AuditLog
from .payments_service import ENVIRONMENT, TARGETS, attempt_view, latest_attempt, new_attempt
from .security import fail, now

# Proposed demonstration defaults, not confirmed product tariffs. They are saved on each
# activation so a later change never rewrites history.
ACTIVATION_FEE_MINOR = 500_000  # KZT 5,000
TERMS_VERSION = "2026-10-paid-sales-simulation-v1"
TERMS_TEXT = (
    "BiletFlow paid sales (academic simulation). Payments, payouts and identity checks on this "
    "platform are simulated and move no real money. The organizer is responsible for the event, "
    "its description and its refund policy, and accepts that ticket revenue is held until the "
    "event takes place."
)
TERMS_HASH = hashlib.sha256(TERMS_TEXT.encode()).hexdigest()


def finance_event(db, user, event_id, lock=False):
    """Owner or member with the organization "finance" capability, for this event's org."""
    event = db.get(Event, event_id)
    if not event:
        fail("event_not_found", 404)
    org = organization_guard(db, user, event.organization_id, "finance", lock=lock)
    if lock:
        event = db.scalar(
            select(Event)
            .where(Event.id == event_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    return org, event


def activation_for(db, event_id, lock=False):
    query = select(SalesActivation).where(SalesActivation.event_id == event_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return db.scalar(query)


def paid_sales_status(db, event_id):
    activation = activation_for(db, event_id)
    return activation.status if activation else "incomplete"


def has_paid_type(db, event_id):
    return (
        db.scalar(
            select(TicketType.id)
            .where(
                TicketType.event_id == event_id,
                TicketType.kind == "paid",
                TicketType.price_minor > 0,
            )
            .limit(1)
        )
        is not None
    )


def verified_payout(db, org_id):
    return db.scalar(
        select(PayoutProfile)
        .where(PayoutProfile.organization_id == org_id, PayoutProfile.status == "verified")
        .order_by(PayoutProfile.created_at.desc(), PayoutProfile.id)
        .limit(1)
    )


def approved_verification(db, org_id):
    return db.scalar(
        select(VerificationRecord)
        .where(
            VerificationRecord.organization_id == org_id,
            VerificationRecord.status == "approved",
        )
        .order_by(VerificationRecord.created_at.desc(), VerificationRecord.id)
        .limit(1)
    )


def current_terms(db, event_id):
    return db.scalar(
        select(TermsAcceptance)
        .where(TermsAcceptance.event_id == event_id, TermsAcceptance.terms_version == TERMS_VERSION)
        .order_by(TermsAcceptance.created_at.desc(), TermsAcceptance.id)
        .limit(1)
    )


def prerequisites(db, event):
    found = {
        "paid_ticket_type": has_paid_type(db, event.id),
        "payout_profile": verified_payout(db, event.organization_id),
        "identity_verification": approved_verification(db, event.organization_id),
        "terms": current_terms(db, event.id),
    }
    missing = [name for name, value in found.items() if not value]
    return found, missing


def checklist(db, event):
    activation = activation_for(db, event.id)
    found, missing = prerequisites(db, event)
    status = activation.status if activation else "incomplete"
    intent = (
        db.scalar(select(PaymentIntent).where(PaymentIntent.activation_id == activation.id))
        if activation
        else None
    )
    attempt = latest_attempt(db, intent.id) if intent else None
    if status != "active":
        missing.append("activation_fee")
    return {
        "event_id": event.id,
        "status": status,
        "simulated": True,
        "missing": missing,
        "paid_ticket_type": found["paid_ticket_type"],
        "payout_profile_verified": found["payout_profile"] is not None,
        "identity_verified": found["identity_verification"] is not None,
        "terms": {
            "version": TERMS_VERSION,
            "text": TERMS_TEXT,
            "accepted": found["terms"] is not None,
        },
        "activation_fee_minor": activation.activation_fee_minor
        if activation
        else ACTIVATION_FEE_MINOR,
        "currency": "KZT",
        "activated_at": activation.activated_at if activation else None,
        "suspension_reason": activation.suspension_reason if activation else None,
        "payment": attempt_view(attempt),
    }


def add_payout_profile(db, user, org_id):
    org = organization_guard(db, user, org_id, "finance", lock=True)
    profile = verified_payout(db, org.id)
    if not profile:
        # Simulation: no bank details are collected or stored, and approval is immediate.
        profile = PayoutProfile(
            organization_id=org.id,
            environment=ENVIRONMENT,
            provider="biletflow-simulator",
            provider_reference=f"sim_payout_{uuid4().hex[:12]}",
            status="verified",
            verified_at=now(),
        )
        db.add(profile)
        db.flush()
        catalog_audit(db, user, "paid_sales.payout_profile_verified", org, None, profile)
    return {"id": profile.id, "status": profile.status, "environment": profile.environment}


def add_verification(db, user, org_id):
    org = organization_guard(db, user, org_id, "finance", lock=True)
    record = approved_verification(db, org.id)
    if not record:
        record = VerificationRecord(
            organization_id=org.id,
            submitted_by_user_id=user.id,
            environment=ENVIRONMENT,
            status="approved",
            reviewed_at=now(),
            reason="Simulated identity check; not a production KYC result.",
        )
        db.add(record)
        db.flush()
        catalog_audit(db, user, "paid_sales.identity_verified", org, None, record)
    return {"id": record.id, "status": record.status, "environment": record.environment}


def accept_terms(db, user, event_id, version):
    org, event = finance_event(db, user, event_id, lock=True)
    if version != TERMS_VERSION:
        fail("terms_version_outdated", 422)
    row = db.scalar(
        select(TermsAcceptance).where(
            TermsAcceptance.event_id == event.id,
            TermsAcceptance.terms_version == TERMS_VERSION,
            TermsAcceptance.accepted_by_user_id == user.id,
        )
    )
    if not row:
        row = TermsAcceptance(
            event_id=event.id,
            accepted_by_user_id=user.id,
            terms_version=TERMS_VERSION,
            terms_hash=TERMS_HASH,
        )
        db.add(row)
        db.flush()
        catalog_audit(db, user, "paid_sales.terms_accepted", org, event, row)
    return checklist(db, event)


def start_activation(db, user, event_id):
    org, event = finance_event(db, user, event_id, lock=True)
    if event.publication_state == "cancelled":
        fail("event_not_editable", 409)
    activation = activation_for(db, event.id, lock=True)
    if not activation:
        activation = SalesActivation(
            event_id=event.id,
            organization_id=org.id,
            activation_fee_minor=ACTIVATION_FEE_MINOR,
        )
        db.add(activation)
        db.flush()
    if activation.status == "active":
        return activation
    if activation.status == "suspended":
        fail("paid_sales_suspended", 409)
    found, missing = prerequisites(db, event)
    if missing:
        # A paid ticket type alone, or a fee alone, never activates sales.
        raise HTTPException(409, detail={"code": "activation_incomplete", "missing": missing})
    activation.payout_profile_id = found["payout_profile"].id
    activation.verification_record_id = found["identity_verification"].id
    activation.terms_acceptance_id = found["terms"].id
    intent = db.scalar(
        select(PaymentIntent).where(PaymentIntent.activation_id == activation.id).with_for_update()
    )
    if activation.status == "pending" and intent:
        attempt = latest_attempt(db, intent.id)
        if attempt and attempt.status in ("created", "pending"):
            # Never start a second charge while one is still open.
            return activation
    if not intent:
        intent = PaymentIntent(
            event_id=event.id,
            activation_id=activation.id,
            payer_user_id=user.id,
            purpose="activation",
            expected_minor=activation.activation_fee_minor,
            environment=ENVIRONMENT,
        )
        db.add(intent)
        db.flush()
    activation.status = "pending"
    attempt = new_attempt(db, intent)
    catalog_audit(db, user, "paid_sales.activation_started", org, event, attempt)
    return activation


def service_audit(db, event, action, target, change=None):
    db.add(
        AuditLog(
            service_actor="payments",
            organization_id=event.organization_id,
            event_id=event.id,
            action=action,
            entity_type=target.__table__.name,
            entity_id=target.id,
            description=action,
            safe_change=change or {},
            correlation_id=uuid4(),
        )
    )


def lock_activation(db, intent):
    return db.scalar(
        select(SalesActivation)
        .where(SalesActivation.id == intent.activation_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def activation_paid(db, activation, intent, attempt, matches):
    event = db.get(Event, activation.event_id)
    org = db.get(Organization, activation.organization_id)
    found, missing = prerequisites(db, event)
    eligible = (
        matches
        and activation.status in ("pending", "failed", "incomplete")
        and not missing
        and org.status == "active"
        and event.publication_state != "cancelled"
    )
    if not eligible:
        # The charge is kept on record; B3 adds the refund obligation for such captures.
        attempt.safe_result = attempt.safe_result | {"retained": "not_fulfilled"}
        service_audit(db, event, "paid_sales.extra_charge_retained", attempt)
        return
    activation.payout_profile_id = found["payout_profile"].id
    activation.verification_record_id = found["identity_verification"].id
    activation.terms_acceptance_id = found["terms"].id
    activation.paid_attempt_id = attempt.id
    activation.activated_at = now()
    activation.status = "active"
    service_audit(db, event, "paid_sales.activated", activation)


def activation_failed(db, activation, intent, attempt):
    if activation.status == "pending":
        open_attempt = db.scalar(
            select(PaymentAttempt.id).where(
                PaymentAttempt.intent_id == intent.id,
                PaymentAttempt.id != attempt.id,
                PaymentAttempt.status.in_(["created", "pending", "succeeded"]),
            )
        )
        if not open_attempt:
            activation.status = "failed"


TARGETS["activation"] = (lock_activation, activation_paid, activation_failed)


def suspend(db, event_id, reason):
    """Platform-admin action; no public endpoint until the admin module is integrated."""
    event = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    activation = activation_for(db, event_id, lock=True)
    if not activation or activation.status != "active":
        fail("paid_sales_not_active", 409)
    activation.status = "suspended"
    activation.suspension_reason = reason
    service_audit(db, event, "paid_sales.suspended", activation, {"reason": reason})
    return activation


def reinstate(db, event_id):
    event = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    activation = activation_for(db, event_id, lock=True)
    if not activation or activation.status != "suspended":
        fail("paid_sales_not_suspended", 409)
    _, missing = prerequisites(db, event)
    paid = (
        db.get(PaymentAttempt, activation.paid_attempt_id) if activation.paid_attempt_id else None
    )
    if missing or not paid or paid.status != "succeeded":
        raise HTTPException(409, detail={"code": "activation_incomplete", "missing": missing})
    activation.status = "active"
    activation.suspension_reason = None
    service_audit(db, event, "paid_sales.reinstated", activation)
    return activation
