import csv
import io
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import case, func, literal, or_, select, text

from .admin_models import EventReport, ModerationAction, PlatformAdmin, SettingVersion
from .admin_schemas import SETTINGS
from .catalog_models import Event, Organization
from .catalog_service import catalog_audit, changed, event_guard
from .checkout_models import OrderItem, Ticket, TicketOrder
from .models import AuditLog, User
from .security import fail, now
from .service import locked_user, revoke_all, valid_session

REPORT_LIMIT = 5  # new (non-duplicate) reports per account per window
REPORT_WINDOW = timedelta(hours=1)
EXPORT_MAX_ROWS = 5000
MAX_FUTURE_SETTING = timedelta(days=365)


# ---------------------------------------------------------------- authorization and audit


def admin_guard(db, ids):
    """Valid verified session AND a current platform-admin grant; anything else is 403."""
    user, _ = valid_session(db, *ids)
    grant = db.scalar(
        select(PlatformAdmin.id).where(
            PlatformAdmin.user_id == user.id, PlatformAdmin.revoked_at.is_(None)
        )
    )
    if not grant:
        fail("admin_required", 403)
    return user


def admin_audit(db, admin, action, entity_type, entity_id, event=None, safe_change=None):
    db.add(
        AuditLog(
            actor_user_id=admin.id,
            organization_id=event.organization_id if event else None,
            event_id=event.id if event else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=action,
            safe_change=safe_change or {},
            correlation_id=uuid4(),
        )
    )


# ---------------------------------------------------------------- search and export


def like(value):
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def as_uuid(value):
    try:
        return UUID(value)
    except (ValueError, AttributeError):
        return None


def users_query(q=None, status=None, **_):
    admin_flag = (
        select(literal(True))
        .where(PlatformAdmin.user_id == User.id, PlatformAdmin.revoked_at.is_(None))
        .exists()
    )
    query = select(
        User.id,
        User.email,
        User.display_name,
        User.status,
        User.email_verified_at,
        User.created_at,
        admin_flag.label("is_platform_admin"),
    )
    if q:
        parts = [
            User.email.ilike(like(q), escape="\\"),
            User.display_name.ilike(like(q), escape="\\"),
        ]
        if as_uuid(q):
            parts.append(User.id == as_uuid(q))
        query = query.where(or_(*parts))
    if status:
        query = query.where(User.status == status)
    return query, (User.created_at.desc(), User.id)


def events_query(q=None, moderation_state=None, publication_state=None, organization_id=None, **_):
    query = select(
        Event.id,
        Event.organization_id,
        Event.title,
        Event.publication_state,
        Event.moderation_state,
        Event.visibility,
        Event.starts_at,
        Event.capacity,
        Event.created_at,
    )
    if q:
        parts = [Event.title.ilike(like(q), escape="\\")]
        if as_uuid(q):
            parts += [Event.id == as_uuid(q), Event.organization_id == as_uuid(q)]
        query = query.where(or_(*parts))
    if moderation_state:
        query = query.where(Event.moderation_state == moderation_state)
    if publication_state:
        query = query.where(Event.publication_state == publication_state)
    if organization_id:
        query = query.where(Event.organization_id == organization_id)
    return query, (Event.created_at.desc(), Event.id)


def orders_query(q=None, status=None, event_id=None, buyer_user_id=None, **_):
    query = select(
        TicketOrder.id,
        TicketOrder.event_id,
        TicketOrder.buyer_user_id,
        User.email.label("buyer_email"),
        TicketOrder.status,
        TicketOrder.gross_minor,
        TicketOrder.discount_minor,
        TicketOrder.payable_minor,
        TicketOrder.processing_fee_minor,
        TicketOrder.created_at,
        TicketOrder.confirmed_at,
    ).join(User, User.id == TicketOrder.buyer_user_id)
    if q:
        parts = [User.email.ilike(like(q), escape="\\")]
        if as_uuid(q):
            parts += [TicketOrder.id == as_uuid(q), TicketOrder.buyer_user_id == as_uuid(q)]
        query = query.where(or_(*parts))
    for column, value in (
        (TicketOrder.status, status),
        (TicketOrder.event_id, event_id),
        (TicketOrder.buyer_user_id, buyer_user_id),
    ):
        if value:
            query = query.where(column == value)
    return query, (TicketOrder.created_at.desc(), TicketOrder.id)


def tickets_query(q=None, status=None, event_id=None, order_id=None, **_):
    query = (
        select(
            Ticket.id,
            Ticket.event_id,
            OrderItem.order_id,
            OrderItem.ticket_type_name,
            OrderItem.recipient_email,
            Ticket.status,
            case((Ticket.recipient_user_id.is_not(None), True), else_=False).label("claimed"),
            Ticket.issued_at,
        )
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .join(TicketOrder, TicketOrder.id == OrderItem.order_id)
    )
    if q:
        parts = [OrderItem.recipient_email.ilike(like(q), escape="\\")]
        if as_uuid(q):
            parts += [Ticket.id == as_uuid(q), OrderItem.order_id == as_uuid(q)]
        query = query.where(or_(*parts))
    for column, value in (
        (Ticket.status, status),
        (Ticket.event_id, event_id),
        (OrderItem.order_id, order_id),
    ):
        if value:
            query = query.where(column == value)
    return query, (Ticket.issued_at.desc(), Ticket.id)


SEARCHES = {
    "users": users_query,
    "events": events_query,
    "orders": orders_query,
    "tickets": tickets_query,
}


def search_page(db, kind, limit, offset, **filters):
    query, order = SEARCHES[kind](**filters)
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = db.execute(query.order_by(*order).limit(limit).offset(offset)).mappings().all()
    return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}


def csv_cell(value):
    """Neutralize spreadsheet formulas: a leading = + - @ tab or CR makes the cell literal text."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        value = value.isoformat()
    text_value = str(value)
    if text_value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text_value
    return text_value


def export_csv(db, kind, limit, **filters):
    query, order = SEARCHES[kind](**filters)
    result = db.execute(query.order_by(*order).limit(limit))
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(result.keys())
    for row in result:
        writer.writerow([csv_cell(value) for value in row])
    return out.getvalue()


# ---------------------------------------------------------------- moderation


def moderate_user(db, admin, user_id, suspend, reason):
    target = locked_user(db, user_id)
    if not target:
        fail("user_not_found", 404)
    if suspend:
        is_admin = db.scalar(
            select(PlatformAdmin.id).where(
                PlatformAdmin.user_id == target.id, PlatformAdmin.revoked_at.is_(None)
            )
        )
        if is_admin:
            fail("admin_cannot_be_suspended", 409)
    expected = "active" if suspend else "suspended"
    if target.status != expected:
        fail("user_already_suspended" if suspend else "user_not_suspended", 409)
    target.status = "suspended" if suspend else "active"
    target.updated_at = now()
    if suspend:
        revoke_all(db, target)
    action = ModerationAction(
        actor_user_id=admin.id,
        target_user_id=target.id,
        action="suspend" if suspend else "reinstate",
        reason=reason,
    )
    db.add(action)
    db.flush()
    admin_audit(
        db,
        admin,
        "admin.user_suspended" if suspend else "admin.user_reinstated",
        "app_user",
        target.id,
        safe_change={"reason": reason, "moderation_action_id": str(action.id)},
    )
    return action


def moderate_event(db, admin, event_id, suspend, reason):
    event = db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not event:
        fail("event_not_found", 404)
    expected = "normal" if suspend else "suspended"
    if event.moderation_state != expected:
        fail("event_already_suspended" if suspend else "event_not_suspended", 409)
    event.moderation_state = "suspended" if suspend else "normal"
    changed(event)  # bumps availability_version so clients refresh
    action = ModerationAction(
        actor_user_id=admin.id,
        target_event_id=event.id,
        action="suspend" if suspend else "reinstate",
        reason=reason,
    )
    db.add(action)
    db.flush()
    admin_audit(
        db,
        admin,
        "admin.event_suspended" if suspend else "admin.event_reinstated",
        "event",
        event.id,
        event=event,
        safe_change={"reason": reason, "moderation_action_id": str(action.id)},
    )
    return action


# ---------------------------------------------------------------- reports


def submit_report(db, user, event_id, data):
    """The caller's user row is already locked, which serializes this reporter's submissions."""
    event = event_guard(db, user, event_id)
    live = db.scalar(
        select(EventReport).where(
            EventReport.event_id == event.id,
            EventReport.reporter_user_id == user.id,
            EventReport.category == data.category,
            EventReport.status.in_(["open", "reviewing"]),
        )
    )
    if live:
        return live, True
    recent = db.scalar(
        select(func.count(EventReport.id)).where(
            EventReport.reporter_user_id == user.id,
            EventReport.created_at > func.clock_timestamp() - REPORT_WINDOW,
        )
    )
    if recent >= REPORT_LIMIT:
        raise HTTPException(
            429,
            detail={"code": "report_rate_limited"},
            headers={"Retry-After": str(int(REPORT_WINDOW.total_seconds()))},
        )
    report = EventReport(
        event_id=event.id,
        reporter_user_id=user.id,
        category=data.category,
        description=data.description,
    )
    db.add(report)
    db.flush()
    db.refresh(report)
    catalog_audit(
        db, user, "report.created", db.get(Organization, event.organization_id), event, report
    )
    return report, False


def locked_report(db, report_id):
    report = db.scalar(
        select(EventReport)
        .where(EventReport.id == report_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not report:
        fail("report_not_found", 404)
    return report


def review_report(db, admin, report_id):
    report = locked_report(db, report_id)
    if report.status != "open":
        fail("report_not_open", 409)
    report.status, report.reviewed_by_user_id, report.reviewed_at = "reviewing", admin.id, now()
    event = db.get(Event, report.event_id)
    admin_audit(db, admin, "admin.report_reviewing", "event_report", report.id, event=event)
    return report


def resolve_report(db, admin, report_id, resolution):
    report = locked_report(db, report_id)
    if report.status == "resolved":
        fail("report_already_resolved", 409)
    report.status, report.resolution = "resolved", resolution
    report.resolved_by_user_id, report.resolved_at = admin.id, now()
    event = db.get(Event, report.event_id)
    admin_audit(db, admin, "admin.report_resolved", "event_report", report.id, event=event)
    return report


def report_page(db, limit, offset, status=None, event_id=None):
    conditions = []
    if status:
        conditions.append(EventReport.status == status)
    if event_id:
        conditions.append(EventReport.event_id == event_id)
    total = db.scalar(select(func.count(EventReport.id)).where(*conditions))
    rows = db.scalars(
        select(EventReport)
        .where(*conditions)
        .order_by(EventReport.created_at, EventReport.id)
        .limit(limit)
        .offset(offset)
    )
    return {"items": list(rows), "total": total, "limit": limit, "offset": offset}


# ---------------------------------------------------------------- platform settings


def effective_setting(db, key, at=None):
    """Value in force at `at` (default now). Other modules call this when they start a new
    hold, quote or activation; stored orders and activations keep their own snapshots."""
    row = db.scalar(
        select(SettingVersion.value)
        .where(SettingVersion.setting_key == key, SettingVersion.effective_at <= (at or now()))
        .order_by(SettingVersion.version.desc())
        .limit(1)
    )
    return SETTINGS[key][0] if row is None else row


def setting_view(db, key):
    default, minimum, maximum, description = SETTINGS[key]
    current = now()
    active = db.scalar(
        select(SettingVersion)
        .where(SettingVersion.setting_key == key, SettingVersion.effective_at <= current)
        .order_by(SettingVersion.version.desc())
        .limit(1)
    )
    pending = db.scalar(
        select(SettingVersion)
        .where(SettingVersion.setting_key == key, SettingVersion.effective_at > current)
        .order_by(SettingVersion.version.desc())
        .limit(1)
    )
    return {
        "key": key,
        "description": description,
        "value": default if active is None else active.value,
        "version": 0 if active is None else active.version,
        "effective_at": None if active is None else active.effective_at,
        "default": default,
        "minimum": minimum,
        "maximum": maximum,
        "pending": None
        if pending is None
        else {
            "version": pending.version,
            "value": pending.value,
            "effective_at": pending.effective_at.isoformat(),
        },
    }


def change_setting(db, admin, key, data):
    default, minimum, maximum, _ = SETTINGS[key]
    if not minimum <= data.value <= maximum:
        fail("setting_out_of_range", 422)
    current = now()
    effective = data.effective_at or current
    if effective.tzinfo is None:
        fail("invalid_effective_at", 422)
    if effective < current - timedelta(seconds=5) or effective > current + MAX_FUTURE_SETTING:
        # Settings are prospective: history is never backdated.
        fail("invalid_effective_at", 422)
    effective = max(effective, current)
    # Serializes version assignment per key across API workers.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 3))"), {"key": "setting:" + key}
    )
    latest = db.scalar(
        select(func.coalesce(func.max(SettingVersion.version), 0)).where(
            SettingVersion.setting_key == key
        )
    )
    if latest != data.expected_version:
        fail("setting_version_conflict", 409)
    row = SettingVersion(
        setting_key=key,
        version=latest + 1,
        value=data.value,
        effective_at=effective,
        actor_user_id=admin.id,
        reason=data.reason,
    )
    db.add(row)
    db.flush()
    admin_audit(
        db,
        admin,
        "admin.setting_changed",
        "platform_setting_version",
        row.id,
        safe_change={
            "key": key,
            "version": row.version,
            "value": data.value,
            "effective_at": effective.isoformat(),
            "reason": data.reason,
        },
    )
    return row
