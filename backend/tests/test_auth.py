from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import jwt
import pytest
from conftest import PASSWORD, latest_token
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import AccountToken, AuditLog, AuthSession, OutboxJob, RefreshToken, User
from app.security import digest, now

AUTH = "/api/v1/auth"


def test_registration_verification_and_secret_storage(client, factory, settings):
    payload = {"email": "  PERSON@EXAMPLE.COM ", "password": PASSWORD, "display_name": "Person"}
    r = client.post(AUTH + "/register", json=payload)
    assert r.status_code == 202
    assert client.post(AUTH + "/register", json=payload).json() == r.json()
    assert (
        client.post(
            AUTH + "/login", json={"email": "person@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )
    token = latest_token(factory, settings, "person@example.com", "email_verify")
    assert client.post(AUTH + "/verify-email", json={"token": token}).status_code == 200
    assert client.post(AUTH + "/verify-email", json={"token": token}).status_code == 401
    r = client.post(
        AUTH + "/login",
        json={"email": "person@example.com", "password": PASSWORD, "client_kind": "scanner"},
    )
    assert r.status_code == 200
    with factory() as db:
        user = db.scalar(select(User))
        assert user.password_hash.startswith("$argon2id$") and PASSWORD not in user.password_hash
        session = db.scalar(select(AuthSession))
        assert session.refresh_token_hash == digest(r.json()["refresh_token"])
        assert db.scalar(select(RefreshToken)).token_hash == session.refresh_token_hash
        assert db.scalar(select(AccountToken)).token_hash == digest(token)
        assert token not in str(db.scalar(select(OutboxJob)).payload)
        assert db.scalar(select(func.count(User.id))) == 1
    assert (
        "password"
        not in client.get(
            "/api/v1/me", headers={"Authorization": "Bearer " + r.json()["access_token"]}
        ).text
    )


@pytest.mark.parametrize(
    "email,password", [("unknown@example.com", PASSWORD), ("owner@example.com", "bad-password")]
)
def test_generic_login_failures(client, account, email, password):
    account("owner@example.com")
    r = client.post(AUTH + "/login", json={"email": email, "password": password})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "invalid_credentials"


@pytest.mark.parametrize(
    "change",
    [
        {"password": "short"},
        {"password": "x" * 129},
        {"email": "bad"},
        {"locale": "de"},
        {"role": "admin"},
        {"display_name": " "},
    ],
)
def test_registration_validation_never_echoes_password(client, change):
    payload = {"email": "valid@example.com", "password": PASSWORD, "display_name": "Valid"} | change
    r = client.post(AUTH + "/register", json=payload)
    assert r.status_code == 422
    assert PASSWORD not in r.text and "input" not in r.json()["detail"].get("fields", [{}])[0]


def test_refresh_rotation_replay_revokes_session(client, account, factory):
    _, tokens, headers = account()
    r = client.post(AUTH + "/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["refresh_token"] != tokens["refresh_token"]
    replay = client.post(AUTH + "/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401 and replay.json()["detail"]["code"] == "refresh_reused"
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    assert (
        client.get(
            "/api/v1/me", headers={"Authorization": "Bearer " + r.json()["access_token"]}
        ).status_code
        == 401
    )
    with factory() as db:
        assert db.scalar(select(AuthSession)).revoked_at


def test_forged_refresh_does_not_revoke_session(client, account):
    _, tokens, headers = account()
    fake = tokens["refresh_token"].split(".")[0] + "." + "x" * 43
    assert client.post(AUTH + "/refresh", json={"refresh_token": fake}).status_code == 401
    assert client.get("/api/v1/me", headers=headers).status_code == 200


def test_web_cookies_and_csrf(client, account):
    _, tokens, _ = account(kind="web")
    assert tokens["refresh_token"] is None
    raw = client.cookies.get("biletflow_refresh")
    assert raw
    assert client.post(AUTH + "/refresh", json={}).status_code == 403
    assert (
        client.post(
            AUTH + "/refresh", json={}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert client.post(AUTH + "/refresh", json={"refresh_token": raw}).status_code == 401
    r = client.post(AUTH + "/refresh", json={}, headers={"Origin": "http://testserver"})
    assert r.status_code == 200
    assert "HttpOnly" in r.headers["set-cookie"] and "SameSite=strict" in r.headers["set-cookie"]
    assert r.headers["cache-control"] == "no-store"


def test_logout_and_session_ownership(client, account):
    _, a, ha = account()
    _, b, hb = account()
    a_id = a["refresh_token"].split(".")[0]
    assert client.delete(AUTH + "/sessions/" + a_id, headers=hb).status_code == 404
    assert len(client.get(AUTH + "/sessions", headers=hb).json()) == 1
    assert client.delete(AUTH + "/sessions/" + a_id, headers=ha).status_code == 200
    assert client.get("/api/v1/me", headers=ha).status_code == 401
    assert client.post(AUTH + "/logout", headers=hb).status_code == 200
    assert (
        client.post(AUTH + "/refresh", json={"refresh_token": b["refresh_token"]}).status_code
        == 401
    )


def test_logout_all_and_profile(client, account):
    email, _, headers = account()
    other = client.post(
        AUTH + "/login", json={"email": email, "password": PASSWORD, "client_kind": "scanner"}
    ).json()
    r = client.patch(
        "/api/v1/me",
        headers=headers,
        json={"display_name": " New Name ", "locale": "kk", "analytics_consent": True},
    )
    assert (
        r.status_code == 200
        and r.json()["display_name"] == "New Name"
        and r.json()["locale"] == "kk"
    )
    assert client.patch("/api/v1/me", headers=headers, json={"status": "active"}).status_code == 422
    assert client.post(AUTH + "/logout-all", headers=headers).status_code == 200
    assert (
        client.post(AUTH + "/refresh", json={"refresh_token": other["refresh_token"]}).status_code
        == 401
    )


def test_password_reset_single_use_revokes_sessions(client, account, factory, settings):
    email, tokens, headers = account()
    known = client.post(AUTH + "/password/forgot", json={"email": email})
    unknown = client.post(AUTH + "/password/forgot", json={"email": "missing@example.com"})
    assert known.json() == unknown.json()
    token = latest_token(factory, settings, email, "password_reset")
    assert client.post(AUTH + "/verify-email", json={"token": token}).status_code == 401
    data = {"token": token, "password": "new password long enough"}
    assert client.post(AUTH + "/password/reset", json=data).status_code == 200
    assert client.post(AUTH + "/password/reset", json=data).status_code == 401
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    assert (
        client.post(AUTH + "/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )
    assert (
        client.post(AUTH + "/login", json={"email": email, "password": PASSWORD}).status_code == 401
    )
    assert (
        client.post(
            AUTH + "/login", json={"email": email, "password": data["password"]}
        ).status_code
        == 200
    )


def test_expired_challenge_and_resend(client, factory, settings):
    email = "test@example.com"
    client.post(
        AUTH + "/register", json={"email": email, "password": PASSWORD, "display_name": "Test"}
    )
    old = latest_token(factory, settings, email, "email_verify")
    assert client.post(AUTH + "/verification/resend", json={"email": email}).status_code == 202
    assert client.post(AUTH + "/verify-email", json={"token": old}).status_code == 401
    new = latest_token(factory, settings, email, "email_verify")
    with factory.begin() as db:
        db.execute(
            update(AccountToken).values(
                created_at=now() - timedelta(days=2), expires_at=now() - timedelta(days=1)
            )
        )
    assert client.post(AUTH + "/verify-email", json={"token": new}).status_code == 401


@pytest.mark.parametrize(
    "variant",
    ["expired", "issuer", "audience", "purpose", "unsigned", "wrong-key", "missing-sid", "bad-sub"],
)
def test_invalid_access_tokens(client, account, settings, variant):
    _, tokens, _ = account()
    claims = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    key, alg = settings.jwt_secret.get_secret_value(), "HS256"
    if variant == "expired":
        claims["exp"] = 1
    if variant == "issuer":
        claims["iss"] = "other"
    if variant == "audience":
        claims["aud"] = "other"
    if variant == "purpose":
        claims["type"] = "refresh"
    if variant == "unsigned":
        key, alg = "", "none"
    if variant == "wrong-key":
        key = "w" * 48
    if variant == "missing-sid":
        del claims["sid"]
    if variant == "bad-sub":
        claims["sub"] = "not-a-uuid"
    bad = jwt.encode(claims, key, algorithm=alg)
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer " + bad}).status_code == 401


def test_expired_session_and_suspended_account(client, account, factory):
    _, tokens, headers = account()
    with factory.begin() as db:
        db.execute(
            update(AuthSession).values(
                created_at=now() - timedelta(days=2), expires_at=now() - timedelta(days=1)
            )
        )
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    email, tokens, headers = account()
    with factory.begin() as db:
        db.execute(update(User).where(User.email == email).values(status="suspended"))
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    with factory.begin() as db:
        db.execute(update(User).where(User.email == email).values(status="active"))
    assert client.get("/api/v1/me", headers=headers).status_code == 401


def test_rate_limiting_commits_failures(client, app):
    app.state.settings.rate_identity_limit = 2
    for _ in range(2):
        assert (
            client.post(
                AUTH + "/login", json={"email": "none@example.com", "password": PASSWORD}
            ).status_code
            == 401
        )
    r = client.post(AUTH + "/login", json={"email": "none@example.com", "password": PASSWORD})
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0


def test_simultaneous_refresh_only_one_wins(client, app, account, factory):
    _, tokens, _ = account()

    def refresh(_):
        with TestClient(app) as other:
            return other.post(
                AUTH + "/refresh", json={"refresh_token": tokens["refresh_token"]}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(refresh, range(2)))
    assert sorted(results) == [200, 401]
    with factory() as db:
        assert db.scalar(select(AuthSession)).revoked_at
        assert db.scalar(select(func.count(RefreshToken.id))) == 2


def test_simultaneous_registration_one_account(app, factory):
    def register(_):
        with TestClient(app) as client:
            return client.post(
                AUTH + "/register",
                json={"email": "race@example.com", "password": PASSWORD, "display_name": "Race"},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(register, range(2))) == [202, 202]
    with factory() as db:
        assert db.scalar(select(func.count(User.id))) == 1
        assert db.scalar(select(func.count(AccountToken.id))) == 1


def test_database_fk_and_immutable_audit(client, account, factory):
    account()
    with pytest.raises(IntegrityError), factory.begin() as db:
        db.add(
            AuthSession(
                user_id=uuid4(),
                refresh_token_hash="fake",
                client_kind="web",
                expires_at=now() + timedelta(days=1),
            )
        )
    with pytest.raises(DBAPIError), factory.begin() as db:
        db.execute(update(AuditLog).values(description="tamper"))
    with pytest.raises(DBAPIError), factory.begin() as db:
        db.execute(text("DELETE FROM biletflow.audit_log"))


def test_anonymous_health_and_private_access(client):
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").status_code == 200
    assert client.get("/api/v1/me").status_code == 401
    assert client.get(AUTH + "/sessions").status_code == 401
