"""Organizer check-in history, its CSV export and the attendee's own admission status (BF-20)."""

import csv
import io
from datetime import UTC

from sqlalchemy import func, select
from sqlalchemy.orm import aliased

from .admin_service import csv_cell
from .admission_models import CheckIn, CheckInReversal
from .admission_service import current_check_in
from .catalog_models import Event
from .catalog_service import catalog_audit
from .checkout_models import OrderItem, Ticket
from .entry_service import like_escape
from .models import User
from .offline_models import ScannerDevice
from .security import fail

EXPORT_LIMIT = 10_000
CSV_BOM = "﻿"
CSV_COLUMNS = (
    "check_in_id",
    "ticket_id",
    "attendee_name",
    "ticket_type",
    "seat",
    "source",
    "accepted_at",
    "captured_at",
    "scanner",
    "device",
    "reversed_at",
    "reversal_reason",
    "reversed_by",
)

Scanner = aliased(User)
Actor = aliased(User)


def as_aware(value):
    """A bound without an offset is read as UTC so it compares with stored timestamps."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def seat_label(snapshot):
    if not snapshot:
        return ""
    parts = (snapshot.get(key) for key in ("section_label", "row_label", "seat_label"))
    return "-".join(part for part in parts if part)


def history_query(event, from_=None, to=None, source=None, state=None, ticket_type_id=None, q=None):
    """Check-ins of one event with everything a row shows, in a deterministic order."""
    if from_ and to and to < from_:
        fail("invalid_range", 422)
    query = (
        select(
            CheckIn,
            OrderItem,
            Scanner.display_name.label("scanner_name"),
            ScannerDevice.label.label("device_label"),
            CheckInReversal.reason.label("reversal_reason"),
            CheckInReversal.created_at.label("reversal_created_at"),
            CheckInReversal.actor_user_id.label("actor_id"),
            Actor.display_name.label("actor_name"),
        )
        .join(Ticket, Ticket.id == CheckIn.ticket_id)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .join(Scanner, Scanner.id == CheckIn.scanner_user_id)
        .outerjoin(ScannerDevice, ScannerDevice.id == CheckIn.device_id)
        .outerjoin(CheckInReversal, CheckInReversal.check_in_id == CheckIn.id)
        .outerjoin(Actor, Actor.id == CheckInReversal.actor_user_id)
        .where(CheckIn.event_id == event.id)
    )
    if from_:
        query = query.where(CheckIn.accepted_at >= from_)
    if to:
        query = query.where(CheckIn.accepted_at <= to)
    if source:
        query = query.where(CheckIn.source == source)
    if state == "current":
        query = query.where(CheckIn.reversed_at.is_(None))
    elif state == "reversed":
        query = query.where(CheckIn.reversed_at.is_not(None))
    if ticket_type_id:
        query = query.where(OrderItem.ticket_type_id == ticket_type_id)
    needle = (q or "").strip()
    if needle:
        query = query.where(OrderItem.recipient_name.ilike(f"%{like_escape(needle)}%", escape="\\"))
    return query


def ordered(query):
    return query.order_by(CheckIn.accepted_at, CheckIn.id)


def history_total(db, query):
    return db.scalar(query.with_only_columns(func.count(CheckIn.id)))


def history_item(row):
    check_in, item = row.CheckIn, row.OrderItem
    return {
        "check_in_id": check_in.id,
        "ticket_id": check_in.ticket_id,
        "attendee_name": item.recipient_name,
        "ticket_type_name": item.ticket_type_name,
        "seat": item.seat_snapshot,
        "source": check_in.source,
        "accepted_at": check_in.accepted_at,
        "captured_at": check_in.captured_at,
        "scanner": {"id": check_in.scanner_user_id, "display_name": row.scanner_name},
        "device_label": row.device_label,
        "operation_id": check_in.operation_id,
        "reversed_at": check_in.reversed_at,
        "reversal": (
            {
                "reason": row.reversal_reason,
                "actor": {"id": row.actor_id, "display_name": row.actor_name},
                "created_at": row.reversal_created_at,
            }
            if row.actor_id
            else None
        ),
    }


def history_page(db, event, limit, offset, **filters):
    query = history_query(event, **filters)
    rows = db.execute(ordered(query).limit(limit).offset(offset))
    return {
        "items": [history_item(row) for row in rows],
        "total": history_total(db, query),
        "limit": limit,
        "offset": offset,
    }


def history_csv(db, user, org, event, **filters):
    """The whole filtered log as CSV text; refused beyond EXPORT_LIMIT rows. Audited."""
    query = history_query(event, **filters)
    if history_total(db, query) > EXPORT_LIMIT:
        fail("export_too_large", 413)
    out = io.StringIO()
    out.write(CSV_BOM)
    writer = csv.writer(out, lineterminator="\r\n", quoting=csv.QUOTE_ALL)
    writer.writerow(CSV_COLUMNS)
    for row in db.execute(ordered(query)):
        item = history_item(row)
        reversal = item["reversal"]
        writer.writerow(
            [
                csv_cell(value)
                for value in (
                    item["check_in_id"],
                    item["ticket_id"],
                    item["attendee_name"],
                    item["ticket_type_name"],
                    seat_label(item["seat"]),
                    item["source"],
                    item["accepted_at"],
                    item["captured_at"],
                    item["scanner"]["display_name"],
                    item["device_label"],
                    item["reversed_at"],
                    reversal and reversal["reason"],
                    reversal and reversal["actor"]["display_name"],
                )
            ]
        )
    catalog_audit(db, user, "admission.history_exported", org, event, event)
    return out.getvalue()


def ticket_admission(db, ticket):
    """What the attendee sees: admitted now, or (when not) when an earlier admission was undone."""
    event = db.get(Event, ticket.event_id)
    current = current_check_in(db, ticket.id)
    reversed_at = None
    if not current:
        reversed_at = db.scalar(
            select(CheckIn.reversed_at)
            .where(CheckIn.ticket_id == ticket.id, CheckIn.reversed_at.is_not(None))
            .order_by(CheckIn.reversed_at.desc())
            .limit(1)
        )
    return {
        "ticket_id": ticket.id,
        "status": ticket.status,
        "checked_in_at": current.accepted_at if current else None,
        "reversed_at": reversed_at,
        "admission_window": {
            "opens_at": event.admission_opens_at,
            "closes_at": event.admission_closes_at,
        },
    }
