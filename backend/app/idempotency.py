"""Idempotency-Key handling for commerce requests.

Protocol (database specification, section 4): take a transaction-scoped advisory lock on
(actor, operation, key) before any domain lock, compare the stored request fingerprint,
and record the completed outcome in the same commit as the business result.
"""

import hashlib
import json
import re
from datetime import timedelta

from sqlalchemy import func, select

from .commerce_models import IdempotencyRecord
from .security import fail, now

KEY_PATTERN = re.compile(r"[A-Za-z0-9._:-]{8,128}")
RECORD_HOURS = 24


def checked_key(raw):
    if raw is None:
        return None
    if not KEY_PATTERN.fullmatch(raw):
        fail("invalid_idempotency_key", 422)
    return raw


def fingerprint(payload):
    # Canonical JSON of normalized semantic input; never include credentials.
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def guard(db, actor_id, operation, key):
    lock_name = f"{actor_id}:{operation}:{key}"
    db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(lock_name, 0))))


def remembered(db, actor_id, operation, key, request_hash):
    record = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.actor_user_id == actor_id,
            IdempotencyRecord.operation == operation,
            IdempotencyRecord.request_key == key,
        )
    )
    if not record or record.expires_at <= now():
        return None
    if record.request_hash != request_hash:
        fail("idempotency_key_reused", 409)
    return record


def remember(db, actor_id, operation, key, request_hash, resource_type, resource_id, code):
    current = now()
    values = {
        "request_hash": request_hash,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "response_code": code,
        "expires_at": current + timedelta(hours=RECORD_HOURS),
    }
    record = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.actor_user_id == actor_id,
            IdempotencyRecord.operation == operation,
            IdempotencyRecord.request_key == key,
        )
    )
    if record:
        # Only an expired record can reach here; reuse its row instead of deleting it.
        for name, value in values.items():
            setattr(record, name, value)
        record.created_at = current
    else:
        db.add(
            IdempotencyRecord(
                actor_user_id=actor_id, operation=operation, request_key=key, **values
            )
        )
