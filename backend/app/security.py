import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from fastapi import HTTPException
from pwdlib import PasswordHash

passwords = PasswordHash.recommended()
DUMMY_PASSWORD = passwords.hash(secrets.token_urlsafe(32))


def now():
    return datetime.now(UTC)


def fail(code="invalid_credentials", status=401):
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    raise HTTPException(status, detail={"code": code}, headers=headers)


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def derive(settings, purpose, identifier):
    raw = hmac.new(
        settings.challenge_secret.get_secret_value().encode(),
        f"{purpose}:{identifier}".encode(),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def challenge_value(settings, purpose, identifier):
    return f"{identifier}.{derive(settings, purpose, identifier)}"


def access_token(settings, session):
    issued = now()
    expiry = min(issued + timedelta(minutes=settings.access_minutes), session.expires_at)
    claims = {
        "sub": str(session.user_id),
        "sid": str(session.id),
        "jti": str(uuid4()),
        "type": "access",
        "iat": issued,
        "nbf": issued,
        "exp": expiry,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    return jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm="HS256")


def decode_access(settings, token):
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["sub", "sid", "jti", "iat", "nbf", "exp", "type"]},
        )
        if claims["type"] != "access":
            fail()
        return UUID(claims["sub"]), UUID(claims["sid"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        fail()


def token_id(value):
    try:
        identifier, secret = value.split(".", 1)
        if len(secret) != 43:
            fail("invalid_token")
        return UUID(identifier)
    except (ValueError, AttributeError):
        fail("invalid_token")
