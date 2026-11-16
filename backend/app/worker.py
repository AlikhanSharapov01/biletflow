"""Durable email delivery. Run with python -m app.worker."""

import logging
import smtplib
import time
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select

from . import all_models  # noqa: F401
from .attachment_service import scan_attachments_once
from .catalog_models import Invitation
from .catalog_service import organization_guard
from .checkout_expiry import sweep_expired_holds
from .checkout_models import OrderItem, Ticket, TicketOrder
from .config import Settings
from .db import database
from .email_templates import copy
from .event_image_service import reconcile_images
from .ga4_client import GA4Client
from .ga4_service import export_ga4_once
from .malware_scanner import scanner_from_settings
from .models import AccountToken, OutboxJob, User
from .notification_service import deliver_notifications_once
from .observability import bind_correlation, configure_logging, correlated_job, signal, worker_task
from .payments_service import dispatch_refund_once, initialize_once, process_received_once
from .security import challenge_value, now
from .storage import storage_from_settings
from .support_models import SupportCase
from .support_service import case_roles
from .ticket_file_service import ensure_ticket_pdf, reconcile_ticket_pdfs

HOLD_SWEEP_SECONDS = 15
# Touched on every loop; the Compose health check reads its age.
HEARTBEAT_FILE = Path("/tmp/biletflow-worker-heartbeat")


def ticket_message(db, settings, identifier, ticket_id, pdf=None):
    ticket = db.get(Ticket, ticket_id)
    if not ticket or ticket.status != "valid":
        return None
    item = db.get(OrderItem, ticket.order_item_id)
    # Locale follows the mailbox receiving this delivery; lookup never claims a ticket.
    recipient = db.scalar(
        select(User).where(
            User.email == item.recipient_email,
            User.status == "active",
            User.email_verified_at.is_not(None),
        )
    )
    locale = recipient.locale if recipient else None
    event = db.get(TicketOrder, item.order_id).event_snapshot
    zone = ZoneInfo(event["time_zone"])
    starts = datetime.fromisoformat(event["starts_at"]).astimezone(zone)
    seat = item.seat_snapshot
    lines = [
        copy("hello", locale, name=item.recipient_name),
        "",
        copy("ticket_confirmed", locale, title=event["title"]),
        f"{copy('when', locale)}: {starts:%d.%m.%Y %H:%M} ({event['time_zone']})",
        f"{copy('venue', locale)}: {event['venue_name']}, {event['venue_city']}",
        f"{copy('ticket_type', locale)}: {item.ticket_type_name}",
    ]
    if seat:
        lines.append(
            copy(
                "seat",
                locale,
                section=seat["section_label"],
                row=seat["row_label"],
                seat=seat["seat_label"],
            )
        )
    # The QR stays behind sign-in: admission requires the recipient's verified account.
    lines += [
        f"{copy('ticket_id', locale)}: {ticket.id}",
        "",
        copy("ticket_sign_in", locale, email=item.recipient_email),
        f"{settings.frontend_url.rstrip('/')}/tickets/{ticket.id}",
    ]
    if pdf:
        lines += ["", copy("attachment", locale)]
    message = EmailMessage()
    message["From"], message["To"] = settings.email_from, item.recipient_email
    message["Subject"] = copy("ticket_subject", locale, title=event["title"])
    message["Message-ID"] = f"<{identifier}@biletflow.local>"
    message.set_content("\n".join(lines))
    if pdf:
        data, filename = pdf
        message.add_attachment(data, maintype="application", subtype="pdf", filename=filename)
    return message


def support_message(db, settings, identifier, payload):
    # Sent only while the recipient still has a relationship to the case; no message text or
    # subject leaves the system by email.
    user = db.get(User, UUID(payload["recipient_user_id"]))
    case = db.get(SupportCase, UUID(payload["case_id"]))
    if not user or not case or user.status != "active" or user.email_verified_at is None:
        return None
    if not case_roles(db, user, case):
        return None
    reason = payload["reason"]
    subject = copy(
        reason
        if reason in ("case_opened", "message", "status", "assignment", "escalation")
        else "support_update",
        user.locale,
    )
    message = EmailMessage()
    message["From"], message["To"] = settings.email_from, user.email
    message["Subject"] = f"BiletFlow: {subject}"
    message["Message-ID"] = f"<{identifier}@biletflow.local>"
    message.set_content(
        f"{subject}.\n\n{copy('sign_in', user.locale)}:\n{settings.frontend_url.rstrip('/')}/support/cases/{case.id}"
    )
    return message


@correlated_job
def deliver_once(factory, settings, send=None, storage=None):
    with factory.begin() as db:
        job = db.scalar(
            select(OutboxJob)
            .where(
                OutboxJob.kind.in_(
                    [
                        "auth_email",
                        "staff_invite_email",
                        "ticket_delivery_email",
                        "support_email",
                    ]
                ),
                or_(
                    and_(OutboxJob.status == "pending", OutboxJob.available_at <= now()),
                    and_(OutboxJob.status == "leased", OutboxJob.lease_until <= now()),
                ),
            )
            .order_by(OutboxJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not job:
            return False
        bind_correlation(job.correlation_id)
        if job.attempt_count >= 5:
            job.status, job.lease_token, job.lease_until = "dead", None, None
            job.last_error = "delivery_attempts_exhausted"
            job_signal(job)
            return True
        job.status, job.lease_token = "leased", uuid4()
        job.lease_until = now() + timedelta(seconds=120)
        job.attempt_count += 1
        identifier, lease, payload, kind = job.id, job.lease_token, job.payload, job.kind
    try:
        pdf = None
        if kind == "ticket_delivery_email":
            try:
                storage = storage or storage_from_settings(settings)
                pdf = ensure_ticket_pdf(factory, settings, storage, UUID(payload["ticket_id"]))
            except Exception as error:
                # The email still goes out; the ticket link works without the attachment.
                # No exception text is kept: it may echo paths or addresses.
                pdf = None
                signal("job.attachment_failed", job_id=identifier, error_type=type(error).__name__)
        with factory() as db:
            token = (
                db.get(AccountToken, UUID(payload["account_token_id"]))
                if kind == "auth_email"
                else None
            )
            user = db.get(User, token.user_id) if token else None
            message = None
            if (
                token
                and user
                and user.status == "active"
                and token.consumed_at is None
                and token.expires_at > now()
            ):
                value = challenge_value(settings, token.purpose, token.id)
                action = "verify-email" if token.purpose == "email_verify" else "reset-password"
                # Fragment keeps the token out of HTTP request URLs and proxy access logs.
                link = f"{settings.frontend_url.rstrip('/')}/{action}#token={value}"
                message = EmailMessage()
                message["From"], message["To"] = settings.email_from, user.email
                message["Subject"] = (
                    copy("verify", user.locale)
                    if token.purpose == "email_verify"
                    else copy("reset", user.locale)
                )
                message["Message-ID"] = f"<{identifier}@biletflow.local>"
                message.set_content(
                    f"{message['Subject']}\n\n{link}\n\n{copy('expires', user.locale)}: {token.expires_at.isoformat()}\n{copy('ignore', user.locale)}"
                )
            if kind == "staff_invite_email":
                invitation = db.get(Invitation, UUID(payload["invitation_id"]))
                if (
                    invitation
                    and invitation.revoked_at is None
                    and invitation.accepted_at is None
                    and invitation.expires_at > now()
                ):
                    inviter = db.get(User, invitation.invited_by_user_id)
                    from fastapi import HTTPException

                    try:
                        org = organization_guard(
                            db, inviter, invitation.organization_id, "manage_staff"
                        )
                    except HTTPException:
                        org = None
                    if org and inviter.status == "active":
                        recipient = db.scalar(
                            select(User).where(
                                User.email == invitation.email,
                                User.status == "active",
                                User.email_verified_at.is_not(None),
                            )
                        )
                        locale = recipient.locale if recipient else None
                        value = challenge_value(settings, "staff_invite", invitation.id)
                        link = f"{settings.frontend_url.rstrip('/')}/staff-invitations/accept#token={value}"
                        message = EmailMessage()
                        message["From"], message["To"] = settings.email_from, invitation.email
                        message["Subject"] = copy("invitation_subject", locale)
                        message["Message-ID"] = f"<{identifier}@biletflow.local>"
                        message.set_content(
                            f"{copy('invitation', locale, organization=org.name)}\n\n{link}\n\n{copy('expires', locale)}: {invitation.expires_at.isoformat()}"
                        )
            if kind == "support_email":
                message = support_message(db, settings, identifier, payload)
            if kind == "ticket_delivery_email":
                message = ticket_message(db, settings, identifier, UUID(payload["ticket_id"]), pdf)
        if message:
            if send:
                send(message)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                    if settings.smtp_starttls:
                        smtp.starttls()
                    if settings.smtp_username:
                        smtp.login(
                            settings.smtp_username, settings.smtp_password.get_secret_value()
                        )
                    smtp.send_message(message)
        failure = None
    except Exception as error:
        # Do not retain exception text: SMTP/provider errors may echo secrets or addresses.
        failure = type(error).__name__
    with factory.begin() as db:
        job = db.scalar(select(OutboxJob).where(OutboxJob.id == identifier).with_for_update())
        if job.status != "leased" or job.lease_token != lease or job.lease_until <= now():
            signal("job.lease_lost", job_id=identifier, kind=kind)
            return True
        job.lease_token = job.lease_until = None
        if failure:
            job.status = "dead" if job.attempt_count >= 5 else "pending"
            job.available_at = now() + timedelta(seconds=min(300, 2**job.attempt_count))
            job.last_error = "email_delivery_failed"
            job_signal(job, failure)
        else:
            job.status, job.completed_at, job.last_error = "done", now(), None
    return True


def job_signal(job, error_type=None):
    """Safe retry/dead-letter signal: IDs, counts and stored error codes only."""
    fields = {"job_id": job.id, "kind": job.kind, "attempt": job.attempt_count}
    if job.status == "dead":
        signal(
            "job.dead", logging.ERROR, **fields, last_error=job.last_error, error_type=error_type
        )
    else:
        retry = round((job.available_at - now()).total_seconds())
        signal(
            "job.retry_scheduled",
            **fields,
            last_error=job.last_error,
            error_type=error_type,
            retry_in_seconds=retry,
        )


def main():
    configure_logging()
    settings = Settings()
    engine, factory = database(settings.database_url.get_secret_value())
    storage = storage_from_settings(settings)
    ga4 = GA4Client(settings)
    scanner = scanner_from_settings(settings)
    next_sweep = next_ga4 = 0.0
    try:
        while True:
            HEARTBEAT_FILE.touch()
            if time.monotonic() >= next_sweep:
                next_sweep = time.monotonic() + HOLD_SWEEP_SECONDS
                # Each task is logged by type on failure and retried on the next pass.
                with worker_task("hold_sweep"):
                    sweep_expired_holds(factory)  # expiry state lives in the database
                with worker_task("image_reconcile"):
                    reconcile_images(factory, storage)  # durable image schedules
                with worker_task("ticket_pdf_reconcile"):
                    reconcile_ticket_pdfs(factory, storage)  # writes stay scheduled in stored_file
            busy = False  # retried next loop; payment state lives in the database
            with worker_task("payments"):
                busy = (
                    initialize_once(factory)
                    | dispatch_refund_once(factory)
                    | process_received_once(factory, settings)
                )
            # Optional GA4 export runs after payment work, with its own time budget.
            if time.monotonic() >= next_ga4:
                next_ga4 = time.monotonic() + HOLD_SWEEP_SECONDS
                with worker_task("ga4_export"):
                    export_ga4_once(factory, settings, ga4)  # measurements stay pending
            scanned = False  # quarantined files keep their durable scan job
            with worker_task("attachment_scan"):
                scanned = scan_attachments_once(factory, storage, scanner)
            worked = deliver_once(factory, settings, storage=storage)
            if not (deliver_notifications_once(factory, settings) or worked or busy or scanned):
                time.sleep(2)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
