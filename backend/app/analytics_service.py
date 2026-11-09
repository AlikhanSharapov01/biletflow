"""Read-only operational aggregates; purchase cohorts and current inventory are distinct."""

from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from .campaign_models import Campaign
from .catalog_models import TicketType
from .security import fail, now

LIMIT = 10_000
DEFINITIONS = {
    "money": "Integer 1/100 KZT; saved purchase and payment snapshots, no live funds.",
    "range": "Purchase cohort: confirmed_at, or created_at for unfulfilled charges; [from,to).",
    "inventory": "Current allocation state; sold includes quarantine; released history excluded.",
    "capacity": "Current configured saleable scope; date/campaign filters do not change capacity.",
    "held": "Unexpired active holds; expired_held still blocks availability until cleanup.",
    "gross_minor": "Saved face values of fulfilled items, before discounts.",
    "collected_minor": "Actual successful ticket charges, including compensating extra charges.",
    "fulfilled_collected_minor": "Fulfilled item face values less saved discounts.",
    "fees_minor": "Saved charge fees less fees reversed on successful full simulated refunds.",
    "pending_refunds_minor": "Requested, pending or failed full-refund obligations.",
    "net_minor": "Actual collections less successful ticket refunds and retained processing fees.",
    "campaign": "Eligible purchased items only; remaining amounts appear as Unattributed.",
    "attendance": "Current eligible tickets and unreversed accepted admissions; provisional scans excluded.",
    "series": "Fulfilled items and saved paid amounts at confirmation in event timezone; empty buckets omitted.",
}

# Each attempt/refund contributes once per order before joining the bounded dimensions.
# Cumulative integer allocation preserves every minor unit across ticket-type/campaign filters.
ITEMS = """
WITH units AS (
 SELECT i.*, o.confirmed_at, coalesce(o.confirmed_at,o.created_at) AS cohort_at,
        o.fulfillment_payment_attempt_id,
        CASE WHEN i.campaign_eligible THEN o.campaign_id END AS attributed_campaign_id,
        sum(i.paid_minor) OVER (PARTITION BY i.order_id ORDER BY i.unit_number) AS cumulative,
        sum(i.paid_minor) OVER (PARTITION BY i.order_id) AS payable
 FROM biletflow.order_item i JOIN biletflow.ticket_order o ON o.id=i.order_id
 WHERE i.event_id=:event_id
), charges AS (
 SELECT p.order_id, a.id AS attempt_id, a.charged_minor, a.processing_fee_minor,
        a.environment, r.status AS refund_status, coalesce(r.amount_minor,0) AS refund_minor
 FROM biletflow.payment_intent p
 JOIN biletflow.payment_attempt a ON a.intent_id=p.id AND a.status='succeeded'
 LEFT JOIN biletflow.refund r ON r.payment_attempt_id=a.id
 WHERE p.event_id=:event_id AND p.purpose='ticket_order'
), money AS (
 SELECT u.id,
  sum(floor(c.charged_minor::numeric*u.cumulative/nullif(u.payable,0))
     -floor(c.charged_minor::numeric*(u.cumulative-u.paid_minor)/nullif(u.payable,0))) AS collected,
  sum(CASE WHEN c.attempt_id=u.fulfillment_payment_attempt_id THEN u.processing_fee_minor
      ELSE floor(c.processing_fee_minor::numeric*u.cumulative/nullif(u.payable,0))
          -floor(c.processing_fee_minor::numeric*(u.cumulative-u.paid_minor)/nullif(u.payable,0)) END) AS charged_fees,
  sum(CASE WHEN c.refund_status='succeeded' THEN
      floor(c.refund_minor::numeric*u.cumulative/nullif(u.payable,0))
     -floor(c.refund_minor::numeric*(u.cumulative-u.paid_minor)/nullif(u.payable,0)) ELSE 0 END) AS refunds,
  sum(CASE WHEN c.refund_status IN ('requested','pending','failed') THEN
      floor(c.refund_minor::numeric*u.cumulative/nullif(u.payable,0))
     -floor(c.refund_minor::numeric*(u.cumulative-u.paid_minor)/nullif(u.payable,0)) ELSE 0 END) AS pending_refunds,
  sum(CASE WHEN c.refund_status='succeeded' AND c.environment='simulation' THEN
      CASE WHEN c.attempt_id=u.fulfillment_payment_attempt_id THEN u.processing_fee_minor
      ELSE floor(c.processing_fee_minor::numeric*u.cumulative/nullif(u.payable,0))
          -floor(c.processing_fee_minor::numeric*(u.cumulative-u.paid_minor)/nullif(u.payable,0)) END ELSE 0 END) AS fee_reversals
 FROM units u JOIN charges c ON c.order_id=u.order_id GROUP BY u.id
), items AS (
 SELECT u.*, t.status AS ticket_status, a.state AS allocation_state,
        ci.id AS current_check_in, coalesce(m.collected,0) AS collected,
        coalesce(m.charged_fees,0) AS charged_fees, coalesce(m.refunds,0) AS refunds,
        coalesce(m.pending_refunds,0) AS pending_refunds,
        coalesce(m.fee_reversals,0) AS fee_reversals
 FROM units u JOIN biletflow.inventory_allocation a ON a.id=u.allocation_id
 LEFT JOIN biletflow.ticket t ON t.order_item_id=u.id
 LEFT JOIN biletflow.check_in ci ON ci.ticket_id=t.id AND ci.reversed_at IS NULL
 LEFT JOIN money m ON m.id=u.id
 WHERE (CAST(:from_ AS timestamptz) IS NULL OR u.cohort_at>=:from_)
   AND (CAST(:to AS timestamptz) IS NULL OR u.cohort_at<:to)
   AND (CAST(:ticket_type_id AS uuid) IS NULL OR u.ticket_type_id=:ticket_type_id)
   AND (CAST(:campaign_id AS uuid) IS NULL OR u.attributed_campaign_id=:campaign_id)
)
"""

TOTALS = """
 count(*) FILTER (WHERE confirmed_at IS NOT NULL) AS original_tickets,
 count(*) FILTER (WHERE ticket_status='refunded') AS refunded_tickets,
 count(*) FILTER (WHERE ticket_status IN ('valid','checked_in')) AS issued,
 count(*) FILTER (WHERE allocation_state IN ('sold','refund_quarantine')) AS sold,
 count(*) FILTER (WHERE allocation_state='refund_quarantine') AS refund_pending,
 count(*) FILTER (WHERE current_check_in IS NOT NULL AND ticket_status IN ('valid','checked_in')) AS checked_in,
 count(DISTINCT order_id) FILTER (WHERE confirmed_at IS NOT NULL AND attributed_campaign_id IS NOT NULL) AS redemptions,
 coalesce(sum(face_value_minor) FILTER (WHERE confirmed_at IS NOT NULL),0) AS gross_minor,
 coalesce(sum(discount_minor) FILTER (WHERE confirmed_at IS NOT NULL),0) AS discount_minor,
 coalesce(sum(paid_minor) FILTER (WHERE confirmed_at IS NOT NULL),0) AS fulfilled_collected_minor,
 coalesce(sum(collected),0) AS collected_minor,
 coalesce(sum(charged_fees),0) AS charged_fees_minor,
 coalesce(sum(refunds),0) AS refunds_minor,
 coalesce(sum(pending_refunds),0) AS pending_refunds_minor,
 coalesce(sum(fee_reversals),0) AS fee_reversals_minor
"""

INVENTORY = """
WITH seats AS (
 SELECT ticket_type_id, count(*) FILTER (WHERE NOT is_blocked) AS saleable,
        count(*) FILTER (WHERE is_blocked) AS blocked
 FROM biletflow.event_seat WHERE event_id=:event_id GROUP BY ticket_type_id
), holds AS (
 SELECT a.ticket_type_id,
  count(*) FILTER (WHERE a.state='held' AND h.status='active' AND h.expires_at>CURRENT_TIMESTAMP) AS held,
  count(*) FILTER (WHERE a.state='held' AND (h.status<>'active' OR h.expires_at<=CURRENT_TIMESTAMP)) AS expired_held,
  count(*) FILTER (WHERE a.state IN ('sold','refund_quarantine')) AS occupied
 FROM biletflow.inventory_allocation a JOIN biletflow.checkout_hold h ON h.id=a.hold_id
 WHERE a.event_id=:event_id GROUP BY a.ticket_type_id
)
SELECT t.id, t.name, t.quantity_limit, coalesce(s.saleable,0) AS saleable,
 coalesce(s.blocked,0) AS blocked, coalesce(h.held,0) AS held,
 coalesce(h.expired_held,0) AS expired_held, coalesce(h.occupied,0) AS occupied
FROM biletflow.ticket_type t LEFT JOIN seats s ON s.ticket_type_id=t.id
LEFT JOIN holds h ON h.ticket_type_id=t.id
WHERE t.event_id=:event_id AND (CAST(:ticket_type_id AS uuid) IS NULL OR t.id=:ticket_type_id)
ORDER BY t.id LIMIT 10001
"""


def validate_filters(db, event, filters):
    for model, key in ((TicketType, "ticket_type_id"), (Campaign, "campaign_id")):
        value = filters[key]
        if value and not db.scalar(
            select(model.id).where(model.id == value, model.event_id == event.id)
        ):
            fail("invalid_analytics_filter", 422)


def bounded(rows):
    rows = list(rows)
    if len(rows) > LIMIT:
        fail("analytics_range_too_large", 422)
    return rows


def normalize(row):
    values = {
        key: int(value) for key, value in row.items() if key not in ("dimension", "dimension_id")
    }
    values["fees_minor"] = values["charged_fees_minor"] - values["fee_reversals_minor"]
    values["net_minor"] = values["collected_minor"] - values["refunds_minor"] - values["fees_minor"]
    return values


def metadata(event, filters):
    return {
        "event_id": event.id,
        "timezone": event.time_zone,
        "generated_at": now(),
        "filters": {"from" if key == "from_" else key: value for key, value in filters.items()},
        "definitions": DEFINITIONS,
    }


def summary(db, event, filters):
    validate_filters(db, event, filters)
    params = filters | {"event_id": event.id}
    rows = bounded(
        db.execute(
            text(
                ITEMS
                + f"""
 SELECT 'total' AS dimension, NULL::uuid AS dimension_id, {TOTALS} FROM items
 UNION ALL SELECT 'type', ticket_type_id, {TOTALS} FROM items GROUP BY ticket_type_id
 UNION ALL SELECT 'campaign', attributed_campaign_id, {TOTALS} FROM items GROUP BY attributed_campaign_id
 LIMIT 10001
 """
            ),
            params,
        ).mappings()
    )
    total = normalize(next(row for row in rows if row["dimension"] == "total"))
    inventory_rows = bounded(db.execute(text(INVENTORY), params).mappings())
    types = {}
    for row in inventory_rows:
        capacity = (
            min(row["quantity_limit"], row["saleable"])
            if event.seating_mode == "assigned"
            else row["quantity_limit"]
        )
        types[row["id"]] = dict(row) | {"capacity": min(event.capacity, capacity)}
    capacity = min(event.capacity, sum(row["capacity"] for row in types.values()))
    held = sum(row["held"] for row in types.values())
    expired = sum(row["expired_held"] for row in types.values())
    occupied = sum(row["occupied"] for row in types.values())
    available = min(
        max(0, event.capacity - occupied - held - expired),
        sum(
            max(0, row["capacity"] - row["occupied"] - row["held"] - row["expired_held"])
            for row in types.values()
        ),
    )
    # A type-filtered view still respects inventory committed to the other event types.
    if filters["ticket_type_id"]:
        all_occupied = db.scalar(
            text("""SELECT count(*) FROM biletflow.inventory_allocation
            WHERE event_id=:event_id AND state IN ('held','sold','refund_quarantine')"""),
            params,
        )
        available = min(available, max(0, event.capacity - all_occupied))
    by_type = []
    grouped_types = {
        row["dimension_id"]: normalize(row) for row in rows if row["dimension"] == "type"
    }
    for type_id, row in types.items():
        metrics = grouped_types.get(type_id, {})
        by_type.append(
            {
                "ticket_type_id": type_id,
                "name": row["name"],
                "capacity": row["capacity"],
                "sold": metrics.get("sold", 0),
                "checked_in": metrics.get("checked_in", 0),
                "revenue_minor": metrics.get("net_minor", 0),
            }
        )
    campaigns = bounded(
        db.execute(
            select(Campaign.id, Campaign.name).where(Campaign.event_id == event.id).limit(LIMIT + 1)
        )
    )
    names = dict(campaigns)
    by_campaign = []
    for row in rows:
        if row["dimension"] != "campaign":
            continue
        metrics = normalize(row)
        by_campaign.append(
            {
                "campaign_id": row["dimension_id"],
                "name": names.get(row["dimension_id"], "Unattributed"),
                "redemptions": metrics["redemptions"],
                "original_tickets": metrics["original_tickets"],
                "refunded_tickets": metrics["refunded_tickets"],
                "retained_tickets": metrics["issued"],
                "discount_minor": metrics["discount_minor"],
                "revenue_minor": metrics["net_minor"],
                "collected_minor": metrics["collected_minor"],
                "refunds_minor": metrics["refunds_minor"],
                "pending_refunds_minor": metrics["pending_refunds_minor"],
                "fees_minor": metrics["fees_minor"],
            }
        )
    environments = list(
        db.scalars(
            text("""SELECT DISTINCT environment FROM biletflow.payment_intent
                                         WHERE event_id=:event_id AND purpose='ticket_order' ORDER BY environment"""),
            params,
        )
    )
    money_keys = (
        "gross_minor",
        "discount_minor",
        "fulfilled_collected_minor",
        "collected_minor",
        "charged_fees_minor",
        "fee_reversals_minor",
        "fees_minor",
        "refunds_minor",
        "pending_refunds_minor",
        "net_minor",
    )
    return metadata(event, filters) | {
        "inventory": {
            "capacity": capacity,
            "sold": total["sold"],
            "held": held,
            "expired_held": expired,
            "available": available,
            "blocked": sum(row["blocked"] for row in types.values()),
            "refund_pending": total["refund_pending"],
            "sold_percentage": total["sold"] * 100 / capacity if capacity else 0,
        },
        "revenue": {key: total[key] for key in money_keys}
        | {
            "currency": "KZT",
            "environments": environments,
            "simulated": environments == ["simulation"],
        },
        "attendance": {
            "issued": total["issued"],
            "checked_in": total["checked_in"],
            "not_checked_in": total["issued"] - total["checked_in"],
            "not_checked_in_label": "absent" if event.ends_at <= now() else "not_yet_checked_in",
            "percentage": total["checked_in"] * 100 / total["issued"] if total["issued"] else 0,
        },
        "by_ticket_type": by_type,
        "by_campaign": sorted(by_campaign, key=lambda row: str(row["campaign_id"])),
    }


def sales_series(db, event, filters, bucket):
    validate_filters(db, event, filters)
    rows = bounded(
        db.execute(
            text(
                ITEMS
                + """
        SELECT date_trunc(:bucket, confirmed_at, :timezone) AS bucket_start,
               count(*) AS tickets, sum(paid_minor) AS revenue_minor
        FROM items WHERE confirmed_at IS NOT NULL GROUP BY 1 ORDER BY 1 LIMIT 10001
    """
            ),
            filters | {"event_id": event.id, "bucket": bucket, "timezone": event.time_zone},
        ).mappings()
    )
    return metadata(event, filters) | {
        "bucket": bucket,
        "points": [
            {
                "bucket_start": row["bucket_start"].astimezone(ZoneInfo(event.time_zone)),
                "tickets": row["tickets"],
                "revenue_minor": int(row["revenue_minor"]),
            }
            for row in rows
        ],
    }
