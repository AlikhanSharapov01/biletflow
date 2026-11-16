"""BF-22 (#78): request/job correlation, safe worker failure signals and operational metrics."""

import json
import logging
from datetime import timedelta
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update

from app import payments_service
from app.admin_cli import set_admin
from app.models import AuditLog, OutboxJob
from app.notification_models import NotificationDelivery
from app.notification_service import email_once, fanout_once
from app.observability import JsonFormatter, correlation_id
from app.payments_service import dispatch_refund_once, initialize_once
from app.security import now
from app.worker import deliver_once, main
from tests.test_notifications import buy, drain, edit_title, published

API = "/api/v1"
METRICS = API + "/admin/operations/metrics"
EMAIL = "observed.person@example.com"
PASSWORD = "password long enough"


def entries(caplog, event):
    return [
        json.loads(JsonFormatter().format(r)) for r in caplog.records if r.getMessage() == event
    ]


def register(client, email=EMAIL):
    response = client.post(
        API + "/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Observed"},
    )
    assert response.status_code == 202, response.text
    return UUID(response.headers["X-Request-ID"])


def test_request_correlation_reaches_audit_job_and_log(client, factory, caplog):
    caplog.set_level(logging.INFO, logger="app")
    supplied = str(uuid4())
    response = client.post(
        API + "/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "display_name": "Observed"},
        headers={"X-Request-ID": supplied},
    )
    assert response.status_code == 202
    # Server-generated: a client cannot choose the ID its audit rows are filed under.
    correlation = UUID(response.headers["X-Request-ID"])
    assert str(correlation) != supplied
    with factory() as db:
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "auth.registered"))
        job = db.scalar(select(OutboxJob).where(OutboxJob.kind == "auth_email"))
    assert audit.correlation_id == correlation and job.correlation_id == correlation
    [entry] = entries(caplog, "http.request")
    assert entry["correlation_id"] == str(correlation)
    assert entry["method"] == "POST" and entry["route"] == API + "/auth/register"
    assert entry["status"] == 202 and entry["duration_ms"] >= 0
    output = json.dumps(entries(caplog, "http.request"))
    assert EMAIL not in output and PASSWORD not in output
    # Every request gets its own ID.
    assert register(client, "second@example.com") != correlation


def test_request_log_uses_route_template_never_raw_path_or_query(client, caplog):
    caplog.set_level(logging.INFO, logger="app")
    secret = "link-secret-" + uuid4().hex
    client.get(API + f"/campaign-links/{secret}?email={EMAIL}&token=query-secret")
    client.get(f"/not-a-route/{secret}")
    logged = entries(caplog, "http.request")
    assert [e["route"] for e in logged] == [API + "/campaign-links/{token}", "unmatched"]
    assert logged[1]["status"] == 404
    output = json.dumps(logged)
    for value in (secret, EMAIL, "query-secret"):
        assert value not in output


def test_metrics_require_platform_admin(client, account):
    response = client.get(METRICS)
    assert response.status_code == 401
    _, _, headers = account()
    response = client.get(METRICS, headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "admin_required"


def test_metrics_report_request_rates_and_job_backlog(client, account, factory):
    email, _, headers = account()
    assert set_admin(factory, email, True) == "granted"
    client.get("/not-a-route")
    client.get(API + "/admin/users?limit=0", headers=headers)  # 422
    with factory.begin() as db:
        # Registration emails from account() are settled so only the rows below count.
        db.execute(update(OutboxJob).values(status="done", completed_at=now()))
        db.add_all(
            [
                OutboxJob(
                    kind="auth_email",
                    deduplication_key="metrics-ready",
                    payload={},
                    available_at=now() - timedelta(minutes=10),
                ),
                OutboxJob(
                    kind="auth_email",
                    deduplication_key="metrics-retry",
                    payload={},
                    attempt_count=2,
                    available_at=now() + timedelta(minutes=5),
                ),
                OutboxJob(
                    kind="refund_dispatch",
                    deduplication_key="metrics-stuck",
                    payload={},
                    status="leased",
                    attempt_count=1,
                    lease_token=uuid4(),
                    lease_until=now() - timedelta(seconds=1),
                ),
                OutboxJob(
                    kind="refund_dispatch",
                    deduplication_key="metrics-dead",
                    payload={},
                    status="dead",
                    attempt_count=5,
                    last_error="refund_dispatch_failed",
                ),
            ]
        )
    response = client.get(METRICS, headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    body = response.json()

    outbox = body["jobs"]["outbox"]
    assert outbox["pending"] == 2 and outbox["ready"] == 1 and outbox["retrying"] == 1
    assert outbox["leased"] == 1 and outbox["expired_leases"] == 1 and outbox["dead"] == 1
    assert 590 <= outbox["oldest_ready_age_seconds"] < 3600
    kinds = {k["kind"]: k for k in body["jobs"]["outbox_by_kind"]}
    assert kinds["auth_email"] == {"kind": "auth_email", "pending": 2, "leased": 0, "dead": 0}
    assert kinds["refund_dispatch"] == {
        "kind": "refund_dispatch",
        "pending": 0,
        "leased": 1,
        "dead": 1,
    }
    email_queue = body["jobs"]["notification_email"]
    assert set(email_queue) == {"pending", "ready", "failed", "oldest_ready_age_seconds"}

    requests = body["requests"]
    routes = {(r["method"], r["route"]): r for r in requests["routes"]}
    assert routes[("GET", "unmatched")]["client_errors"] == 1
    assert routes[("GET", API + "/admin/users")]["client_errors"] == 1
    assert routes[("POST", API + "/auth/register")]["requests"] == 1
    assert requests["requests"] == sum(r["requests"] for r in requests["routes"])
    assert 0 <= requests["error_rate"] <= 1 and requests["uptime_seconds"] >= 0
    assert requests["latency_ms"][-1] == {"le": None, "count": requests["requests"]}
    assert EMAIL not in response.text and email not in response.text


def test_job_failures_are_logged_safely_under_request_correlation(
    client, factory, settings, caplog
):
    correlation = register(client)
    caplog.set_level(logging.INFO, logger="app")

    def fail(message):
        raise OSError(f"smtp rejected {EMAIL} token=smtp-secret")

    for _ in range(5):
        assert deliver_once(factory, settings, fail)
        with factory.begin() as db:
            db.execute(update(OutboxJob).values(available_at=now() - timedelta(seconds=1)))
    retries = entries(caplog, "job.retry_scheduled")
    [dead] = entries(caplog, "job.dead")
    assert [e["attempt"] for e in retries] == [1, 2, 3, 4] and dead["attempt"] == 5
    for entry in [*retries, dead]:
        assert entry["correlation_id"] == str(correlation)
        assert entry["kind"] == "auth_email" and entry["error_type"] == "OSError"
        assert entry["last_error"] == "email_delivery_failed"
    assert retries[0]["retry_in_seconds"] == 2
    output = json.dumps([*retries, dead])
    assert EMAIL not in output and "smtp-secret" not in output and "smtp rejected" not in output
    # The job's correlation does not leak into later, unrelated work.
    assert correlation_id() != correlation


def test_exhausted_lease_is_reported_dead(client, factory, settings, caplog):
    correlation = register(client)
    with factory.begin() as db:
        db.execute(
            update(OutboxJob).values(
                status="leased",
                attempt_count=5,
                lease_token=uuid4(),
                lease_until=now() - timedelta(seconds=1),
            )
        )
    caplog.set_level(logging.INFO, logger="app")
    assert deliver_once(factory, settings, MagicMock())
    [dead] = entries(caplog, "job.dead")
    assert dead["correlation_id"] == str(correlation)
    assert dead["last_error"] == "delivery_attempts_exhausted" and dead["attempt"] == 5


def test_worker_loop_logs_task_failures_and_keeps_running(monkeypatch, tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="app")
    monkeypatch.setattr("app.worker.HEARTBEAT_FILE", tmp_path / "heartbeat")
    monkeypatch.setattr("app.worker.Settings", MagicMock())
    monkeypatch.setattr("app.worker.database", lambda url: (MagicMock(), MagicMock()))
    monkeypatch.setattr("app.worker.storage_from_settings", MagicMock())
    failures = {
        "sweep_expired_holds": RuntimeError(f"hold for {EMAIL}"),
        "reconcile_images": OSError("/var/storage/secret/path"),
        "reconcile_ticket_pdfs": OSError("/var/storage/secret/path"),
        "initialize_once": ValueError("provider said token=abc"),
    }
    for name, error in failures.items():
        monkeypatch.setattr(f"app.worker.{name}", MagicMock(side_effect=error))
    deliver = MagicMock(return_value=False)
    monkeypatch.setattr("app.worker.deliver_once", deliver)
    for idle in ("dispatch_refund_once", "process_received_once", "deliver_notifications_once"):
        monkeypatch.setattr(f"app.worker.{idle}", MagicMock(return_value=False))
    monkeypatch.setattr("app.worker.export_ga4_once", MagicMock(return_value=0))
    monkeypatch.setattr("app.worker.reconcile_attachments", MagicMock(return_value=0))
    monkeypatch.setattr("app.worker.scan_attachments_once", MagicMock(return_value=False))
    monkeypatch.setattr("app.worker.time.sleep", MagicMock(side_effect=KeyboardInterrupt))
    with pytest.raises(KeyboardInterrupt):
        main()
    # The loop went on to email delivery after every failure.
    assert deliver.called
    logged = {e["task"]: e for e in entries(caplog, "worker.task_failed")}
    assert {k: e["error_type"] for k, e in logged.items()} == {
        "hold_sweep": "RuntimeError",
        "image_reconcile": "OSError",
        "ticket_pdf_reconcile": "OSError",
        "payments": "ValueError",
    }
    assert len({e["correlation_id"] for e in logged.values()}) == 4
    output = json.dumps(list(logged.values()))
    assert EMAIL not in output and "secret/path" not in output and "token=abc" not in output


def test_worker_loop_survives_an_email_delivery_failure(monkeypatch, tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="app")
    monkeypatch.setattr("app.worker.HEARTBEAT_FILE", tmp_path / "heartbeat")
    monkeypatch.setattr("app.worker.Settings", MagicMock())
    monkeypatch.setattr("app.worker.database", lambda url: (MagicMock(), MagicMock()))
    monkeypatch.setattr("app.worker.storage_from_settings", MagicMock())
    for idle in (
        "sweep_expired_holds",
        "reconcile_images",
        "reconcile_ticket_pdfs",
        "reconcile_attachments",
        "initialize_once",
        "dispatch_refund_once",
        "process_received_once",
        "export_ga4_once",
        "scan_attachments_once",
        "deliver_notifications_once",
    ):
        monkeypatch.setattr(f"app.worker.{idle}", MagicMock(return_value=False))
    # A database drop mid-delivery: logged by type, then the loop goes on to sleep.
    error = ConnectionError("postgresql://biletflow_app:s3cretpw@db/biletflow")
    monkeypatch.setattr("app.worker.deliver_once", MagicMock(side_effect=error))
    monkeypatch.setattr("app.worker.time.sleep", MagicMock(side_effect=KeyboardInterrupt))
    with pytest.raises(KeyboardInterrupt):
        main()
    [failed] = entries(caplog, "worker.task_failed")
    assert (failed["task"], failed["error_type"]) == ("email_delivery", "ConnectionError")
    assert "s3cretpw" not in json.dumps(failed)


def test_unhandled_error_is_answered_and_logged_without_its_text(client, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    broken = MagicMock()
    broken.hash.side_effect = RuntimeError(f"INSERT failed for {EMAIL} password={PASSWORD}")
    monkeypatch.setattr("app.main.passwords", broken)
    response = client.post(
        API + "/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "display_name": "Observed"},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": {"code": "internal_error"}}
    correlation = response.headers["X-Request-ID"]
    [entry] = entries(caplog, "http.request")
    assert entry["correlation_id"] == correlation and entry["status"] == 500
    assert entry["error_type"] == "RuntimeError"
    assert EMAIL not in caplog.text and PASSWORD not in caplog.text


def queue(factory, kind, payload, correlation):
    with factory.begin() as db:
        db.add(
            OutboxJob(
                kind=kind,
                deduplication_key=f"{kind}:{uuid4()}",
                payload={"version": 1, **payload},
                correlation_id=correlation,
            )
        )


def test_payment_and_refund_jobs_run_under_the_queuing_request_id(factory, monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="app")
    initialize, dispatch = uuid4(), uuid4()
    queue(factory, "payment_initialize", {"attempt_id": str(uuid4())}, initialize)
    queue(factory, "refund_dispatch", {"refund_id": str(uuid4())}, dispatch)
    assert initialize_once(factory) and dispatch_refund_once(factory)
    done = {e["kind"]: e["correlation_id"] for e in entries(caplog, "job.done")}
    assert done == {"payment_initialize": str(initialize), "refund_dispatch": str(dispatch)}
    # A failing step is reported under the same ID, then re-raised for the worker's retry.
    failing = uuid4()
    queue(factory, "refund_dispatch", {"refund_id": str(uuid4())}, failing)

    def crash(job):
        raise RuntimeError(f"provider echoed {EMAIL}")

    monkeypatch.setattr(payments_service, "finish", crash)
    with pytest.raises(RuntimeError):
        dispatch_refund_once(factory)
    [failed] = entries(caplog, "job.step_failed")
    assert failed["correlation_id"] == str(failing)
    assert failed["step"] == "dispatch_refund_once" and failed["error_type"] == "RuntimeError"
    assert EMAIL not in json.dumps(failed)


def test_notification_email_retries_and_failure_are_signalled(
    client, setup, account, factory, settings, caplog
):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    edit_title(client, f)
    assert fanout_once(factory)
    caplog.set_level(logging.INFO, logger="app")

    def broken(message):
        raise OSError(f"smtp rejected {message['To']}")

    for _ in range(5):
        assert email_once(factory, settings, broken)
        with factory.begin() as db:
            db.execute(
                update(NotificationDelivery)
                .where(NotificationDelivery.status == "pending")
                .values(next_attempt_at=now())
            )
    retries = entries(caplog, "notification.email_retry")
    [failed] = entries(caplog, "notification.email_failed")
    assert [e["attempt"] for e in retries] == [1, 2, 3, 4] and failed["attempt"] == 5
    for entry in [*retries, failed]:
        assert entry["error_type"] == "OSError" and entry["last_error"] == "email_delivery_failed"
    assert email not in json.dumps([*retries, failed])
