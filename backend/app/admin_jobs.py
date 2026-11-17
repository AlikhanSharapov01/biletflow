"""Admin view of background work and its bounded, audited recovery (#73, BF-15/BF-21).

Outbox jobs are `pending -> leased -> done`, or `dead` once the worker gives up; email
notification deliveries are `pending -> sent` or `failed`. Admins see both, with safe error codes,
attempt counts and allowlisted business identifiers, and may send one exhausted row back to the
worker at most ADMIN_RETRY_LIMIT times. A retry first rechecks the business target: work that
already happened (an email verified, an invitation accepted, a later ticket delivery) and notices
that current state contradicts are refused; the worker still applies its own send checks. SMTP
remains at-least-once: a retry after an uncertain send can deliver a duplicate.
"""

from uuid import UUID

from sqlalchemy import Text, cast, func, or_, select

from .admin_service import admin_audit
from .catalog_models import Event, Invitation
from .checkout_models import Ticket, TicketOrder
from .commerce_models import SalesActivation
from .models import AccountToken, OutboxJob, User
from .notification_models import Notification, NotificationDelivery
from .notification_service import (
    ACCOUNT_NOTICES,
    FANOUT_KIND,
    MAX_ATTEMPTS,
    ORGANIZER_NOTICES,
    PAID_SALES_NOTICES,
    can_receive_email,
    target_of,
)
from .security import fail, now
from .support_models import SupportCase
from .support_service import case_roles

ADMIN_RETRY_LIMIT = 3  # mirrored by CHECK constraints from 0019_admin_retry
# Kinds the worker retries with a bound and marks dead. Payment initialization and refund
# dispatch never exhaust (their state lives in the payment tables), so they have no admin retry.
EMAIL_KINDS = ("auth_email", "staff_invite_email", "ticket_delivery_email", "support_email")
RETRY_KINDS = (*EMAIL_KINDS, FANOUT_KIND)
# Payload keys that are safe business identifiers. Token and invitation ids are challenge inputs,
# so those jobs show the account or organization instead.
CONTEXT_KEYS = (
    "notice",
    "event_id",
    "order_id",
    "ticket_id",
    "case_id",
    "recipient_user_id",
    "user_id",
    "decision_id",
    "change_id",
    "payout_id",
    "refund_id",
    "attempt_id",
    "calendar_sequence",
)
ID_KEYS = tuple(key for key in CONTEXT_KEYS if key.endswith("_id"))


def fetch(db, model, value):
    """Row named by a payload identifier; None for a missing or malformed one."""
    try:
        return db.get(model, UUID(str(value)))
    except ValueError:
        return None


# ---------------------------------------------------------------- views


def job_context(db, job):
    payload = job.payload or {}
    if job.kind == "auth_email":
        token = fetch(db, AccountToken, payload.get("account_token_id"))
        return {"user_id": str(token.user_id), "purpose": token.purpose} if token else {}
    if job.kind == "staff_invite_email":
        invitation = fetch(db, Invitation, payload.get("invitation_id"))
        return {"organization_id": str(invitation.organization_id)} if invitation else {}
    return {key: payload[key] for key in CONTEXT_KEYS if key in payload}


def job_view(db, job):
    bounded = job.kind in RETRY_KINDS
    return {
        "id": job.id,
        "kind": job.kind,
        "status": job.status,
        "attempt_count": job.attempt_count,
        "max_attempts": MAX_ATTEMPTS if bounded else None,
        "admin_retry_count": job.admin_retry_count,
        "last_error": job.last_error,
        "available_at": job.available_at,
        "lease_until": job.lease_until,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
        "event_id": job.event_id,
        "context": job_context(db, job),
        "retryable": bounded and job.status == "dead" and job.admin_retry_count < ADMIN_RETRY_LIMIT,
    }


def job_page(db, limit, offset, status=None, kind=None, event_id=None, linked_id=None):
    query = select(OutboxJob)
    for column, value in (
        (OutboxJob.status, status),
        (OutboxJob.kind, kind),
        (OutboxJob.event_id, event_id),
    ):
        if value is not None:
            query = query.where(column == value)
    if linked_id is not None:
        text_id = str(linked_id)
        tokens = select(cast(AccountToken.id, Text)).where(AccountToken.user_id == linked_id)
        invitations = select(cast(Invitation.id, Text)).where(
            Invitation.organization_id == linked_id
        )
        query = query.where(
            or_(
                OutboxJob.event_id == linked_id,
                *(OutboxJob.payload[key].astext == text_id for key in ID_KEYS),
                OutboxJob.payload["account_token_id"].astext.in_(tokens),
                OutboxJob.payload["invitation_id"].astext.in_(invitations),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(OutboxJob.created_at.desc(), OutboxJob.id).limit(limit).offset(offset)
    )
    return {
        "items": [job_view(db, job) for job in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def delivery_view(db, delivery, notification=None):
    notification = notification or db.get(Notification, delivery.notification_id)
    return {
        "id": delivery.id,
        "notification_id": delivery.notification_id,
        "kind": notification.kind,
        "channel": delivery.channel,
        "status": delivery.status,
        "attempt_count": delivery.attempt_count,
        "max_attempts": MAX_ATTEMPTS if delivery.channel == "email" else None,
        "admin_retry_count": delivery.admin_retry_count,
        "last_error": delivery.last_error,
        "next_attempt_at": delivery.next_attempt_at,
        "sent_at": delivery.sent_at,
        "provider_message_id": delivery.provider_message_id,
        "created_at": delivery.created_at,
        "recipient_user_id": notification.recipient_user_id,
        "event_id": notification.event_id,
        "target": target_of(notification.kind, notification.safe_payload),
        "retryable": delivery.channel == "email"
        and delivery.status == "failed"
        and delivery.admin_retry_count < ADMIN_RETRY_LIMIT,
    }


def delivery_page(db, limit, offset, **filters):
    conditions = [
        column == filters[name]
        for column, name in (
            (NotificationDelivery.status, "status"),
            (NotificationDelivery.channel, "channel"),
            (Notification.kind, "kind"),
            (Notification.recipient_user_id, "recipient_user_id"),
            (Notification.event_id, "event_id"),
            (NotificationDelivery.notification_id, "notification_id"),
        )
        if filters.get(name) is not None
    ]
    joined = Notification.id == NotificationDelivery.notification_id
    total = db.scalar(
        select(func.count(NotificationDelivery.id)).join(Notification, joined).where(*conditions)
    )
    rows = db.execute(
        select(NotificationDelivery, Notification)
        .join(Notification, joined)
        .where(*conditions)
        .order_by(NotificationDelivery.created_at.desc(), NotificationDelivery.id)
        .limit(limit)
        .offset(offset)
    )
    return {
        "items": [delivery_view(db, delivery, notification) for delivery, notification in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------- revalidation


def notice_obsolete(db, notice, data):
    """True when current business state contradicts or supersedes this notice."""
    if notice == "payment_failed":
        # Never tell a buyer to retry an order that has since been paid or has closed.
        order = fetch(db, TicketOrder, data.get("order_id"))
        return not order or order.status != "pending"
    if notice in ACCOUNT_NOTICES:
        if "user_id" not in data:
            return False  # a delivery: can_receive_email already checks the account state
        user = fetch(db, User, data["user_id"])
        wanted = "suspended" if notice == "account_suspended" else "active"
        return not user or user.status != wanted
    if "event_id" not in data:
        return False
    event = fetch(db, Event, data["event_id"])
    if not event:
        return True
    if notice == "event_updated":
        # A later update or a cancellation has its own notice.
        sequence = data.get("calendar_sequence")
        return event.publication_state == "cancelled" or (
            sequence is not None and event.calendar_sequence > int(sequence)
        )
    if notice in ORGANIZER_NOTICES:
        wanted = "suspended" if notice == "event_suspended" else "normal"
        return event.moderation_state != wanted
    if notice in PAID_SALES_NOTICES:
        status = db.scalar(
            select(SalesActivation.status).where(SalesActivation.event_id == event.id)
        )
        return status != ("suspended" if notice == "paid_sales_suspended" else "active")
    return False


def job_blocker(db, job):
    """Why this exhausted job must not run again, or None."""
    payload = job.payload or {}
    if job.kind == "auth_email":
        token = fetch(db, AccountToken, payload.get("account_token_id"))
        if token and token.consumed_at is not None:
            return "already_completed"
        user = db.get(User, token.user_id) if token else None
        if not token or token.expires_at <= now() or not user or user.status != "active":
            return "target_obsolete"
    elif job.kind == "staff_invite_email":
        invitation = fetch(db, Invitation, payload.get("invitation_id"))
        if invitation and invitation.accepted_at is not None:
            return "already_completed"
        if not invitation or invitation.revoked_at is not None or invitation.expires_at <= now():
            return "target_obsolete"
    elif job.kind == "ticket_delivery_email":
        ticket = fetch(db, Ticket, payload.get("ticket_id"))
        if not ticket or ticket.status != "valid":
            return "target_obsolete"
        later = db.scalar(
            select(OutboxJob.id)
            .where(
                OutboxJob.kind == job.kind,
                OutboxJob.payload["ticket_id"].astext == str(ticket.id),
                OutboxJob.id != job.id,
                OutboxJob.created_at > job.created_at,
                OutboxJob.status != "dead",
            )
            .limit(1)
        )
        if later:
            return "already_completed"  # a later delivery or resend was sent or is queued
    elif job.kind == "support_email":
        user = fetch(db, User, payload.get("recipient_user_id"))
        case = fetch(db, SupportCase, payload.get("case_id"))
        if (
            not user
            or not case
            or user.status != "active"
            or user.email_verified_at is None
            or not case_roles(db, user, case)
        ):
            return "target_obsolete"
    elif job.kind == FANOUT_KIND and notice_obsolete(db, payload.get("notice"), payload):
        return "target_obsolete"
    return None


# ---------------------------------------------------------------- retry


def locked(db, model, identifier):
    return db.scalar(
        select(model)
        .where(model.id == identifier)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def retry_job(db, admin, job_id, reason):
    """Send one dead job back to the worker. The row lock serializes concurrent retries."""
    job = locked(db, OutboxJob, job_id)
    if not job:
        fail("job_not_found", 404)
    if job.kind not in RETRY_KINDS:
        fail("retry_not_supported", 409)
    if job.status == "done":
        fail("already_completed", 409)
    if job.status != "dead":
        fail("not_exhausted", 409)  # the worker still owns it
    if job.admin_retry_count >= ADMIN_RETRY_LIMIT:
        fail("retry_limit_reached", 409)
    blocker = job_blocker(db, job)
    if blocker:
        fail(blocker, 409)
    previous = job.attempt_count
    job.status, job.attempt_count, job.available_at = "pending", 0, now()
    job.admin_retry_count += 1
    admin_audit(
        db,
        admin,
        "admin.job_retried",
        "outbox_job",
        job.id,
        event=db.get(Event, job.event_id) if job.event_id else None,
        safe_change={
            "reason": reason,
            "kind": job.kind,
            "previous_status": "dead",
            "previous_attempts": previous,
            "retry_number": job.admin_retry_count,
        },
    )
    return job


def retry_delivery(db, admin, delivery_id, reason):
    delivery = locked(db, NotificationDelivery, delivery_id)
    if not delivery:
        fail("delivery_not_found", 404)
    if delivery.status == "sent":
        fail("already_completed", 409)
    if delivery.channel != "email":
        fail("retry_not_supported", 409)
    if delivery.status != "failed":
        fail("not_exhausted", 409)
    if delivery.admin_retry_count >= ADMIN_RETRY_LIMIT:
        fail("retry_limit_reached", 409)
    notification = db.get(Notification, delivery.notification_id)
    user = db.get(User, notification.recipient_user_id)
    if not can_receive_email(user, notification.kind) or notice_obsolete(
        db, notification.kind, notification.safe_payload
    ):
        fail("target_obsolete", 409)
    previous = delivery.attempt_count
    delivery.status, delivery.attempt_count, delivery.next_attempt_at = "pending", 0, now()
    delivery.admin_retry_count += 1
    admin_audit(
        db,
        admin,
        "admin.notification_delivery_retried",
        "notification_delivery",
        delivery.id,
        event=db.get(Event, notification.event_id) if notification.event_id else None,
        safe_change={
            "reason": reason,
            "kind": notification.kind,
            "channel": delivery.channel,
            "previous_status": "failed",
            "previous_attempts": previous,
            "retry_number": delivery.admin_retry_count,
        },
    )
    return delivery
