from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from conftest import PASSWORD, latest_token
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError, SQLAlchemyError

from app.config import Settings
from app.models import AuditLog, AuthSession, OutboxJob, RateBucket, User
from app.security import now
from app.worker import deliver_once

AUTH = "/api/v1/auth"


@pytest.mark.parametrize(
    "changes",
    [
        {"jwt_secret": "short"},
        {"jwt_secret": "c" * 48},
        {"jwt_secret": "replace-with-a-random-secret-at-least-32-bytes"},
        {"database_url": "sqlite:///not-allowed"},
        {"environment": "production", "cookie_secure": False},
        {
            "environment": "production",
            "cookie_secure": True,
            "allowed_origins": ["https://example.com"],
        },
    ],
)
def test_unsafe_configuration_rejected(changes):
    config = dict(
        database_url="postgresql+psycopg://localhost/test",
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
    )
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **(config | changes))


def test_secure_cookie_in_https_mode(app, account):
    app.state.settings.cookie_secure = True
    with TestClient(app, base_url="https://testserver") as client:
        r = client.post(
            AUTH + "/register",
            json={"email": "secure@example.com", "password": PASSWORD, "display_name": "Secure"},
        )
        assert r.status_code == 202
        token = latest_token(
            app.state.sessions, app.state.settings, "secure@example.com", "email_verify"
        )
        client.post(AUTH + "/verify-email", json={"token": token})
        r = client.post(AUTH + "/login", json={"email": "secure@example.com", "password": PASSWORD})
        assert "Secure" in r.headers["set-cookie"] and "HttpOnly" in r.headers["set-cookie"]


@pytest.mark.parametrize(
    "token", ["garbage", "bad.uuid", "x." + "y" * 43, str(uuid4()) + "." + "x" * 43]
)
def test_malformed_or_unknown_account_tokens(client, token):
    assert client.post(AUTH + "/verify-email", json={"token": token}).status_code == 401
    assert client.post(AUTH + "/refresh", json={"refresh_token": token}).status_code == 401


def test_verification_is_atomic_across_connections(client, app, factory, settings):
    email = "race-verify@example.com"
    client.post(
        AUTH + "/register", json={"email": email, "password": PASSWORD, "display_name": "Race"}
    )
    token = latest_token(factory, settings, email, "email_verify")

    def verify(_):
        with TestClient(app) as other:
            return other.post(AUTH + "/verify-email", json={"token": token}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(verify, range(2))) == [200, 401]
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(AuditLog.id)).where(AuditLog.action == "auth.email_verified")
            )
            == 1
        )


def test_reset_and_refresh_race_cannot_leave_active_session(
    client, app, account, factory, settings
):
    email, tokens, _ = account()
    client.post(AUTH + "/password/forgot", json={"email": email})
    token = latest_token(factory, settings, email, "password_reset")

    def reset():
        with TestClient(app) as other:
            return other.post(
                AUTH + "/password/reset",
                json={"token": token, "password": "new very long password"},
            ).status_code

    def refresh():
        with TestClient(app) as other:
            return other.post(
                AUTH + "/refresh", json={"refresh_token": tokens["refresh_token"]}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(reset), pool.submit(refresh)
        assert a.result() == 200
        assert b.result() in [200, 401]
    with factory() as db:
        assert (
            db.scalar(select(func.count(AuthSession.id)).where(AuthSession.revoked_at.is_(None)))
            == 0
        )


def test_registration_rolls_back_if_outbox_fails(client, factory, monkeypatch):
    def broken(*args):
        raise SQLAlchemyError("sensitive-sql-and-credentials")

    monkeypatch.setattr("app.main.queue_challenge", broken)
    r = client.post(
        AUTH + "/register",
        json={"email": "rollback@example.com", "password": PASSWORD, "display_name": "Rollback"},
    )
    assert r.status_code == 503 and "sensitive" not in r.text
    with factory() as db:
        assert db.scalar(select(func.count(User.id))) == 0
        assert db.scalar(select(func.count(AuditLog.id))) == 0


def test_ip_rate_limit_and_window_recovery(client, app, factory):
    app.state.settings.rate_ip_limit = 2
    for n in range(2):
        assert (
            client.post(
                AUTH + "/login", json={"email": f"person{n}@example.com", "password": PASSWORD}
            ).status_code
            == 401
        )
    assert (
        client.post(
            AUTH + "/login", json={"email": "third@example.com", "password": PASSWORD}
        ).status_code
        == 429
    )
    with factory.begin() as db:
        db.execute(update(RateBucket).values(window_start=now() - timedelta(minutes=5)))
    assert (
        client.post(
            AUTH + "/login", json={"email": "third@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_worker_lease_fencing_and_crash_budget(client, factory, settings):
    client.post(
        AUTH + "/register",
        json={"email": "lease@example.com", "password": PASSWORD, "display_name": "Lease"},
    )
    replacement = uuid4()

    def lose_lease(message):
        with factory.begin() as db:
            db.execute(update(OutboxJob).values(lease_token=replacement))

    assert deliver_once(factory, settings, lose_lease)
    with factory.begin() as db:
        job = db.scalar(select(OutboxJob))
        assert job.status == "leased" and job.lease_token == replacement
        job.lease_until, job.attempt_count = now() - timedelta(seconds=1), 5
    assert deliver_once(factory, settings, lambda _: pytest.fail("Must not send"))
    with factory() as db:
        assert db.scalar(select(OutboxJob)).status == "dead"


def test_smtp_delivery_configuration(client, factory, settings, monkeypatch):
    client.post(
        AUTH + "/register",
        json={"email": "smtp@example.com", "password": PASSWORD, "display_name": "SMTP"},
    )
    events = []

    class SMTP:
        def __init__(self, host, port, timeout):
            events.append((host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def starttls(self):
            events.append("tls")

        def login(self, username, password):
            events.append("login")

        def send_message(self, message):
            events.append(message["To"])

    monkeypatch.setattr("app.worker.smtplib.SMTP", SMTP)
    config = settings.model_copy(update={"smtp_starttls": True, "smtp_username": "sender"})
    assert deliver_once(factory, config)
    assert events == [("localhost", 1025, 20), "tls", "login", "smtp@example.com"]


def test_runtime_permissions(factory):
    # Role and all grants exist only inside this rolled-back test transaction.
    role = "auth_test_" + uuid4().hex
    with factory() as db:
        db.execute(text(f'CREATE ROLE "{role}"'))
        db.execute(text(f'GRANT USAGE ON SCHEMA biletflow TO "{role}"'))
        db.execute(
            text(f'GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA biletflow TO "{role}"')
        )
        db.execute(text(f'REVOKE UPDATE ON biletflow.audit_log FROM "{role}"'))
        db.execute(text(f'SET LOCAL ROLE "{role}"'))
        assert db.scalar(text("SELECT count(*) FROM biletflow.app_user")) == 0
        for statement in [
            "DELETE FROM biletflow.app_user",
            "TRUNCATE biletflow.auth_session",
            "ALTER TABLE biletflow.app_user ADD COLUMN bad text",
            "UPDATE biletflow.audit_log SET description='bad'",
        ]:
            with pytest.raises(DBAPIError), db.begin_nested():
                db.execute(text(statement))
        db.rollback()
