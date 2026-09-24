from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.google import GoogleClient
from app.models import ExternalIdentity, OAuthAttempt, User
from app.security import derive, now

AUTH = "/api/v1/auth"


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def signed_identity(key, settings, expected_nonce, **changes):
    claims = {
        "iss": "https://accounts.google.com",
        "aud": settings.google_client_id,
        "sub": "google-subject-1",
        "email": "google@example.com",
        "email_verified": True,
        "iat": now(),
        "exp": now() + timedelta(minutes=5),
        "nonce": expected_nonce,
        "name": "Google User",
    }
    claims.update(changes)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})


def start(client, path="/google/start", headers=None):
    r = client.post(AUTH + path, headers=headers)
    assert r.status_code == 200, r.text
    params = parse_qs(urlparse(r.json()["authorization_url"]).query)
    assert params["code_challenge_method"] == ["S256"]
    return params


@pytest.fixture
def google_tokens(app, settings, signing_key, monkeypatch):
    claims = {}
    monkeypatch.setattr(
        app.state.google.keys,
        "get_signing_key_from_jwt",
        lambda _: SimpleNamespace(key=signing_key.public_key()),
    )

    def exchange(code, verifier):
        with app.state.sessions() as db:
            attempt = db.scalar(
                select(OAuthAttempt).order_by(OAuthAttempt.created_at.desc()).limit(1)
            )
        assert verifier == derive(settings, "google_pkce", attempt.id)
        return signed_identity(
            signing_key, settings, derive(settings, "google_nonce", attempt.id), **claims
        )

    monkeypatch.setattr(app.state.google, "exchange", exchange)
    return claims


def callback(client, params):
    return client.get(
        AUTH + "/google/callback", params={"state": params["state"][0], "code": "test-code"}
    )


def test_google_register_repeat_and_stable_subject(client, factory, google_tokens):
    r = callback(client, start(client))
    assert r.status_code == 200, r.text
    with factory() as db:
        assert db.scalar(select(User)).password_hash is None
        assert db.scalar(select(User)).email_verified_at
        assert db.scalar(select(ExternalIdentity)).subject == "google-subject-1"
    google_tokens["email"] = "changed@example.com"
    assert callback(client, start(client)).status_code == 200
    with factory() as db:
        assert db.scalar(select(func.count(User.id))) == 1
        assert db.scalar(select(User)).email == "google@example.com"


def test_no_automatic_link_then_explicit_link(client, account, google_tokens, factory):
    _, _, headers = account("google@example.com")
    denied = callback(client, start(client))
    assert denied.status_code == 409 and denied.json()["detail"]["code"] == "account_link_required"
    assert callback(client, start(client, "/google/link", headers)).status_code == 200
    assert callback(client, start(client)).status_code == 200
    with factory() as db:
        assert db.scalar(select(func.count(User.id))) == 1
        assert db.scalar(select(func.count(ExternalIdentity.id))) == 1


def test_google_link_revoked_session_rejected(client, account, google_tokens):
    _, _, headers = account()
    params = start(client, "/google/link", headers)
    client.post(AUTH + "/logout", headers=headers)
    assert callback(client, params).status_code == 401


def test_google_cannot_relink_to_other_user(client, account, google_tokens):
    assert callback(client, start(client)).status_code == 200
    _, _, headers = account()
    assert callback(client, start(client, "/google/link", headers)).status_code == 409


def test_oauth_browser_binding_state_and_replay(client, app, google_tokens):
    params = start(client)
    with TestClient(app) as stranger:
        assert callback(stranger, params).status_code == 401
    assert callback(client, {"state": ["wrong"]}).status_code == 401
    assert callback(client, params).status_code == 200
    assert callback(client, params).status_code == 401


def test_oauth_expired_and_provider_denial(client, factory, google_tokens):
    params = start(client)
    with factory.begin() as db:
        db.execute(
            update(OAuthAttempt).values(
                created_at=now() - timedelta(hours=2), expires_at=now() - timedelta(hours=1)
            )
        )
    assert callback(client, params).status_code == 401
    params = start(client)
    r = client.get(
        AUTH + "/google/callback", params={"state": params["state"][0], "error": "access_denied"}
    )
    assert r.status_code == 400
    assert callback(client, params).status_code == 401


@pytest.mark.parametrize(
    "changes",
    [
        {"iss": "https://attacker.example"},
        {"aud": "other-client"},
        {"exp": 1},
        {"nonce": "different"},
        {"email_verified": False},
        {"email_verified": "true"},
        {"azp": "other-client"},
        {"sub": ""},
        {"email": "invalid"},
    ],
)
def test_google_claim_validation(settings, signing_key, monkeypatch, changes):
    provider = GoogleClient(settings)
    monkeypatch.setattr(
        provider.keys,
        "get_signing_key_from_jwt",
        lambda _: SimpleNamespace(key=signing_key.public_key()),
    )
    token = signed_identity(signing_key, settings, "expected", **changes)
    with pytest.raises(HTTPException) as error:
        provider.verify(token, "expected")
    assert error.value.status_code == 401


def test_google_signature_and_missing_claim(settings, signing_key, monkeypatch):
    provider = GoogleClient(settings)
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(
        provider.keys, "get_signing_key_from_jwt", lambda _: SimpleNamespace(key=other.public_key())
    )
    with pytest.raises(HTTPException):
        provider.verify(signed_identity(signing_key, settings, "expected"), "expected")
    monkeypatch.setattr(
        provider.keys,
        "get_signing_key_from_jwt",
        lambda _: SimpleNamespace(key=signing_key.public_key()),
    )
    token = jwt.encode({"sub": "subject"}, signing_key, algorithm="RS256")
    with pytest.raises(HTTPException):
        provider.verify(token, "expected")


def test_google_exchange_failure_is_safe(settings, monkeypatch):
    def broken(*args, **kwargs):
        raise httpx.ConnectError("sensitive-provider-details")

    monkeypatch.setattr(httpx, "post", broken)
    with pytest.raises(HTTPException) as error:
        GoogleClient(settings).exchange("secret-code", "secret-verifier")
    assert error.value.status_code == 502
    assert "secret" not in str(error.value.detail)


def test_google_disabled_without_credentials(client, app):
    app.state.settings.google_client_id = ""
    assert client.post(AUTH + "/google/start").status_code == 503
