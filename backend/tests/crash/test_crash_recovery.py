"""Real process-kill recovery at side-effect boundaries (AC-26; BF-08, BF-15, BF-22).

Each scenario runs the real worker loop (`app.worker.main`) or the real API (uvicorn +
`create_app`) as a child process, kills it at one boundary (os._exit(137), or SIGSTOP followed by
a lease takeover), restarts a fresh process and checks the database, private storage and SMTP
sink. Lease expiry is simulated by moving the persisted lease time into the past instead of
waiting the 120-second production lease.

Business results (orders, tickets, refunds, finance rows, stored files, notifications) must never
be duplicated. Email is at-least-once: a crash between SMTP acceptance and the database
acknowledgement may deliver the same Message-ID twice, which the tests detect and allow.
"""

import hashlib
import os
import signal
import sys
from datetime import timedelta
from pathlib import Path
from uuid import UUID

import httpx
import pytest
from crash_harness import KILLED, Harness, SmtpSink, wait_until
from sqlalchemy import func, select, update
from test_paid_orders import buyer_order, paid_event, pay

from app.catalog_models import Allocation
from app.checkout_models import Ticket, TicketOrder
from app.commerce_models import PaymentAttempt, ProviderEvent, Refund, RefundAttempt
from app.file_models import StoredFile
from app.finance_models import FinanceEntry
from app.models import AuditLog, OutboxJob
from app.notification_models import Notification, NotificationDelivery
from app.notification_service import deliver_notifications_once
from app.payments_service import dispatch_refund_once, initialize_once, process_received_once
from app.security import now
from app.worker import deliver_once

pytestmark = [
    pytest.mark.crash,
    # SIGSTOP/SIGCONT and `ps` process states are POSIX-only.
    pytest.mark.skipif(sys.platform == "win32", reason="process-kill harness needs POSIX"),
    pytest.mark.skipif(
        os.environ.get("RUN_CRASH_TESTS") != "1",
        reason="process-kill harness is opt-in: set RUN_CRASH_TESTS=1",
    ),
]

API = "/api/v1"


@pytest.fixture
def smtp_sink():
    sink = SmtpSink()
    yield sink
    sink.close()


@pytest.fixture
def harness(app, settings, smtp_sink, tmp_path):
    """Child processes share the test database, private storage root and SMTP sink.

    Depends on `app`, so the database is truncated before any child starts; every child is
    killed at teardown, including one left stopped by a scenario.
    """
    runner = Harness(
        tmp_path / "processes",
        settings.database_url.get_secret_value(),
        settings.storage_root,
        smtp_sink.port,
    )
    yield runner
    runner.cleanup()


# --------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------


def drain(factory, settings):
    """Finish setup work (verification mail, activation payment) in-process before a scenario."""
    discarded = []
    while (
        initialize_once(factory)
        | dispatch_refund_once(factory)
        | process_received_once(factory, settings)
        | deliver_once(factory, settings, discarded.append)
        | deliver_notifications_once(factory, settings, discarded.append)
    ):
        pass


def ready_order(client, setup, account, factory, settings, quantity=1):
    """A pending paid order whose payment attempt is initialized; the outbox is empty."""
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f, quantity=quantity)
    drain(factory, settings)
    return f, order, headers


def settled(factory):
    """Nothing left for a worker: no due or leased job, pending email or unapplied inbox row."""
    with factory() as db:
        jobs = db.scalar(
            select(func.count(OutboxJob.id)).where(OutboxJob.status.in_(("pending", "leased")))
        )
        mail = db.scalar(
            select(func.count(NotificationDelivery.id)).where(
                NotificationDelivery.status == "pending"
            )
        )
        inbox = db.scalar(
            select(func.count(ProviderEvent.id)).where(ProviderEvent.status == "received")
        )
        return jobs == 0 and mail == 0 and inbox == 0


def run_worker_until_settled(harness, factory, timeout=60):
    worker = harness.worker()
    try:
        wait_until(lambda: settled(factory), timeout, message="worker to settle")
    except AssertionError:
        raise AssertionError(f"worker did not settle; log:\n{worker.log()}") from None
    finally:
        worker.stop()


def expire_leases(factory):
    """Stand-in for waiting out the 120 s lease: the persisted lease time is moved back."""
    past = now() - timedelta(seconds=1)
    with factory.begin() as db:
        jobs = db.execute(
            update(OutboxJob).where(OutboxJob.status == "leased").values(lease_until=past)
        ).rowcount
        mail = db.execute(
            update(NotificationDelivery)
            .where(
                NotificationDelivery.status == "pending",
                NotificationDelivery.attempt_count > 0,
            )
            .values(next_attempt_at=past)
        ).rowcount
    return jobs + mail


def business(factory):
    """Every durable business result; two snapshots must be equal across a replay/restart."""
    with factory() as db:

        def rows(statement):
            return sorted(tuple(str(value) for value in row) for row in db.execute(statement))

        return {
            "orders": rows(
                select(
                    TicketOrder.id, TicketOrder.status, TicketOrder.fulfillment_payment_attempt_id
                )
            ),
            "tickets": rows(select(Ticket.id, Ticket.order_item_id, Ticket.status)),
            "allocations": rows(select(Allocation.id, Allocation.state)),
            "payments": rows(
                select(PaymentAttempt.id, PaymentAttempt.status, PaymentAttempt.charged_minor)
            ),
            "refunds": rows(select(Refund.id, Refund.status, Refund.amount_minor, Refund.reason)),
            "refund_attempts": rows(select(RefundAttempt.id, RefundAttempt.status)),
            "finance": rows(select(FinanceEntry.id, FinanceEntry.kind, FinanceEntry.amount_minor)),
            "stored_files": rows(select(StoredFile.id, StoredFile.object_key, StoredFile.sha256)),
            "notifications": rows(select(Notification.id, Notification.kind)),
            "outbox": rows(select(OutboxJob.id, OutboxJob.kind)),
            "audit": rows(select(AuditLog.action, func.count()).group_by(AuditLog.action)),
        }


def largest_group(db, column, *keys):
    count = func.count(column)
    return db.scalar(select(count).group_by(*keys).order_by(count.desc()).limit(1)) or 0


def assert_no_business_duplicates(factory):
    with factory() as db:
        assert largest_group(db, Ticket.id, Ticket.order_item_id) <= 1, "ticket per order item"
        assert largest_group(db, TicketOrder.id, TicketOrder.hold_id) <= 1, "order per hold"
        assert largest_group(db, Refund.id, Refund.payment_attempt_id) <= 1, "refund per charge"
        assert largest_group(db, FinanceEntry.id, FinanceEntry.refund_id, FinanceEntry.kind) <= 1
        assert largest_group(db, Notification.id, Notification.deduplication_key) <= 1
        dead = db.scalar(select(func.count(OutboxJob.id)).where(OutboxJob.status == "dead"))
        assert dead == 0


def storage_objects(settings):
    root = Path(settings.storage_root)
    if not root.exists():
        return set()
    return {path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()}


def referenced_ticket_pdfs(factory, settings):
    """Every ticket PDF the database points at exists in storage with the recorded checksum.

    Abandoned write intents (pending, or deleted tombstones) may exist beside it; only one clean
    row per ticket is allowed, and it must be the referenced one.
    """
    root = Path(settings.storage_root)
    with factory() as db:
        files = list(
            db.execute(
                select(Ticket.id, StoredFile.object_key, StoredFile.sha256, StoredFile.status).join(
                    StoredFile, StoredFile.id == Ticket.pdf_file_id
                )
            )
        )
        per_ticket = dict(
            db.execute(
                select(Ticket.id, func.count(StoredFile.id))
                .join(
                    StoredFile,
                    StoredFile.object_key.like(func.concat("tickets/", Ticket.id, "/%"))
                    & (StoredFile.status == "clean"),
                )
                .group_by(Ticket.id)
            ).all()
        )
    keys = set()
    for ticket_id, key, sha256, status in files:
        assert status == "clean"
        data = (root / key).read_bytes()  # a missing object is a lost file: FileNotFoundError
        assert hashlib.sha256(data).hexdigest() == sha256
        assert per_ticket[ticket_id] == 1, "more than one clean stored_file row for one ticket"
        keys.add(key)
    return keys


def make_ticket_intents_due(factory):
    """Stand-in for waiting out the one-hour write grace of abandoned ticket PDF intents."""
    with factory.begin() as db:
        return db.execute(
            update(StoredFile)
            .where(StoredFile.purpose == "ticket_pdf", StoredFile.status == "pending")
            .values(cleanup_after=now() - timedelta(seconds=1))
        ).rowcount


def ticket_files_status(factory):
    with factory() as db:
        return dict(
            db.execute(
                select(StoredFile.status, func.count(StoredFile.id))
                .where(StoredFile.purpose == "ticket_pdf")
                .group_by(StoredFile.status)
            ).all()
        )


def job_for_message(message_id):
    return UUID(message_id.strip("<>").split("@")[0])


def ticket_job(factory):
    with factory() as db:
        return db.scalar(select(OutboxJob).where(OutboxJob.kind == "ticket_delivery_email"))


def pdf_attachments(messages):
    return [
        part.get_content()
        for message in messages
        for part in message.iter_attachments()
        if part.get_content_type() == "application/pdf"
    ]


def simulator(child, path, headers, body):
    return httpx.post(child.url + API + path, headers=headers, json=body, timeout=30)


# --------------------------------------------------------------------------------------------
# API: provider notification committed, response lost
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("point", ["api_after_inbox_commit", "api_after_apply_commit"])
def test_api_killed_around_payment_commit_fulfils_once(
    client, setup, account, factory, settings, harness, smtp_sink, point
):
    f, order, headers = ready_order(client, setup, account, factory, settings, quantity=2)
    attempt = order["payment"]["id"]
    body = {"outcome": "succeeded", "external_event_id": f"evt-{point}"}

    api = harness.api(kill={"point": point})
    with pytest.raises(httpx.TransportError):
        simulator(api, f"/simulator/payments/{attempt}/events", headers, body)
    assert api.wait_exit() == KILLED
    inbox_id = UUID(api.marker(point)["inbox_id"])

    with factory() as db:
        inbox = db.get(ProviderEvent, inbox_id)
        tickets = db.scalar(select(func.count(Ticket.id)))
        status = db.get(TicketOrder, UUID(order["id"])).status
    if point == "api_after_inbox_commit":
        # The verified notification is durable; nothing was applied yet.
        assert (inbox.status, status, tickets) == ("received", "pending", 0)
    else:
        # Fulfilment committed with the inbox row; only the HTTP 200 was lost.
        assert (inbox.status, status, tickets) == ("processed", "confirmed", 2)

    # Restarted worker applies an unprocessed inbox row and delivers the outbox.
    run_worker_until_settled(harness, factory)
    before = business(factory)
    assert {row[1] for row in before["orders"]} == {"confirmed"}
    assert len(before["tickets"]) == 2

    # Restarted API; the provider retries the same notification, then sends a late duplicate.
    api = harness.api()
    replay = simulator(api, f"/simulator/payments/{attempt}/events", headers, body)
    assert replay.status_code == 200, replay.text
    assert replay.json()["provider_event_id"] == str(inbox_id)
    late = simulator(
        api,
        f"/simulator/payments/{attempt}/events",
        headers,
        {"outcome": "succeeded", "external_event_id": f"evt-{point}-late"},
    )
    assert late.status_code == 200, late.text
    api.stop()
    run_worker_until_settled(harness, factory)

    assert business(factory) == before
    assert_no_business_duplicates(factory)
    with factory() as db:
        assert db.scalar(select(func.count(Refund.id))) == 0
        jobs = list(
            db.scalars(select(OutboxJob.id).where(OutboxJob.kind == "ticket_delivery_email"))
        )
    assert len(jobs) == 2
    for job_id in jobs:
        # Nothing was sent before the crash, so each ticket email arrives exactly once here.
        assert len(smtp_sink.with_id(f"<{job_id}@biletflow.local>")) == 1
    assert len(referenced_ticket_pdfs(factory, settings)) == 2


# --------------------------------------------------------------------------------------------
# Refund: worker dies inside the dispatch transaction; API dies after the refund result commit
# --------------------------------------------------------------------------------------------


def test_refund_survives_worker_and_api_kills_with_single_financial_effect(
    client, setup, account, factory, settings, harness, smtp_sink
):
    f, order, headers = ready_order(client, setup, account, factory, settings)
    pay(client, headers, order["payment"]["id"], "succeeded")
    drain(factory, settings)
    started = client.post(
        API + f"/orders/{order['id']}/refunds", headers=f["headers"], json={"reason": "Crash"}
    )
    assert started.status_code == 200, started.text
    refund_id = UUID(started.json()["refund"]["id"])

    # 1. Worker killed after the refund attempt is flushed but before COMMIT.
    worker = harness.worker(kill={"point": "job_before_commit", "job_kind": "refund_dispatch"})
    assert worker.wait_exit() == KILLED
    worker.marker("job_before_commit")
    with factory() as db:
        assert db.scalar(select(func.count(RefundAttempt.id))) == 0
        assert db.get(Refund, refund_id).status == "requested"
        job = db.scalar(select(OutboxJob).where(OutboxJob.kind == "refund_dispatch"))
        assert (job.status, job.attempt_count) == ("pending", 0)

    run_worker_until_settled(harness, factory)
    with factory() as db:
        attempts = list(db.scalars(select(RefundAttempt)))
        assert [a.status for a in attempts] == ["pending"]
        assert db.get(Refund, refund_id).status == "pending"
    refund_attempt = attempts[0].id

    # 2. API killed after the refund success is applied and committed, before its response.
    body = {"outcome": "succeeded", "external_event_id": "evt-refund-crash"}
    api = harness.api(kill={"point": "api_after_apply_commit"})
    with pytest.raises(httpx.TransportError):
        simulator(api, f"/simulator/refunds/{refund_attempt}/events", headers, body)
    assert api.wait_exit() == KILLED
    inbox_id = UUID(api.marker("api_after_apply_commit")["inbox_id"])
    with factory() as db:
        assert db.get(Refund, refund_id).status == "succeeded"
        assert db.get(TicketOrder, UUID(order["id"])).status == "refunded"

    run_worker_until_settled(harness, factory)
    before = business(factory)

    # 3. Restarted API: same notification again, a late duplicate success and a stale failure.
    api = harness.api()
    replay = simulator(api, f"/simulator/refunds/{refund_attempt}/events", headers, body)
    assert replay.status_code == 200, replay.text
    assert replay.json()["provider_event_id"] == str(inbox_id)
    for index, outcome in enumerate(("succeeded", "failed")):
        late = simulator(
            api,
            f"/simulator/refunds/{refund_attempt}/events",
            headers,
            {"outcome": outcome, "external_event_id": f"evt-refund-late-{index}"},
        )
        assert late.status_code == 200, late.text
        assert late.json()["refund"]["status"] == "succeeded"
    api.stop()
    run_worker_until_settled(harness, factory)

    assert business(factory) == before
    assert_no_business_duplicates(factory)
    with factory() as db:
        assert db.scalar(select(func.count(Refund.id))) == 1
        assert db.scalar(select(func.count(RefundAttempt.id))) == 1
        succeeded = select(func.count(AuditLog.id)).where(
            AuditLog.action == "payments.refund_succeeded"
        )
        assert db.scalar(succeeded) == 1
        assert set(db.scalars(select(Ticket.status))) == {"refunded"}
        completed = db.scalar(
            select(NotificationDelivery)
            .join(Notification, Notification.id == NotificationDelivery.notification_id)
            .where(Notification.kind == "refund_completed", NotificationDelivery.channel == "email")
        )
        assert (
            db.scalar(
                select(func.count(Notification.id)).where(Notification.kind == "refund_completed")
            )
            == 1
        )
    assert completed.status == "sent"
    assert len(smtp_sink.with_id(completed.provider_message_id)) == 1


# --------------------------------------------------------------------------------------------
# Worker: notification fan-out committed, job not acknowledged
# --------------------------------------------------------------------------------------------


def test_worker_killed_after_fanout_commit_respects_lease_then_dedupes(
    client, setup, account, factory, settings, harness, smtp_sink
):
    _, order, headers = ready_order(client, setup, account, factory, settings)
    pay(client, headers, order["payment"]["id"], "succeeded")

    worker = harness.worker(kill={"point": "fanout_after_commit", "notice": "purchase_confirmed"})
    assert worker.wait_exit() == KILLED
    worker.marker("fanout_after_commit")
    fanout = select(OutboxJob).where(
        OutboxJob.deduplication_key.like("notify-purchase_confirmed:%")
    )
    purchase = select(func.count(Notification.id)).where(Notification.kind == "purchase_confirmed")
    with factory() as db:
        job = db.scalar(fanout)
        assert (job.status, job.attempt_count) == ("leased", 1)
        assert job.lease_until > now()
        assert db.scalar(purchase) == 1  # the business commit survived the crash

    # A restarted worker drains everything else but must not steal the unexpired lease.
    worker = harness.worker()

    def others_done():
        with factory() as db:
            open_jobs = list(
                db.scalars(select(OutboxJob.id).where(OutboxJob.status.in_(("pending", "leased"))))
            )
            mail = db.scalar(
                select(func.count(NotificationDelivery.id)).where(
                    NotificationDelivery.status == "pending"
                )
            )
        return open_jobs == [job.id] and mail == 0

    wait_until(others_done, 60, message="other work to finish")
    with factory() as db:
        held = db.scalar(fanout)
        assert (held.status, held.attempt_count) == ("leased", 1)

    assert expire_leases(factory) == 1
    wait_until(lambda: settled(factory), 60, message="expired fan-out lease to be retried")
    worker.stop()

    with factory() as db:
        job = db.scalar(fanout)
        assert (job.status, job.attempt_count) == ("done", 2)
        assert db.scalar(purchase) == 1  # the retried fan-out deduplicated its notification
        email = db.scalar(
            select(NotificationDelivery)
            .join(Notification, Notification.id == NotificationDelivery.notification_id)
            .where(
                Notification.kind == "purchase_confirmed", NotificationDelivery.channel == "email"
            )
        )
    assert email.status == "sent"
    assert len(smtp_sink.with_id(email.provider_message_id)) == 1
    assert_no_business_duplicates(factory)


# --------------------------------------------------------------------------------------------
# Worker: ticket PDF storage boundaries
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("point", ["pdf_after_reserve", "pdf_after_put"])
def test_worker_killed_before_pdf_finalize_loses_nothing_and_sweeps_orphan(
    client, setup, account, factory, settings, harness, smtp_sink, point
):
    _, order, headers = ready_order(client, setup, account, factory, settings)
    pay(client, headers, order["payment"]["id"], "succeeded")

    worker = harness.worker(kill={"point": point})
    assert worker.wait_exit() == KILLED
    marker = worker.marker(point)
    killed_key = marker["key"]
    job = ticket_job(factory)
    with factory() as db:
        ticket = db.scalar(select(Ticket))
        assert ticket.pdf_file_id is None
        # The write intent was committed before any byte was written.
        [intent] = db.scalars(select(StoredFile))
        assert (str(intent.id), intent.object_key, intent.status) == (
            marker["file_id"],
            killed_key,
            "pending",
        )
        assert intent.cleanup_after > now()
    # pdf_after_put: bytes written, intent never finalized; pdf_after_reserve: nothing written.
    assert (killed_key in storage_objects(settings)) == (point == "pdf_after_put")
    assert job.status == "leased"
    assert smtp_sink.with_id(f"<{job.id}@biletflow.local>") == []

    assert expire_leases(factory) == 1
    run_worker_until_settled(harness, factory)

    referenced = referenced_ticket_pdfs(factory, settings)
    assert len(referenced) == 1 and killed_key not in referenced
    # Within the grace period the killed run's intent (and object, if any) is left alone.
    assert storage_objects(settings) - referenced == (
        {killed_key} if point == "pdf_after_put" else set()
    )
    assert ticket_files_status(factory) == {"clean": 1, "pending": 1}
    job = ticket_job(factory)
    assert (job.status, job.attempt_count) == ("done", 2)
    sent = smtp_sink.with_id(f"<{job.id}@biletflow.local>")
    assert len(sent) == 1
    stored = (Path(settings.storage_root) / next(iter(referenced))).read_bytes()
    assert pdf_attachments(sent) == [stored]

    # After the grace period a restarted worker's sweep removes the orphan and only the orphan.
    assert make_ticket_intents_due(factory) == 1
    worker = harness.worker()
    try:
        wait_until(
            lambda: (
                ticket_files_status(factory) == {"clean": 1, "deleted": 1}
                and killed_key not in storage_objects(settings)
            ),
            30,
            message="ticket PDF sweep",
        )
    finally:
        worker.stop()
    assert storage_objects(settings) == referenced
    assert referenced_ticket_pdfs(factory, settings) == referenced
    assert_no_business_duplicates(factory)


def test_worker_killed_after_pdf_commit_reuses_stored_file(
    client, setup, account, factory, settings, harness, smtp_sink
):
    _, order, headers = ready_order(client, setup, account, factory, settings)
    pay(client, headers, order["payment"]["id"], "succeeded")

    worker = harness.worker(kill={"point": "pdf_after_commit"})
    assert worker.wait_exit() == KILLED
    marker = worker.marker("pdf_after_commit")
    with factory() as db:
        ticket = db.scalar(select(Ticket))
        assert str(ticket.pdf_file_id) == marker["file_id"]
    assert referenced_ticket_pdfs(factory, settings) == {marker["key"]}
    stored_path = Path(settings.storage_root) / marker["key"]
    original, inode = stored_path.read_bytes(), stored_path.stat().st_ino
    job = ticket_job(factory)
    assert job.status == "leased"
    assert smtp_sink.with_id(f"<{job.id}@biletflow.local>") == []

    assert expire_leases(factory) == 1
    run_worker_until_settled(harness, factory)

    # Same file row, object and bytes: the retry served the stored PDF instead of rendering
    # and atomically replacing it (rendering is deterministic, so the inode is the evidence).
    assert referenced_ticket_pdfs(factory, settings) == {marker["key"]}
    assert storage_objects(settings) == {marker["key"]}
    with factory() as db:
        assert db.scalar(select(func.count(StoredFile.id))) == 1
    assert stored_path.read_bytes() == original
    assert stored_path.stat().st_ino == inode
    sent = smtp_sink.with_id(f"<{job.id}@biletflow.local>")
    assert len(sent) == 1
    assert pdf_attachments(sent) == [original]
    assert_no_business_duplicates(factory)


# --------------------------------------------------------------------------------------------
# Worker: SMTP accepted the message, acknowledgement lost
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("message", ["outbox", "notification"])
def test_worker_killed_after_smtp_accept_duplicates_mail_not_business(
    client, setup, account, factory, settings, harness, smtp_sink, message
):
    _, order, headers = ready_order(client, setup, account, factory, settings)
    pay(client, headers, order["payment"]["id"], "succeeded")

    worker = harness.worker(kill={"point": "smtp_after_send", "message": message})
    assert worker.wait_exit() == KILLED
    message_id = worker.marker("smtp_after_send")["message_id"]
    assert len(smtp_sink.with_id(message_id)) == 1  # accepted by SMTP before the crash
    before_files = referenced_ticket_pdfs(factory, settings)
    assert len(before_files) == 1  # the ticket PDF was stored before either email was sent

    assert expire_leases(factory) == 1
    run_worker_until_settled(harness, factory)

    # At-least-once email: the same Message-ID is delivered twice. This is a possible duplicate
    # delivery, not a duplicated business result.
    copies = smtp_sink.with_id(message_id)
    assert len(copies) == 2
    assert copies[0].get_body().get_content() == copies[1].get_body().get_content()
    with factory() as db:
        if message == "outbox":
            job = db.get(OutboxJob, job_for_message(message_id))
            assert (job.kind, job.status, job.attempt_count) == ("ticket_delivery_email", "done", 2)
            assert pdf_attachments(copies[:1]) == pdf_attachments(copies[1:])
        else:
            delivery_id = UUID(message_id.strip("<>").split("@")[0].removeprefix("notification-"))
            delivery = db.get(NotificationDelivery, delivery_id)
            assert (delivery.status, delivery.attempt_count) == ("sent", 2)
            assert delivery.provider_message_id == message_id
        assert db.scalar(select(func.count(Ticket.id))) == 1
        purchase = select(func.count(Notification.id)).where(
            Notification.kind == "purchase_confirmed"
        )
        assert db.scalar(purchase) == 1
    assert referenced_ticket_pdfs(factory, settings) == before_files
    assert_no_business_duplicates(factory)


# --------------------------------------------------------------------------------------------
# Worker: stalled (not dead) past its lease; a second worker takes over
# --------------------------------------------------------------------------------------------


def test_stalled_worker_lease_takeover_is_fenced(
    client, setup, account, factory, settings, harness, smtp_sink
):
    _, order, headers = ready_order(client, setup, account, factory, settings)
    pay(client, headers, order["payment"]["id"], "succeeded")

    stalled = harness.worker(
        kill={"point": "smtp_before_send", "action": "stop", "message": "outbox"}
    )
    message_id = stalled.marker("smtp_before_send")["message_id"]
    wait_until(stalled.stopped, 10, message="worker A to stop itself")
    job_id = job_for_message(message_id)
    with factory() as db:
        job = db.get(OutboxJob, job_id)
        assert (job.status, job.attempt_count) == ("leased", 1)
        stale_lease = job.lease_token
    assert smtp_sink.with_id(message_id) == []

    # Worker A's lease expires while it is frozen; worker B takes the job and completes it.
    assert expire_leases(factory) == 1
    run_worker_until_settled(harness, factory)
    with factory() as db:
        job = db.get(OutboxJob, job_id)
        done = (job.status, job.attempt_count, job.completed_at, job.lease_token)
    assert done[:2] == ("done", 2) and done[3] is None
    assert len(smtp_sink.with_id(message_id)) == 1
    files = referenced_ticket_pdfs(factory, settings)

    # Worker A resumes: its stale SMTP send goes out, but its acknowledgement is fenced.
    heartbeat = stalled.marker_dir / "heartbeat"
    beat = heartbeat.stat().st_mtime_ns
    stalled.signal(signal.SIGCONT)
    wait_until(lambda: len(smtp_sink.with_id(message_id)) == 2, 30, message="stale send")
    wait_until(lambda: heartbeat.stat().st_mtime_ns > beat, 30, message="A to finish its pass")
    assert stalled.stop() is not None

    with factory() as db:
        job = db.get(OutboxJob, job_id)
        assert (job.status, job.attempt_count, job.completed_at, job.lease_token) == done
        assert job.lease_token != stale_lease
        assert db.scalar(select(func.count(Ticket.id))) == 1
    assert referenced_ticket_pdfs(factory, settings) == files
    assert_no_business_duplicates(factory)
