"""Consent-aware GA4 collection, deduplicated export and cached aggregates (BF-19).

GA4 is optional and never financial truth. Checkout, refunds and attribution never call this
module: the worker finds confirmed orders and succeeded refunds afterwards, so a disabled,
refused or unavailable GA4 cannot block or change a sale. Only opaque HMAC references, route
templates and amounts leave the system; never names, emails, IDs, tokens or event details.
"""

import hashlib
import hmac
import json
import re
import time
from datetime import timedelta
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert

from .campaign_models import Campaign
from .catalog_service import event_guard
from .ga4_client import GA4Error, GA4Unavailable
from .ga4_models import MEASUREMENTS, AnalyticsExport, GA4Cache, GA4Connection
from .observability import signal
from .security import fail, now
from .service import rate_limit, valid_session

GA4_NAMES = {
    "campaign_landing": "campaign_landing",
    "event_view": "view_item",
    "checkout_start": "begin_checkout",
    "purchase": "purchase",
    "refund": "refund",
}
KINDS = {name: kind for kind, name in GA4_NAMES.items()}
BATCH = 20
ENQUEUE_LIMIT = 200
LOOKBACK = timedelta(days=7)
LEASE = timedelta(seconds=120)
MAX_ATTEMPTS = 5
# Wall-clock budget for starting sends in one worker pass, so a slow provider cannot hold up the
# shared worker loop; unsent rows wait for the next pass without using an attempt.
SEND_BUDGET_SECONDS = 5
OUTAGE_RETRY = timedelta(minutes=5)
# Per-account client measurements per RATE_WINDOW_SECONDS, and pending rows per connection.
MEASUREMENT_LIMIT = 60
PENDING_CAP = 10_000
DEFAULT_RANGE_DAYS = 28
MAX_RANGE_DAYS = 366
DEFINITIONS = {
    "source": "GA4 Data API aggregates of consenting signed-in visitors; not BiletFlow sales.",
    "event_count": "GA4 eventCount for the event's opaque event_ref in [from,to).",
    "users": "GA4 totalUsers (pseudonymous client IDs) for the same measurement.",
    "purchase": "GA4 purchase measurements; sales and revenue come from operational analytics.",
    "range": "Dates are evaluated in the GA4 property time zone.",
    "states": "disabled/not_connected: no GA4; unavailable/error: no data, not zero; "
    "stale: last cached values after a failed refresh.",
}


def collection_ready(settings):
    return bool(
        settings.ga4_enabled
        and settings.ga4_measurement_id
        and settings.ga4_api_secret.get_secret_value()
    )


def reporting_ready(settings):
    return bool(
        settings.ga4_enabled
        and settings.ga4_property_id
        and settings.ga4_credentials_json.get_secret_value()
    )


def reference(settings, purpose, value):
    """Stable, non-reversible analytics identifier; distinct from every operational ID."""
    return hmac.new(
        settings.challenge_secret.get_secret_value().encode(),
        f"ga4-{purpose}:{value}".encode(),
        hashlib.sha256,
    ).hexdigest()[:32]


def event_ref(settings, event_id):
    return reference(settings, "event", event_id)


def scrub_page(settings, value):
    """Public route template only; query strings, fragments, IDs and private routes are dropped."""
    if not value:
        return None
    try:
        path = urlsplit(value).path.rstrip("/") or "/"
    except ValueError:  # untrusted input, e.g. "//[" is an invalid IPv6 netloc
        return None
    if path in ("/", "/discover"):
        template = "/discover"
    elif re.fullmatch(r"/events/[^/]+", path):
        template = "/events/event"
    elif re.fullmatch(r"/c/[^/]+", path):
        template = "/c/campaign"
    else:
        return None
    return settings.frontend_url.rstrip("/") + template


def payload(settings, user_id, kind, params):
    return {
        "client_id": reference(settings, "client", user_id),
        "non_personalized_ads": True,
        "events": [{"name": GA4_NAMES[kind], "params": params}],
    }


def enabled_connection(db, organization_id):
    return db.scalar(
        select(GA4Connection).where(
            GA4Connection.organization_id == organization_id, GA4Connection.is_enabled
        )
    )


def connection_view(settings, organization_id, row):
    return {
        "organization_id": organization_id,
        "property_id": row.property_id if row else None,
        "is_enabled": bool(row and row.is_enabled),
        "enabled_at": row.enabled_at if row else None,
        "integration": "enabled" if settings.ga4_enabled else "disabled",
    }


def set_connection(db, settings, org, enabled):
    """Owner switch; the organization row is locked by the caller. Enabling never backfills."""
    row = db.scalar(
        select(GA4Connection).where(GA4Connection.organization_id == org.id).with_for_update()
    )
    if enabled:
        if not (settings.ga4_enabled and settings.ga4_property_id):
            fail("ga4_disabled", 409)
        if not row:
            row = GA4Connection(organization_id=org.id, property_id=settings.ga4_property_id)
            db.add(row)
        if not row.is_enabled:
            row.enabled_at = now()
        row.property_id, row.is_enabled = settings.ga4_property_id, True
    elif row:
        row.is_enabled = False
    if row:
        row.updated_at = now()
        db.flush()
    return row


def refusal(settings, user):
    """Why a client measurement is not collected at all, checked before any rate counting."""
    if not collection_ready(settings):
        return {"status": "skipped", "reason": "disabled"}
    if not user.analytics_consent:
        return {"status": "skipped", "reason": "consent_required"}
    return None


def measurement_rate_limit(factory, settings, ip, user_id):
    """Per-account (and looser per-IP) budget on the shared rate buckets; 429 when exceeded."""
    rate_limit(
        factory,
        settings,
        ip,
        "ga4_measurement",
        user_id,
        ip_limit=MEASUREMENT_LIMIT * 10,
        identity_limit=MEASUREMENT_LIMIT,
    )


def collect(db, settings, user, data):
    """Store one allowlisted client measurement; refusal or disabled GA4 is not an error."""
    refused = refusal(settings, user)
    if refused:
        return refused
    event = event_guard(db, user, data.event_id)
    if data.campaign_id and not db.scalar(
        select(Campaign.id).where(Campaign.id == data.campaign_id, Campaign.event_id == event.id)
    ):
        fail("invalid_measurement", 422)
    connection = enabled_connection(db, event.organization_id)
    if not connection:
        return {"status": "skipped", "reason": "not_connected"}
    # A bounded outbox: past the cap new client measurements are dropped, never queued.
    pending = select(AnalyticsExport.id).where(
        AnalyticsExport.connection_id == connection.id, AnalyticsExport.status == "pending"
    )
    if db.scalar(select(func.count()).select_from(pending.limit(PENDING_CAP).subquery())) >= (
        PENDING_CAP
    ):
        return {"status": "skipped", "reason": "backlog_full"}
    params = {
        "event_ref": event_ref(settings, event.id),
        "platform": data.platform,
        "engagement_time_msec": 1,
    }
    if data.campaign_id:
        params["campaign_ref"] = reference(settings, "campaign", data.campaign_id)
    page = scrub_page(settings, data.page_path)
    if page:
        params["page_location"] = page
    inserted = db.execute(
        insert(AnalyticsExport)
        .values(
            connection_id=connection.id,
            organization_id=connection.organization_id,
            event_id=event.id,
            measurement_kind=data.name,
            analytics_event_id=data.analytics_event_id,
            safe_payload=payload(settings, user.id, data.name, params),
        )
        .on_conflict_do_nothing(constraint="analytics_export_uq1")
        .returning(AnalyticsExport.id)
    ).first()
    return {"status": "accepted" if inserted else "duplicate", "reason": None}


PURCHASES = """
SELECT o.id, o.event_id, o.buyer_user_id, o.campaign_id, o.payable_minor,
       c.id AS connection_id, c.organization_id,
       (SELECT count(*) FROM biletflow.order_item i WHERE i.order_id=o.id) AS tickets
FROM biletflow.ticket_order o
JOIN biletflow.event e ON e.id=o.event_id
JOIN biletflow.ga4_connection c ON c.organization_id=e.organization_id AND c.is_enabled
JOIN biletflow.app_user u ON u.id=o.buyer_user_id AND u.analytics_consent
WHERE o.confirmed_at IS NOT NULL AND o.confirmed_at >= c.enabled_at AND o.confirmed_at > :since
  AND NOT EXISTS (SELECT 1 FROM biletflow.analytics_export x WHERE x.connection_id=c.id
                  AND x.order_id=o.id AND x.measurement_kind='purchase')
ORDER BY o.confirmed_at, o.id LIMIT :limit
"""

# Only the refund of the charge that fulfilled an exported purchase; duplicate and late
# charges never became GA4 revenue.
REFUNDS = """
SELECT r.id AS refund_id, r.amount_minor, o.id, o.event_id, o.buyer_user_id,
       c.id AS connection_id, c.organization_id
FROM biletflow.refund r
JOIN biletflow.ticket_order o ON o.fulfillment_payment_attempt_id=r.payment_attempt_id
JOIN biletflow.analytics_export p ON p.order_id=o.id AND p.measurement_kind='purchase'
     AND p.status IN ('pending','sent')
JOIN biletflow.ga4_connection c ON c.id=p.connection_id AND c.is_enabled
JOIN biletflow.app_user u ON u.id=o.buyer_user_id AND u.analytics_consent
WHERE r.status='succeeded' AND r.succeeded_at > :since
  AND NOT EXISTS (SELECT 1 FROM biletflow.analytics_export x WHERE x.connection_id=c.id
                  AND x.refund_id=r.id AND x.measurement_kind='refund')
ORDER BY r.succeeded_at, r.id LIMIT :limit
"""


def enqueue(db, settings):
    """Record pending purchase/refund measurements for consenting buyers of connected events."""
    params = {"since": now() - LOOKBACK, "limit": ENQUEUE_LIMIT}
    rows = []
    for row in db.execute(text(PURCHASES), params).mappings():
        values = {
            "event_ref": event_ref(settings, row["event_id"]),
            "platform": "server",
            "transaction_id": reference(settings, "transaction", row["id"]),
            "currency": "KZT",
            "value": row["payable_minor"] / 100,
            "tickets": row["tickets"],
        }
        if row["campaign_id"]:
            values["campaign_ref"] = reference(settings, "campaign", row["campaign_id"])
        rows.append((row, None, "purchase", values))
    for row in db.execute(text(REFUNDS), params).mappings():
        values = {
            "event_ref": event_ref(settings, row["event_id"]),
            "platform": "server",
            "transaction_id": reference(settings, "transaction", row["id"]),
            "currency": "KZT",
            "value": row["amount_minor"] / 100,
        }
        rows.append((row, row["refund_id"], "refund", values))
    for row, refund_id, kind, values in rows:
        db.execute(
            insert(AnalyticsExport)
            .values(
                connection_id=row["connection_id"],
                organization_id=row["organization_id"],
                event_id=row["event_id"],
                order_id=row["id"],
                refund_id=refund_id,
                measurement_kind=kind,
                analytics_event_id=uuid4(),
                safe_payload=payload(settings, row["buyer_user_id"], kind, values),
            )
            .on_conflict_do_nothing()
        )
    return len(rows)


def export_ga4_once(factory, settings, provider):
    """One bounded worker pass: enqueue, lease, send outside the transaction, record outcome.

    Returns how many measurements were attempted or closed. A lease is the attempt number plus a
    pushed-back ``available_at``; only the matching attempt may record its outcome.
    """
    if not collection_ready(settings):
        return 0
    with factory.begin() as db:
        enqueue(db, settings)
    closed, leased = 0, []
    with factory.begin() as db:
        rows = db.scalars(
            select(AnalyticsExport)
            .where(AnalyticsExport.status == "pending", AnalyticsExport.available_at <= now())
            .order_by(AnalyticsExport.created_at, AnalyticsExport.id)
            .with_for_update(skip_locked=True)
            .limit(BATCH)
        ).all()
        enabled = set(
            db.scalars(
                select(GA4Connection.id).where(
                    GA4Connection.id.in_([row.connection_id for row in rows]),
                    GA4Connection.is_enabled,
                )
            )
        )
        for row in rows:
            if row.connection_id not in enabled:
                row.status, row.last_error = "skipped", "not_connected"
                closed += 1
            elif row.attempt_count >= MAX_ATTEMPTS:
                row.status, row.last_error = "failed", "attempts_exhausted"
                closed += 1
            else:
                row.attempt_count += 1
                row.available_at = now() + LEASE
                leased.append((row.id, row.attempt_count, row.safe_payload))
    outcomes, outage = [], False
    deadline = time.monotonic() + SEND_BUDGET_SECONDS
    for identifier, attempt, body in leased:
        if outage or time.monotonic() >= deadline:
            # Not attempted: after an outage or past the budget the rest of the batch waits.
            outcomes.append((identifier, attempt, "deferred"))
            continue
        try:
            provider.send(body)
            error = None
        except GA4Unavailable:
            error, outage = "ga4_unavailable", True
        except GA4Error:
            error = "ga4_error"
        except Exception:
            error = "ga4_send_failed"  # no exception text: it may echo secrets
        outcomes.append((identifier, attempt, error))
    with factory.begin() as db:
        for identifier, attempt, error in outcomes:
            if error is None:
                values = {"status": "sent", "sent_at": now(), "last_error": None}
            elif error == "deferred":
                values = {
                    "attempt_count": attempt - 1,
                    "available_at": now() + (OUTAGE_RETRY if outage else timedelta(0)),
                }
            elif error == "ga4_unavailable":
                # An outage is not the measurement's fault: no attempt is used, so a long outage
                # never turns queued purchases/refunds into permanent failures.
                values = {
                    "attempt_count": attempt - 1,
                    "available_at": now() + OUTAGE_RETRY,
                    "last_error": error,
                }
            else:
                values = {
                    "available_at": now() + timedelta(seconds=min(3600, 30 * 2**attempt)),
                    "last_error": error,
                }
                if attempt >= MAX_ATTEMPTS:
                    values["status"] = "failed"
            if error not in (None, "deferred"):
                # IDs and error codes only: these rows are on neither the jobs page nor metrics.
                signal(
                    "ga4.export_failed",
                    export_id=identifier,
                    attempt=attempt,
                    last_error=error,
                    final=values.get("status") == "failed",
                )
            db.execute(
                update(AnalyticsExport)
                .where(
                    AnalyticsExport.id == identifier,
                    AnalyticsExport.status == "pending",
                    AnalyticsExport.attempt_count == attempt,
                )
                .values(**values)
            )
    return closed + len(leased)


def report_body(ref, start, end):
    return {
        "dateRanges": [
            {"startDate": start.isoformat(), "endDate": (end - timedelta(days=1)).isoformat()}
        ],
        "dimensions": [{"name": "eventName"}],
        "metrics": [{"name": "eventCount"}, {"name": "totalUsers"}],
        "dimensionFilter": {
            "filter": {
                "fieldName": "customEvent:event_ref",
                "stringFilter": {"matchType": "EXACT", "value": ref},
            }
        },
        "limit": 100,
    }


def parse_report(raw):
    metrics = {kind: {"event_count": 0, "users": 0} for kind in MEASUREMENTS}
    try:
        for row in raw.get("rows", []):
            kind = KINDS.get(row["dimensionValues"][0]["value"])
            if kind:
                values = row["metricValues"]
                metrics[kind] = {
                    "event_count": int(values[0]["value"]),
                    "users": int(values[1]["value"]),
                }
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        raise GA4Error() from None
    return {"version": 1, "funnel": metrics}


def traffic_report(factory, settings, provider, ids, event_id, start, end):
    """Cached GA4 funnel for one reports-authorized event, with its source and freshness state."""
    with factory() as db:
        user, _ = valid_session(db, *ids)
        event = event_guard(db, user, event_id, "reports")
        today = now().astimezone(ZoneInfo(event.time_zone)).date()
        end = end or today + timedelta(days=1)
        start = start or end - timedelta(days=DEFAULT_RANGE_DAYS)
        if start >= end:
            fail("invalid_range", 422)
        if (end - start).days > MAX_RANGE_DAYS:
            fail("analytics_range_too_large", 422)
        report = {
            "event_id": event.id,
            "source": "ga4",
            "state": "disabled",
            "error": None,
            "timezone": event.time_zone,
            "range": {"from_": start, "to": end},
            "fetched_at": None,
            "expires_at": None,
            "metrics": None,
            "definitions": DEFINITIONS,
        }
        if not reporting_ready(settings):
            return report
        connection = enabled_connection(db, event.organization_id)
        if not connection:
            return report | {"state": "not_connected"}
        body = report_body(event_ref(settings, event.id), start, end)
        canonical = {"v": 1, "property": connection.property_id, "body": body}
        query_hash = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
        cached = db.scalar(
            select(GA4Cache).where(
                GA4Cache.connection_id == connection.id,
                GA4Cache.event_id == event.id,
                GA4Cache.query_hash == query_hash,
            )
        )
        if cached:
            cached = {
                "metrics": cached.metrics["funnel"],
                "fetched_at": cached.fetched_at,
                "expires_at": cached.expires_at,
            }
        scope = {
            "connection_id": connection.id,
            "organization_id": connection.organization_id,
            "event_id": event.id,
        }
        property_id = connection.property_id
    if cached and cached["expires_at"] > now():
        return report | cached | {"state": "fresh"}
    # The provider call holds no transaction or row lock; a failure is never reported as zero.
    try:
        metrics = parse_report(provider.run_report(property_id, body))
    except (GA4Unavailable, GA4Error) as failure:
        error = "ga4_unavailable" if isinstance(failure, GA4Unavailable) else "ga4_error"
        if cached:
            return report | cached | {"state": "stale", "error": error}
        state = "unavailable" if error == "ga4_unavailable" else "error"
        return report | {"state": state, "error": error}
    fetched = now()
    values = {
        "metrics": metrics,
        "fetched_at": fetched,
        "expires_at": fetched + timedelta(seconds=settings.ga4_cache_seconds),
    }
    with factory.begin() as db:
        db.execute(
            insert(GA4Cache)
            .values(**scope, query_hash=query_hash, range_start=start, range_end=end, **values)
            .on_conflict_do_update(constraint="ga4_cache_uq1", set_=values)
        )
    return report | values | {"metrics": metrics["funnel"], "state": "fresh"}
