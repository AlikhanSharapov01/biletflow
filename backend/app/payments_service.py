"""Simulated payment and refund boundary shared by paid-sales activation and paid orders.

Every record is labelled environment="simulation". Flow (database specification TX-07/09/14):
the business commit persists an intent, an attempt and an initialization job; the worker talks
to the (simulated) provider after that commit; provider notifications land in a deduplicated
inbox and are applied under the event lock exactly once. Captured money that cannot fulfil
its target always becomes a durable refund obligation that the worker dispatches and retries.
"""

import hashlib
import json
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select

from .catalog_models import Event
from .commerce_models import PaymentAttempt, PaymentIntent, ProviderEvent, Refund, RefundAttempt
from .models import AuditLog, OutboxJob
from .security import fail, now

PROVIDER = "biletflow-simulator"
MERCHANT = "biletflow-demo"
ENVIRONMENT = "simulation"
REFUND_RETRY_SECONDS = 30

# Target handlers by intent purpose: (lock_target, on_success, on_failure). Registered by the
# activation and order modules so this boundary never imports them.
TARGETS = {}


def simulation_enabled(settings):
    return settings.environment in ("development", "test")


def new_attempt(db, intent):
    attempt = PaymentAttempt(
        intent_id=intent.id,
        event_id=intent.event_id,
        environment=intent.environment,
        provider=PROVIDER,
        merchant_account_key=MERCHANT,
        request_key=str(uuid4()),
    )
    db.add(attempt)
    db.flush()
    db.add(
        OutboxJob(
            event_id=intent.event_id,
            kind="payment_initialize",
            deduplication_key=f"payment-initialize:{attempt.id}",
            payload={"version": 1, "attempt_id": str(attempt.id)},
        )
    )
    return attempt


def latest_attempt(db, intent_id):
    return db.scalar(
        select(PaymentAttempt)
        .where(PaymentAttempt.intent_id == intent_id)
        .order_by(PaymentAttempt.created_at.desc(), PaymentAttempt.id.desc())
        .limit(1)
    )


def attempt_view(attempt):
    if not attempt:
        return None
    return {
        "id": attempt.id,
        "status": attempt.status,
        "charged_minor": attempt.charged_minor,
        "environment": attempt.environment,
        "provider_payment_id": attempt.provider_payment_id,
        "simulated": attempt.environment == ENVIRONMENT,
    }


def refund_view(db, refund):
    latest = db.scalar(
        select(RefundAttempt)
        .where(RefundAttempt.refund_id == refund.id)
        .order_by(RefundAttempt.attempt_number.desc())
        .limit(1)
    )
    return {
        "id": refund.id,
        "payment_attempt_id": refund.payment_attempt_id,
        "reason": refund.reason,
        "status": refund.status,
        "amount_minor": refund.amount_minor,
        "latest_attempt_id": latest.id if latest else None,
        "latest_attempt_status": latest.status if latest else None,
        "simulated": True,
    }


def audit(db, event, action, target, change=None):
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


def create_refund(db, event, attempt, reason, requested_by=None):
    """Record one refund obligation for a captured charge; commit before any provider call."""
    refund = db.scalar(select(Refund).where(Refund.payment_attempt_id == attempt.id))
    if refund:
        return refund
    refund = Refund(
        payment_attempt_id=attempt.id,
        event_id=attempt.event_id,
        reason=reason,
        amount_minor=attempt.charged_minor,
        requested_by_user_id=requested_by,
    )
    db.add(refund)
    db.flush()
    schedule_refund(db, refund, 1)
    audit(db, event, "payments.refund_requested", refund, {"reason": reason})
    return refund


def schedule_refund(db, refund, attempt_number, delay=0):
    db.add(
        OutboxJob(
            event_id=refund.event_id,
            kind="refund_dispatch",
            deduplication_key=f"refund-dispatch:{refund.id}:{attempt_number}",
            payload={"version": 1, "refund_id": str(refund.id)},
            available_at=now() + timedelta(seconds=delay),
        )
    )


def next_job(db, kind):
    return db.scalar(
        select(OutboxJob)
        .where(
            OutboxJob.kind == kind, OutboxJob.status == "pending", OutboxJob.available_at <= now()
        )
        .order_by(OutboxJob.available_at, OutboxJob.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )


def finish(job):
    job.attempt_count += 1
    job.status, job.completed_at = "done", now()


def initialize_once(factory):
    """Worker step: initialize one created attempt with the simulator, after its commit."""
    with factory.begin() as db:
        job = next_job(db, "payment_initialize")
        if not job:
            return False
        attempt = db.scalar(
            select(PaymentAttempt)
            .where(PaymentAttempt.id == job.payload["attempt_id"])
            .with_for_update()
        )
        if attempt and attempt.status == "created":
            # The in-process simulator stands in for a provider call; a real adapter would
            # send the persisted request_key and record the returned reference.
            attempt.provider_payment_id = f"sim_{attempt.id.hex}"
            attempt.status = "pending"
        finish(job)
        return True


def dispatch_refund_once(factory):
    """Worker step: send one requested or failed refund to the simulator as a new attempt."""
    with factory.begin() as db:
        job = next_job(db, "refund_dispatch")
        if not job:
            return False
        refund = db.scalar(
            select(Refund).where(Refund.id == job.payload["refund_id"]).with_for_update()
        )
        if refund and refund.status in ("requested", "failed"):
            number = 1 + (
                db.scalar(
                    select(func.count(RefundAttempt.id)).where(RefundAttempt.refund_id == refund.id)
                )
                or 0
            )
            key = str(uuid4())
            db.add(
                RefundAttempt(
                    refund_id=refund.id,
                    attempt_number=number,
                    provider_request_key=key,
                    provider_refund_id=f"sim_ref_{key.replace('-', '')[:24]}",
                    status="pending",
                    sent_at=now(),
                )
            )
            refund.status = "pending"
        finish(job)
        return True


def payload_hash(payload):
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def receive(factory, external_event_id, payload, payment_attempt_id=None, refund_attempt_id=None):
    """Persist a verified notification in the inbox (its own commit) and return its id."""
    digest = payload_hash(payload)
    with factory.begin() as db:
        existing = db.scalar(
            select(ProviderEvent).where(
                ProviderEvent.provider == PROVIDER,
                ProviderEvent.environment == ENVIRONMENT,
                ProviderEvent.merchant_account_key == MERCHANT,
                ProviderEvent.external_event_id == external_event_id,
            )
        )
        if existing:
            if existing.payload_hash != digest:
                fail("provider_event_conflict", 409)
            return existing.id
        row = ProviderEvent(
            provider=PROVIDER,
            environment=ENVIRONMENT,
            merchant_account_key=MERCHANT,
            external_event_id=external_event_id,
            payment_attempt_id=payment_attempt_id,
            refund_attempt_id=refund_attempt_id,
            payload_hash=digest,
            safe_payload=payload,
        )
        db.add(row)
        db.flush()
        return row.id


def lock_event(db, event_id):
    return db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def locked_inbox(db, inbox_id):
    return db.scalar(
        select(ProviderEvent)
        .where(ProviderEvent.id == inbox_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def process(factory, settings, inbox_id):
    """Apply one inbox row exactly once under the event lock (TX-09 / TX-14)."""
    with factory() as db:
        row = db.get(ProviderEvent, inbox_id)
        if row.refund_attempt_id:
            refund_id = db.scalar(
                select(RefundAttempt.refund_id).where(RefundAttempt.id == row.refund_attempt_id)
            )
            event_id = db.scalar(select(Refund.event_id).where(Refund.id == refund_id))
        else:
            event_id = db.scalar(
                select(PaymentAttempt.event_id).where(PaymentAttempt.id == row.payment_attempt_id)
            )
    with factory.begin() as db:
        event = lock_event(db, event_id)
        inbox = locked_inbox(db, inbox_id)
        if inbox.status != "received":
            return inbox.status
        if inbox.refund_attempt_id:
            apply_refund_result(db, event, inbox)
        else:
            apply_payment_result(db, settings, event, inbox)
        inbox.status, inbox.processed_at = "processed", now()
        return inbox.status


def apply_payment_result(db, settings, event, inbox):
    attempt_id = inbox.payment_attempt_id
    intent_id = db.scalar(select(PaymentAttempt.intent_id).where(PaymentAttempt.id == attempt_id))
    intent = db.get(PaymentIntent, intent_id)
    if intent.purpose not in TARGETS:
        # Target modules register themselves on import; the worker may not have loaded them.
        from . import activation_service, paid_checkout_service  # noqa: F401
    lock_target, on_success, on_failure = TARGETS[intent.purpose]
    # Target rows (activation, or hold and order) lock before the payment rows (hierarchy).
    target = lock_target(db, event, intent)
    attempt = db.scalar(
        select(PaymentAttempt)
        .where(PaymentAttempt.id == attempt_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    payload = inbox.safe_payload
    outcome = payload["outcome"]
    if outcome == "pending":
        # Unknown outcome stays pending and reconcilable; it is never treated as failure.
        if attempt.status == "created":
            attempt.status = "pending"
    elif outcome == "failed":
        # A stale failure never demotes a payment that already succeeded.
        if attempt.status != "succeeded":
            attempt.status = "failed"
            attempt.safe_result = {"outcome": "failed"}
            on_failure(db, target, intent, attempt)
    elif attempt.status != "succeeded":
        amount, currency = payload["amount_minor"], payload["currency"]
        attempt.status = "succeeded"
        attempt.charged_minor = amount
        attempt.confirmed_at = now()
        matches = amount == intent.expected_minor and currency == intent.currency
        attempt.safe_result = {"outcome": "succeeded", "amount_matches": matches}
        # Money was captured either way; only an exact match may fulfil, anything else is
        # recorded and compensated by the target handler.
        on_success(db, settings, event, target, intent, attempt, matches)


def apply_refund_result(db, event, inbox):
    attempt = db.scalar(
        select(RefundAttempt)
        .where(RefundAttempt.id == inbox.refund_attempt_id)
        .execution_options(populate_existing=True)
    )
    refund = db.scalar(
        select(Refund)
        .where(Refund.id == attempt.refund_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    attempt = db.scalar(
        select(RefundAttempt)
        .where(RefundAttempt.id == inbox.refund_attempt_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    outcome = inbox.safe_payload["outcome"]
    if outcome == "succeeded":
        if attempt.status != "succeeded":
            attempt.status, attempt.resolved_at = "succeeded", now()
            attempt.safe_result = {"outcome": "succeeded"}
        if refund.status != "succeeded":
            refund.status, refund.succeeded_at = "succeeded", now()
            audit(db, event, "payments.refund_succeeded", refund)
    elif outcome == "failed":
        if attempt.status not in ("succeeded", "failed"):
            attempt.status, attempt.resolved_at = "failed", now()
            attempt.safe_result = {"outcome": "failed"}
        if refund.status == "pending":
            # The same logical obligation is retried; it never becomes a second refund.
            refund.status = "failed"
            schedule_refund(db, refund, attempt.attempt_number + 1, REFUND_RETRY_SECONDS)
            audit(db, event, "payments.refund_failed", refund)
    elif attempt.status == "pending":
        # Unknown provider result: keep the refund pending until an authoritative answer.
        attempt.status = "unknown"
        attempt.safe_result = {"outcome": "unknown", "reconcile": True}


def process_received_once(factory, settings):
    """Worker recovery: apply an inbox row left unprocessed by an interrupted request."""
    with factory() as db:
        inbox_id = db.scalar(
            select(ProviderEvent.id)
            .where(ProviderEvent.status == "received")
            .order_by(ProviderEvent.created_at)
            .limit(1)
        )
    if not inbox_id:
        return False
    process(factory, settings, inbox_id)
    return True


def payer_check(settings, user, intent):
    if not simulation_enabled(settings):
        fail("not_found", 404)
    if not intent or intent.payer_user_id != user.id:
        fail("payment_not_found", 404)


def simulate(factory, settings, user, attempt_id, data):
    """Demo/test control standing in for the provider's hosted page and payment webhook."""
    with factory() as db:
        attempt = db.get(PaymentAttempt, attempt_id)
        intent = db.get(PaymentIntent, attempt.intent_id) if attempt else None
        payer_check(settings, user, intent)
        expected = intent.expected_minor
    payload = {
        "outcome": data.outcome,
        "amount_minor": data.amount_minor if data.amount_minor is not None else expected,
        "currency": "KZT",
    }
    external = data.external_event_id or f"sim_evt_{uuid4().hex}"
    inbox_id = receive(factory, external, payload, payment_attempt_id=attempt_id)
    process(factory, settings, inbox_id)
    with factory() as db:
        return {
            "provider_event_id": inbox_id,
            "external_event_id": external,
            "attempt": attempt_view(db.get(PaymentAttempt, attempt_id)),
        }


def simulate_refund(factory, settings, user, refund_attempt_id, data):
    """Demo/test control standing in for the provider's refund webhook."""
    with factory() as db:
        attempt = db.get(RefundAttempt, refund_attempt_id)
        refund = db.get(Refund, attempt.refund_id) if attempt else None
        payment = db.get(PaymentAttempt, refund.payment_attempt_id) if refund else None
        intent = db.get(PaymentIntent, payment.intent_id) if payment else None
        payer_check(settings, user, intent)
    external = data.external_event_id or f"sim_ref_evt_{uuid4().hex}"
    inbox_id = receive(
        factory, external, {"outcome": data.outcome}, refund_attempt_id=refund_attempt_id
    )
    process(factory, settings, inbox_id)
    with factory() as db:
        return {
            "provider_event_id": inbox_id,
            "external_event_id": external,
            "refund": refund_view(db, db.get(Refund, refund.id)),
        }
