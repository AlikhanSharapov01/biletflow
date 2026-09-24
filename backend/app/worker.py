"""Durable auth email delivery. Run with python -m app.worker."""

import smtplib
import time
from datetime import timedelta
from email.message import EmailMessage
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select

from .catalog_models import Invitation
from .catalog_service import organization_guard
from .config import Settings
from .db import database
from .models import AccountToken, OutboxJob, User
from .security import challenge_value, now


def deliver_once(factory, settings, send=None):
    with factory.begin() as db:
        job = db.scalar(
            select(OutboxJob)
            .where(
                OutboxJob.kind.in_(["auth_email", "staff_invite_email"]),
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
        if job.attempt_count >= 5:
            job.status, job.lease_token, job.lease_until = "dead", None, None
            job.last_error = "delivery_attempts_exhausted"
            return True
        job.status, job.lease_token = "leased", uuid4()
        job.lease_until = now() + timedelta(seconds=120)
        job.attempt_count += 1
        identifier, lease, payload, kind = job.id, job.lease_token, job.payload, job.kind
    try:
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
                    "Verify your BiletFlow email"
                    if token.purpose == "email_verify"
                    else "Reset your BiletFlow password"
                )
                message["Message-ID"] = f"<{identifier}@biletflow.local>"
                message.set_content(
                    f"{message['Subject']}\n\n{link}\n\nExpires: {token.expires_at.isoformat()}\nIf you did not request this, ignore this email."
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
                        value = challenge_value(settings, "staff_invite", invitation.id)
                        link = f"{settings.frontend_url.rstrip('/')}/staff-invitations/accept#token={value}"
                        message = EmailMessage()
                        message["From"], message["To"] = settings.email_from, invitation.email
                        message["Subject"] = "BiletFlow organizer invitation"
                        message["Message-ID"] = f"<{identifier}@biletflow.local>"
                        message.set_content(
                            f"You are invited to join {org.name}. Sign in with this email to accept.\n\n{link}\n\nExpires: {invitation.expires_at.isoformat()}"
                        )
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
        failure = False
    except Exception:
        # Do not retain exception text: SMTP/provider errors may echo secrets or addresses.
        failure = True
    with factory.begin() as db:
        job = db.scalar(select(OutboxJob).where(OutboxJob.id == identifier).with_for_update())
        if job.status != "leased" or job.lease_token != lease or job.lease_until <= now():
            return True
        job.lease_token = job.lease_until = None
        if failure:
            job.status = "dead" if job.attempt_count >= 5 else "pending"
            job.available_at = now() + timedelta(seconds=min(300, 2**job.attempt_count))
            job.last_error = "email_delivery_failed"
        else:
            job.status, job.completed_at, job.last_error = "done", now(), None
    return True


def main():
    settings = Settings()
    engine, factory = database(settings.database_url.get_secret_value())
    try:
        while True:
            if not deliver_once(factory, settings):
                time.sleep(2)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
