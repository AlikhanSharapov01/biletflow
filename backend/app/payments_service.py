"""Simulated payment boundary shared by paid-sales activation and paid orders.

Every record is labelled environment="simulation". Flow (database specification TX-07/09):
persist intent + attempt + initialization job in the business commit; the worker initializes
the attempt after that commit; provider (simulator) notifications land in a deduplicated
inbox and are then applied under the event lock exactly once.
"""

import hashlib
import json
from uuid import uuid4

from sqlalchemy import select

from .catalog_models import Event
from .commerce_models import PaymentAttempt, PaymentIntent, ProviderEvent
from .models import OutboxJob
from .security import fail, now

PROVIDER = "biletflow-simulator"
MERCHANT = "biletflow-demo"
ENVIRONMENT = "simulation"
OUTCOMES = ("pending", "succeeded", "failed")

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


def initialize_once(factory):
    """Worker step: initialize one created attempt with the simulator, after its commit."""
    with factory.begin() as db:
        job = db.scalar(
            select(OutboxJob)
            .where(
                OutboxJob.kind == "payment_initialize",
                OutboxJob.status == "pending",
                OutboxJob.available_at <= now(),
            )
            .order_by(OutboxJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
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
        job.attempt_count += 1
        job.status, job.completed_at = "done", now()
        return True


def payload_hash(payload):
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def receive(factory, attempt_id, external_event_id, payload):
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
            payment_attempt_id=attempt_id,
            payload_hash=digest,
            safe_payload=payload,
        )
        db.add(row)
        db.flush()
        return row.id


def process(factory, provider_event_id):
    """Apply one inbox row exactly once under the event lock (TX-09)."""
    with factory.begin() as db:
        inbox = db.get(ProviderEvent, provider_event_id)
        attempt_id = inbox.payment_attempt_id
        event_id = db.scalar(select(PaymentAttempt.event_id).where(PaymentAttempt.id == attempt_id))
        db.scalar(
            select(Event)
            .where(Event.id == event_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        inbox = db.scalar(
            select(ProviderEvent)
            .where(ProviderEvent.id == provider_event_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if inbox.status != "received":
            return inbox.status
        attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.id == attempt_id))
        intent = db.get(PaymentIntent, attempt.intent_id)
        lock_target, on_success, on_failure = TARGETS[intent.purpose]
        # Target rows (activation or order) lock before the payment rows (hierarchy).
        target = lock_target(db, intent)
        attempt = db.scalar(
            select(PaymentAttempt)
            .where(PaymentAttempt.id == attempt_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        payload = inbox.safe_payload
        outcome = payload["outcome"]
        if outcome == "pending":
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
            # Money was captured either way; only an exact match may fulfill.
            on_success(db, target, intent, attempt, matches)
        inbox.status, inbox.processed_at = "processed", now()
        return inbox.status


def process_received_once(factory):
    """Worker recovery: apply an inbox row left unprocessed by an interrupted request."""
    with factory() as db:
        inbox_id = db.scalar(
            select(ProviderEvent.id)
            .where(
                ProviderEvent.status == "received", ProviderEvent.payment_attempt_id.is_not(None)
            )
            .order_by(ProviderEvent.created_at)
            .limit(1)
        )
    if not inbox_id:
        return False
    process(factory, inbox_id)
    return True


def simulate(factory, settings, user, attempt_id, data):
    """Demo/test control standing in for the provider's hosted page and webhook."""
    if not simulation_enabled(settings):
        fail("not_found", 404)
    with factory() as db:
        attempt = db.get(PaymentAttempt, attempt_id)
        intent = db.get(PaymentIntent, attempt.intent_id) if attempt else None
        if not intent or intent.payer_user_id != user.id:
            fail("payment_not_found", 404)
        expected = intent.expected_minor
    payload = {
        "outcome": data.outcome,
        "amount_minor": data.amount_minor if data.amount_minor is not None else expected,
        "currency": "KZT",
    }
    external = data.external_event_id or f"sim_evt_{uuid4().hex}"
    inbox_id = receive(factory, attempt_id, external, payload)
    process(factory, inbox_id)
    with factory() as db:
        attempt = db.get(PaymentAttempt, attempt_id)
        return {
            "provider_event_id": inbox_id,
            "external_event_id": external,
            "attempt": attempt_view(attempt),
        }
