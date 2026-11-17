"""BF-15/BF-21 (#73): admin visibility of exhausted jobs and deliveries, and bounded retry."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.models import AccountToken, AuditLog, OutboxJob, User
from app.notification_models import Notification, NotificationDelivery
from app.notification_service import email_once, fanout_once
from app.security import now
from app.worker import deliver_once
from tests.test_admin import admin as admin
from tests.test_admin import code
from tests.test_admission import free_ticket
from tests.test_admission import published as open_event
from tests.test_notifications import buy, drain, edit_title, inbox, published

API = "/api/v1"
ADMIN = API + "/admin"
REASON = {"reason": "SMTP outage resolved"}


def broken(message):
    raise OSError(f"smtp password hunter2 for {message['To']}")


def settle(factory):
    """Mark the fixtures' own emails delivered, so the worker only sees the job under test."""
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.status != "done")
            .values(status="done", completed_at=now(), lease_token=None, lease_until=None)
        )


def register(client, email=None):
    email = email or f"{uuid4().hex}@example.com"
    r = client.post(
        API + "/auth/register",
        json={"email": email, "password": "password long enough", "display_name": "Worker"},
    )
    assert r.status_code == 202, r.text
    return email


def only_job(factory):
    with factory() as db:
        return db.scalar(
            select(OutboxJob)
            .where(OutboxJob.kind == "auth_email")
            .order_by(OutboxJob.created_at.desc())
            .limit(1)
        )


def exhaust_job(factory, settings):
    """Fail the one due auth email until the worker marks it dead."""
    for _ in range(5):
        assert deliver_once(factory, settings, broken)
        with factory.begin() as db:
            db.execute(update(OutboxJob).values(available_at=now() - timedelta(seconds=1)))
    job = only_job(factory)
    assert job.status == "dead" and job.attempt_count == 5
    return job


def retry_job(client, headers, job_id, body=REASON, key=None):
    extra = {"Idempotency-Key": key} if key else {}
    return client.post(ADMIN + f"/jobs/{job_id}/retry", headers=headers | extra, json=body)


def retry_delivery(client, headers, delivery_id, body=REASON):
    return client.post(
        ADMIN + f"/notification-deliveries/{delivery_id}/retry", headers=headers, json=body
    )


def audits(factory, action):
    with factory() as db:
        return list(db.scalars(select(AuditLog).where(AuditLog.action == action)))


def test_job_and_delivery_views_are_admin_only(client, setup, account):
    f = setup()
    _, _, attendee = account()
    calls = [
        ("get", "/jobs", None),
        ("get", f"/jobs/{uuid4()}", None),
        ("post", f"/jobs/{uuid4()}/retry", REASON),
        ("get", "/notification-deliveries", None),
        ("get", f"/notification-deliveries/{uuid4()}", None),
        ("post", f"/notification-deliveries/{uuid4()}/retry", REASON),
    ]
    for method, path, body in calls:
        extra = {"json": body} if body else {}
        assert getattr(client, method)(ADMIN + path, **extra).status_code == 401, path
        for headers in (f["headers"], attendee):
            r = getattr(client, method)(ADMIN + path, headers=headers, **extra)
            assert r.status_code == 403 and code(r) == "admin_required", path


def test_temporary_failure_and_exhaustion_are_visible_with_safe_context(
    client, admin, factory, settings
):
    headers = admin[2]
    settle(factory)
    register(client, "outage@example.com")
    assert deliver_once(factory, settings, broken)
    listed = client.get(ADMIN + "/jobs", headers=headers, params={"kind": "auth_email"})
    assert listed.status_code == 200, listed.text
    pending = listed.json()
    row = next(r for r in pending["items"] if r["status"] == "pending" and r["attempt_count"])
    assert row["attempt_count"] == 1 and row["last_error"] == "email_delivery_failed"
    assert row["max_attempts"] == 5 and row["retryable"] is False
    with factory.begin() as db:
        db.execute(update(OutboxJob).values(available_at=now() - timedelta(seconds=1)))
    for _ in range(4):
        assert deliver_once(factory, settings, broken)
        with factory.begin() as db:
            db.execute(update(OutboxJob).values(available_at=now() - timedelta(seconds=1)))
    dead = client.get(ADMIN + "/jobs", headers=headers, params={"status": "dead"}).json()
    assert dead["total"] == 1, dead
    row = dead["items"][0]
    assert row["kind"] == "auth_email" and row["attempt_count"] == 5
    assert row["retryable"] is True and row["admin_retry_count"] == 0
    with factory() as db:
        user = db.scalar(select(User).where(User.email == "outage@example.com"))
        token = db.scalar(select(AccountToken).where(AccountToken.user_id == user.id))
    # Linked business context names the account, never the token or its challenge input.
    assert row["context"] == {"user_id": str(user.id), "purpose": "email_verify"}
    text = str(client.get(ADMIN + f"/jobs/{row['id']}", headers=headers).json())
    assert str(token.id) not in text and "hunter2" not in text and "outage@" not in text
    linked = client.get(ADMIN + "/jobs", headers=headers, params={"linked_id": str(user.id)})
    assert [r["id"] for r in linked.json()["items"]] == [row["id"]], linked.text
    for status in ("pending", "leased", "done", "dead"):
        listed = client.get(ADMIN + "/jobs", headers=headers, params={"status": status})
        assert listed.status_code == 200, (status, listed.text)
    invalid = client.get(ADMIN + "/jobs", headers=headers, params={"status": "failed"})
    assert invalid.status_code == 422
    assert client.get(ADMIN + f"/jobs/{uuid4()}", headers=headers).status_code == 404


def test_authorized_job_retry_is_audited_bounded_and_idempotent(client, admin, factory, settings):
    headers = admin[2]
    settle(factory)
    register(client)
    job = exhaust_job(factory, settings)
    key = str(uuid4())
    first = retry_job(client, headers, job.id, key=key)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "pending" and body["attempt_count"] == 0
    assert body["admin_retry_count"] == 1
    # Same key, same request: the current view, no second reset or audit row.
    again = retry_job(client, headers, job.id, key=key)
    assert again.status_code == 200 and again.json()["admin_retry_count"] == 1
    changed = retry_job(client, headers, job.id, body={"reason": "Other"}, key=key)
    assert changed.status_code == 409 and code(changed) == "idempotency_key_reused"
    # Without a key, a job the worker owns again is a state conflict.
    busy = retry_job(client, headers, job.id)
    assert busy.status_code == 409 and code(busy) == "not_exhausted"
    [audit] = audits(factory, "admin.job_retried")
    assert audit.entity_type == "outbox_job" and audit.entity_id == job.id
    assert audit.safe_change == {
        "reason": "SMTP outage resolved",
        "kind": "auth_email",
        "previous_status": "dead",
        "previous_attempts": 5,
        "retry_number": 1,
    }
    sent = []
    assert deliver_once(factory, settings, sent.append)
    assert len(sent) == 1 and only_job(factory).status == "done"
    done = retry_job(client, headers, job.id)
    assert done.status_code == 409 and code(done) == "already_completed"
    # The bound is enforced by the database as well as the service.
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.id == job.id)
            .values(status="dead", completed_at=None, admin_retry_count=3)
        )
    limited = retry_job(client, headers, job.id)
    assert limited.status_code == 409 and code(limited) == "retry_limit_reached"
    assert len(audits(factory, "admin.job_retried")) == 1
    for bad in ({}, {"reason": ""}, {"reason": "x" * 501}):
        assert retry_job(client, headers, job.id, body=bad).status_code == 422
    assert retry_job(client, headers, uuid4()).status_code == 404


def test_concurrent_job_retries_reset_once(client, admin, factory, settings, app):
    headers = admin[2]
    settle(factory)
    register(client)
    job = exhaust_job(factory, settings)

    def send(_):
        with TestClient(app) as local:
            return local.post(ADMIN + f"/jobs/{job.id}/retry", headers=headers, json=REASON)

    with ThreadPoolExecutor(4) as pool:
        responses = list(pool.map(send, range(4)))
    assert sorted(r.status_code for r in responses) == [200, 409, 409, 409]
    assert only_job(factory).admin_retry_count == 1
    assert len(audits(factory, "admin.job_retried")) == 1


def test_retry_revalidates_target_and_rejects_completed_work(client, admin, factory, settings):
    headers = admin[2]
    settle(factory)
    register(client)
    job = exhaust_job(factory, settings)
    token = AccountToken.id == UUID(job.payload["account_token_id"])
    # account_token_expiry requires expires_at > created_at, so age the token as a whole.
    with factory.begin() as db:
        db.execute(
            update(AccountToken)
            .where(token)
            .values(created_at=now() - timedelta(days=2), expires_at=now() - timedelta(minutes=1))
        )
    expired = retry_job(client, headers, job.id)
    assert expired.status_code == 409 and code(expired) == "target_obsolete", expired.text
    with factory.begin() as db:
        db.execute(
            update(AccountToken)
            .where(token)
            .values(expires_at=now() + timedelta(hours=1), consumed_at=now())
        )
    consumed = retry_job(client, headers, job.id)
    assert consumed.status_code == 409 and code(consumed) == "already_completed", consumed.text
    assert only_job(factory).status == "dead" and not audits(factory, "admin.job_retried")
    # Work that never exhausts (payment steps) has no admin retry.
    with factory.begin() as db:
        other = OutboxJob(
            kind="payment_initialize",
            deduplication_key=f"payment-initialize:{uuid4()}",
            payload={"version": 1, "attempt_id": str(uuid4())},
            status="dead",
        )
        db.add(other)
        db.flush()
        other_id = other.id
    unsupported = retry_job(client, headers, other_id)
    assert unsupported.status_code == 409, unsupported.text
    assert code(unsupported) == "retry_not_supported"


def test_ticket_delivery_retry_is_superseded_by_a_later_delivery(
    client, setup, account, admin, factory
):
    headers = admin[2]
    f = open_event(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    with factory.begin() as db:
        original = db.scalar(select(OutboxJob).where(OutboxJob.kind == "ticket_delivery_email"))
        original.status, original.attempt_count = "dead", 5
        original.last_error = "email_delivery_failed"
        original.created_at = now() - timedelta(hours=1)
        original_id = original.id
        db.add(
            OutboxJob(
                event_id=original.event_id,
                kind="ticket_delivery_email",
                deduplication_key=f"ticket-delivery:{ticket['id']}:resend:1",
                payload=dict(original.payload),
                status="done",
                attempt_count=1,
                completed_at=now(),
            )
        )
    view = client.get(ADMIN + f"/jobs/{original_id}", headers=headers).json()
    assert view["context"]["ticket_id"] == ticket["id"]
    r = retry_job(client, headers, original_id)
    assert r.status_code == 409 and code(r) == "already_completed"


def failed_delivery(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    edit_title(client, f)
    assert fanout_once(factory)
    for _ in range(5):
        assert email_once(factory, settings, broken)
        with factory.begin() as db:
            db.execute(
                update(NotificationDelivery)
                .where(NotificationDelivery.status == "pending")
                .values(next_attempt_at=now())
            )
    with factory() as db:
        delivery = db.scalar(
            select(NotificationDelivery).where(NotificationDelivery.channel == "email")
        )
    assert delivery.status == "failed" and delivery.attempt_count == 5
    return f, email, holder, delivery


def test_failed_delivery_is_visible_and_recovers_after_authorized_retry(
    client, setup, account, admin, factory, settings
):
    headers = admin[2]
    f, email, holder, delivery = failed_delivery(client, setup, account, factory, settings)
    page = client.get(
        ADMIN + "/notification-deliveries", headers=headers, params={"status": "failed"}
    ).json()
    assert page["total"] == 1
    row = page["items"][0]
    assert row["id"] == str(delivery.id) and row["kind"] == "event_updated"
    assert row["channel"] == "email" and row["last_error"] == "email_delivery_failed"
    assert row["target"] == {"type": "event", "id": f["event"]["id"]}
    assert row["retryable"] is True and email not in str(row)
    sent_rows = client.get(
        ADMIN + "/notification-deliveries",
        headers=headers,
        params={"status": "sent", "channel": "in_app", "kind": "event_updated"},
    ).json()
    assert sent_rows["total"] == 1
    in_app = sent_rows["items"][0]
    refused = retry_delivery(client, headers, in_app["id"])
    assert refused.status_code == 409 and code(refused) == "already_completed"
    r = retry_delivery(client, headers, delivery.id)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and r.json()["attempt_count"] == 0
    assert r.json()["admin_retry_count"] == 1
    sent = []
    assert email_once(factory, settings, sent.append)
    assert [m["To"] for m in sent] == [email]
    again = retry_delivery(client, headers, delivery.id)
    assert again.status_code == 409 and code(again) == "already_completed"
    [audit] = audits(factory, "admin.notification_delivery_retried")
    assert audit.entity_id == delivery.id and audit.safe_change["kind"] == "event_updated"
    # Exactly one inbox row: retrying email never duplicates the in-app notice.
    assert len([n for n in inbox(client, holder) if n["kind"] == "event_updated"]) == 1


def test_obsolete_notifications_are_not_resent(client, setup, account, admin, factory, settings):
    headers = admin[2]
    f, email, holder, delivery = failed_delivery(client, setup, account, factory, settings)
    # A newer update supersedes the stale notice.
    edit_title(client, f, "Renamed again")
    stale = retry_delivery(client, headers, delivery.id)
    assert stale.status_code == 409 and code(stale) == "target_obsolete"
    with factory.begin() as db:
        db.execute(update(User).where(User.email == email).values(status="suspended"))
    gone = retry_delivery(client, headers, delivery.id)
    assert gone.status_code == 409 and code(gone) == "target_obsolete"
    with factory() as db:
        assert db.get(NotificationDelivery, delivery.id).status == "failed"
    assert not audits(factory, "admin.notification_delivery_retried")


def test_dead_fanout_retry_creates_the_notice_once(
    client, setup, account, admin, factory, settings
):
    headers = admin[2]
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    edit_title(client, f)
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "notification_fanout", OutboxJob.status == "pending")
            .values(status="dead", attempt_count=5, last_error="notification_fanout_exhausted")
        )
        job_id = db.scalar(select(OutboxJob.id).where(OutboxJob.status == "dead"))
    row = client.get(ADMIN + f"/jobs/{job_id}", headers=headers).json()
    assert row["context"]["notice"] == "event_updated"
    assert row["context"]["event_id"] == f["event"]["id"]
    assert retry_job(client, headers, job_id).status_code == 200
    drain(factory, settings)
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(Notification.id)).where(Notification.kind == "event_updated")
            )
            == 1
        )
        assert db.get(OutboxJob, job_id).status == "done"
    assert len([n for n in inbox(client, holder) if n["kind"] == "event_updated"]) == 1
