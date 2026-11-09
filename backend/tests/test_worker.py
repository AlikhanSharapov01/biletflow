from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select, update

from app.models import OutboxJob
from app.security import now
from app.worker import deliver_once, main


def test_main_loop_touches_heartbeat(monkeypatch, tmp_path):
    heartbeat = tmp_path / "heartbeat"
    monkeypatch.setattr("app.worker.HEARTBEAT_FILE", heartbeat)
    monkeypatch.setattr("app.worker.Settings", MagicMock())
    monkeypatch.setattr("app.worker.database", lambda url: (MagicMock(), MagicMock()))
    monkeypatch.setattr("app.worker.storage_from_settings", MagicMock())
    monkeypatch.setattr("app.worker.sweep_expired_holds", MagicMock())
    for idle in (
        "initialize_once",
        "dispatch_refund_once",
        "process_received_once",
        "deliver_once",
        "deliver_notifications_once",
    ):
        monkeypatch.setattr(f"app.worker.{idle}", MagicMock(return_value=False))

    # time.sleep runs only once a full idle pass has finished.
    monkeypatch.setattr("app.worker.time.sleep", MagicMock(side_effect=KeyboardInterrupt))
    with pytest.raises(KeyboardInterrupt):
        main()
    assert heartbeat.exists()


def test_delivery_generates_token_only_at_dispatch(client, factory, settings):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "worker@example.com",
            "password": "password long enough",
            "display_name": "Worker",
        },
    )
    messages = []
    assert deliver_once(factory, settings, messages.append)
    assert "#token=" in messages[0].get_content()
    assert messages[0]["To"] == "worker@example.com"
    with factory() as db:
        job = db.scalar(select(OutboxJob))
        assert job.status == "done" and job.completed_at
        assert set(job.payload) == {"version", "account_token_id"}
    assert not deliver_once(factory, settings, messages.append)


def test_delivery_retry_and_dead_letter(client, factory, settings):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "worker@example.com",
            "password": "password long enough",
            "display_name": "Worker",
        },
    )

    def fail(message):
        raise OSError("secret-token-and-email")

    for attempt in range(5):
        assert deliver_once(factory, settings, fail)
        with factory.begin() as db:
            job = db.scalar(select(OutboxJob))
            assert job.attempt_count == attempt + 1
            assert job.last_error == "email_delivery_failed"
            assert job.status == ("dead" if attempt == 4 else "pending")
            job.available_at = now() - timedelta(seconds=1)


def test_consumed_email_is_skipped_and_expired_lease_recovers(client, account, factory, settings):
    account()
    with factory.begin() as db:
        from uuid import uuid4

        db.execute(
            update(OutboxJob).values(
                status="leased", lease_token=uuid4(), lease_until=now() - timedelta(seconds=1)
            )
        )
    messages = []
    assert deliver_once(factory, settings, messages.append)
    assert not messages
    with factory() as db:
        assert db.scalar(select(OutboxJob)).status == "done"
