import hmac
import secrets
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import case, func, select, text, update
from sqlalchemy.dialects.postgresql import insert

from .models import AccountToken, AuditLog, AuthSession, OutboxJob, RateBucket, RefreshToken, User
from .security import challenge_value, derive, digest, fail, now


def audit(db, user, action, entity_id=None, entity_type="app_user"):
    db.add(
        AuditLog(
            actor_user_id=user.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id or user.id,
            description=action,
            correlation_id=uuid4(),
        )
    )


def email_lock(db, email):
    # Serializes concurrent creation/linking of the same normalized identity.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:email, 0))"), {"email": email})


def locked_user(db, identifier):
    return db.scalar(select(User).where(User.id == identifier).with_for_update())


def eligible(user):
    if not user or user.status != "active" or user.email_verified_at is None:
        fail()


def valid_session(db, user_id, session_id, *, lock=False):
    user = locked_user(db, user_id) if lock else db.get(User, user_id)
    eligible(user)
    query = select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user_id)
    session = db.scalar(
        query.with_for_update().execution_options(populate_existing=True) if lock else query
    )
    if not session or session.revoked_at or session.expires_at <= now():
        fail()
    return user, session


def new_session(db, settings, user, client_kind):
    identifier = uuid4()
    raw = f"{identifier}.{secrets.token_urlsafe(32)}"
    session = AuthSession(
        id=identifier,
        user_id=user.id,
        client_kind=client_kind,
        refresh_token_hash=digest(raw),
        expires_at=now() + timedelta(days=settings.session_days),
        last_seen_at=now(),
    )
    db.add(session)
    db.flush()
    db.add(RefreshToken(session_id=session.id, token_hash=digest(raw)))
    audit(db, user, "auth.signed_in", session.id, "auth_session")
    return session, raw


def rotate_refresh(db, session, raw):
    history = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.session_id == session.id, RefreshToken.token_hash == digest(raw))
        .with_for_update()
    )
    if not history:
        fail("invalid_token")
    if history.consumed_at is not None:
        session.revoked_at = now()
        user = db.get(User, session.user_id)
        audit(db, user, "auth.refresh_reuse", session.id, "auth_session")
        return None
    if not hmac.compare_digest(session.refresh_token_hash, digest(raw)):
        fail("invalid_token")
    history.consumed_at = now()
    replacement = f"{session.id}.{secrets.token_urlsafe(32)}"
    session.refresh_token_hash = digest(replacement)
    session.last_seen_at = now()
    db.add(RefreshToken(session_id=session.id, token_hash=digest(replacement)))
    return replacement


def revoke_all(db, user):
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )


def queue_challenge(db, settings, user, purpose):
    db.execute(
        update(AccountToken)
        .where(
            AccountToken.user_id == user.id,
            AccountToken.purpose == purpose,
            AccountToken.consumed_at.is_(None),
        )
        .values(consumed_at=now())
    )
    identifier = uuid4()
    token = AccountToken(
        id=identifier,
        user_id=user.id,
        purpose=purpose,
        token_hash=digest(challenge_value(settings, purpose, identifier)),
        expires_at=now() + timedelta(minutes=30 if purpose == "password_reset" else 1440),
    )
    db.add(token)
    db.add(
        OutboxJob(
            kind="auth_email",
            deduplication_key=f"auth:{identifier}",
            payload={"version": 1, "account_token_id": str(identifier)},
        )
    )


def rate_limit(factory, settings, ip, operation, identity=None):
    # A separate committed transaction also counts rejected login attempts, across API workers.
    keys = [(f"{operation}:ip:{ip}", settings.rate_ip_limit)]
    if identity:
        keys.append((f"{operation}:identity:{identity}", settings.rate_identity_limit))
    exceeded = False
    with factory.begin() as db:
        current = db.scalar(select(func.clock_timestamp()))
        boundary = current - timedelta(seconds=settings.rate_window_seconds)
        for key, limit in sorted(keys):
            statement = insert(RateBucket).values(
                key_hash=derive(settings, "rate", key), window_start=current, attempts=1
            )
            statement = statement.on_conflict_do_update(
                index_elements=[RateBucket.key_hash],
                set_={
                    "window_start": case(
                        (RateBucket.window_start <= boundary, current),
                        else_=RateBucket.window_start,
                    ),
                    "attempts": case(
                        (RateBucket.window_start <= boundary, 1),
                        else_=func.least(RateBucket.attempts + 1, limit + 1),
                    ),
                },
            ).returning(RateBucket.attempts)
            exceeded |= db.scalar(statement) > limit
    if exceeded:
        from fastapi import HTTPException

        raise HTTPException(
            429,
            detail={"code": "rate_limited"},
            headers={"Retry-After": str(settings.rate_window_seconds)},
        )
