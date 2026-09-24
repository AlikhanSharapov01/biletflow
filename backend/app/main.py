import base64
import hashlib
import hmac
import secrets
from contextlib import asynccontextmanager
from datetime import timedelta
from urllib.parse import urlencode
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text, update
from sqlalchemy.exc import SQLAlchemyError

from . import schemas as s
from .config import Settings
from .db import database
from .google import GoogleClient
from .models import AccountToken, AuthSession, ExternalIdentity, OAuthAttempt, User
from .security import (
    DUMMY_PASSWORD,
    access_token,
    decode_access,
    derive,
    digest,
    fail,
    now,
    passwords,
    token_id,
)
from .service import (
    audit,
    eligible,
    email_lock,
    locked_user,
    new_session,
    queue_challenge,
    rate_limit,
    revoke_all,
    rotate_refresh,
    valid_session,
)

bearer = HTTPBearer(auto_error=False)
REFRESH_COOKIE = "biletflow_refresh"
FLOW_COOKIE = "biletflow_oauth"
AUTH_PATH = "/api/v1/auth"


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    engine, factory = database(settings.database_url.get_secret_value())

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(title="BiletFlow API", version="0.1.0", lifespan=lifespan)
    app.state.settings, app.state.engine, app.state.sessions = settings, engine, factory
    app.state.google = GoogleClient(settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        # FastAPI's default validation body includes the input (possibly a password/token).
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "invalid_input",
                    "fields": [
                        {"location": list(e["loc"]), "type": e["type"]} for e in error.errors()
                    ],
                }
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, error):
        # Never expose SQL parameters, credential hashes, or connection details.
        return JSONResponse(status_code=503, content={"detail": {"code": "database_unavailable"}})

    def principal(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if credentials is None or len(credentials.credentials) > 8192:
            fail()
        return decode_access(settings, credentials.credentials)

    def origin(request, required=False):
        value = request.headers.get("origin")
        if (required and not value) or (value and value not in settings.allowed_origins):
            fail("invalid_origin", 403)

    def limit(request, operation, identity=None):
        origin(request)
        rate_limit(
            factory,
            settings,
            request.client.host if request.client else "unknown",
            operation,
            identity,
        )

    def pair(response, session, raw):
        if session.client_kind == "web":
            response.set_cookie(
                REFRESH_COOKIE,
                raw,
                httponly=True,
                secure=settings.cookie_secure,
                samesite="strict",
                path=AUTH_PATH,
                max_age=max(0, int((session.expires_at - now()).total_seconds())),
            )
        return s.TokenPair(
            access_token=access_token(settings, session),
            expires_in=min(
                settings.access_minutes * 60,
                max(0, int((session.expires_at - now()).total_seconds())),
            ),
            refresh_token=raw if session.client_kind == "scanner" else None,
        )

    def clear_cookie(response):
        response.delete_cookie(
            REFRESH_COOKIE,
            path=AUTH_PATH,
            secure=settings.cookie_secure,
            httponly=True,
            samesite="strict",
        )

    @app.get("/health/live", tags=["health"])
    def live():
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    def ready():
        try:
            with factory() as db:
                db.execute(select(User.id).limit(1))
        except SQLAlchemyError:
            raise HTTPException(503, detail={"code": "database_unavailable"}) from None
        return {"status": "ready"}

    @app.post(AUTH_PATH + "/register", response_model=s.Message, status_code=202, tags=["auth"])
    def register(data: s.Register, request: Request):
        limit(request, "register", data.email)
        password_hash = passwords.hash(data.password)
        with factory.begin() as db:
            email_lock(db, data.email)
            user = db.scalar(select(User).where(User.email == data.email).with_for_update())
            if not user:
                user = User(
                    email=data.email,
                    password_hash=password_hash,
                    display_name=data.display_name.strip(),
                    locale=data.locale,
                )
                db.add(user)
                db.flush()
                queue_challenge(db, settings, user, "email_verify")
                audit(db, user, "auth.registered")
        return {"code": "registration_received"}

    @app.post(
        AUTH_PATH + "/verification/resend", response_model=s.Message, status_code=202, tags=["auth"]
    )
    def resend(data: s.EmailInput, request: Request):
        limit(request, "resend", data.email)
        with factory.begin() as db:
            user = db.scalar(select(User).where(User.email == data.email).with_for_update())
            if user and user.status == "active" and user.email_verified_at is None:
                queue_challenge(db, settings, user, "email_verify")
                audit(db, user, "auth.verification_requested")
        return {"code": "verification_requested"}

    def consume_account_token(db, value, purpose):
        identifier = token_id(value)
        candidate = db.get(AccountToken, identifier)
        if not candidate:
            fail("invalid_token")
        user = locked_user(db, candidate.user_id)
        token = db.scalar(
            select(AccountToken)
            .where(AccountToken.id == identifier)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if (
            not user
            or user.status != "active"
            or token.purpose != purpose
            or token.consumed_at
            or token.expires_at <= now()
            or not hmac.compare_digest(token.token_hash, digest(value))
        ):
            fail("invalid_token")
        token.consumed_at = now()
        return user

    @app.post(AUTH_PATH + "/verify-email", response_model=s.Message, tags=["auth"])
    def verify_email(data: s.TokenInput, request: Request):
        limit(request, "verify")
        with factory.begin() as db:
            user = consume_account_token(db, data.token, "email_verify")
            user.email_verified_at = user.email_verified_at or now()
            user.updated_at = now()
            audit(db, user, "auth.email_verified")
        return {"code": "email_verified"}

    @app.post(AUTH_PATH + "/login", response_model=s.TokenPair, tags=["auth"])
    def login(data: s.Login, request: Request, response: Response):
        limit(request, "login", data.email)
        with factory.begin() as db:
            user = db.scalar(select(User).where(User.email == data.email).with_for_update())
            valid, updated_hash = passwords.verify_and_update(
                data.password, user.password_hash if user and user.password_hash else DUMMY_PASSWORD
            )
            if not valid or not user or not user.password_hash:
                fail()
            eligible(user)
            if updated_hash:
                user.password_hash = updated_hash
            session, raw = new_session(db, settings, user, data.client_kind)
        return pair(response, session, raw)

    @app.post(AUTH_PATH + "/refresh", response_model=s.TokenPair, tags=["auth"])
    def refresh(data: s.Refresh, request: Request, response: Response):
        limit(request, "refresh")
        raw = data.refresh_token or request.cookies.get(REFRESH_COOKIE)
        if not raw or len(raw) > 2048:
            fail("invalid_token")
        cookie_mode = data.refresh_token is None
        if cookie_mode:
            origin(request, required=True)
        identifier = token_id(raw)
        with factory.begin() as db:
            candidate = db.get(AuthSession, identifier)
            if not candidate:
                fail("invalid_token")
            user, session = valid_session(db, candidate.user_id, identifier, lock=True)
            if (session.client_kind == "web") != cookie_mode:
                fail("invalid_token")
            replacement = rotate_refresh(db, session, raw)
        # Commit replay revocation even though the HTTP result is a failure.
        if replacement is None:
            fail("refresh_reused")
        return pair(response, session, replacement)

    @app.post(AUTH_PATH + "/logout", response_model=s.Message, tags=["auth"])
    def logout(response: Response, ids=Depends(principal)):
        with factory.begin() as db:
            user, session = valid_session(db, *ids, lock=True)
            session.revoked_at = now()
            audit(db, user, "auth.logged_out", session.id, "auth_session")
        clear_cookie(response)
        return {"code": "logged_out"}

    @app.post(AUTH_PATH + "/logout-all", response_model=s.Message, tags=["auth"])
    def logout_all(response: Response, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            revoke_all(db, user)
            audit(db, user, "auth.all_sessions_revoked")
        clear_cookie(response)
        return {"code": "logged_out"}

    @app.post(
        AUTH_PATH + "/password/forgot", response_model=s.Message, status_code=202, tags=["auth"]
    )
    def forgot(data: s.EmailInput, request: Request):
        limit(request, "forgot", data.email)
        with factory.begin() as db:
            user = db.scalar(select(User).where(User.email == data.email).with_for_update())
            if user and user.status == "active" and user.email_verified_at:
                queue_challenge(db, settings, user, "password_reset")
                audit(db, user, "auth.password_reset_requested")
        return {"code": "password_reset_requested"}

    @app.post(AUTH_PATH + "/password/reset", response_model=s.Message, tags=["auth"])
    def reset(data: s.Reset, request: Request, response: Response):
        limit(request, "reset")
        password_hash = passwords.hash(data.password)
        with factory.begin() as db:
            user = consume_account_token(db, data.token, "password_reset")
            user.password_hash, user.updated_at = password_hash, now()
            revoke_all(db, user)
            db.execute(
                update(AccountToken)
                .where(
                    AccountToken.user_id == user.id,
                    AccountToken.purpose == "password_reset",
                    AccountToken.consumed_at.is_(None),
                )
                .values(consumed_at=now())
            )
            audit(db, user, "auth.password_reset")
        clear_cookie(response)
        return {"code": "password_reset"}

    @app.get("/api/v1/me", response_model=s.Profile, tags=["account"])
    def me(ids=Depends(principal)):
        with factory() as db:
            return valid_session(db, *ids)[0]

    @app.patch("/api/v1/me", response_model=s.Profile, tags=["account"])
    def update_me(data: s.ProfileUpdate, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            for key, value in data.model_dump(exclude_none=True).items():
                setattr(user, key, value.strip() if key == "display_name" else value)
                if key == "analytics_consent":
                    user.consent_recorded_at = now()
            user.updated_at = now()
            audit(db, user, "auth.profile_updated")
        return user

    @app.get(AUTH_PATH + "/sessions", response_model=list[s.SessionView], tags=["account"])
    def sessions(
        ids=Depends(principal),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            return list(
                db.scalars(
                    select(AuthSession)
                    .where(AuthSession.user_id == user.id)
                    .order_by(AuthSession.created_at.desc(), AuthSession.id)
                    .limit(limit)
                    .offset(offset)
                )
            )

    @app.delete(AUTH_PATH + "/sessions/{session_id}", response_model=s.Message, tags=["account"])
    def revoke_session(session_id: UUID, ids=Depends(principal)):
        with factory.begin() as db:
            # User lock serializes every session mutation for this account.
            user, _ = valid_session(db, *ids, lock=True)
            target = db.scalar(
                select(AuthSession)
                .where(AuthSession.id == session_id, AuthSession.user_id == user.id)
                .with_for_update()
            )
            if not target:
                fail("session_not_found", 404)
            target.revoked_at = target.revoked_at or now()
            audit(db, user, "auth.session_revoked", target.id, "auth_session")
        return {"code": "session_revoked"}

    def begin_google(request, response, ids=None):
        limit(request, "google_start")
        if not settings.google_client_id or not settings.google_client_secret.get_secret_value():
            fail("google_not_configured", 503)
        state, browser = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        identifier = uuid4()
        with factory.begin() as db:
            link_session = valid_session(db, *ids, lock=True)[1].id if ids else None
            db.add(
                OAuthAttempt(
                    id=identifier,
                    state_hash=digest(state),
                    browser_hash=digest(browser),
                    link_session_id=link_session,
                    expires_at=now() + timedelta(minutes=10),
                )
            )
        verifier = derive(settings, "google_pkce", identifier)
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .rstrip(b"=")
            .decode()
        )
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": derive(settings, "google_nonce", identifier),
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        response.set_cookie(
            FLOW_COOKIE,
            browser,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            max_age=600,
            path=AUTH_PATH + "/google",
        )
        return {
            "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
        }

    @app.post(AUTH_PATH + "/google/start", response_model=s.AuthorizationURL, tags=["google"])
    def google_start(request: Request, response: Response):
        return begin_google(request, response)

    @app.post(AUTH_PATH + "/google/link", response_model=s.AuthorizationURL, tags=["google"])
    def google_link(request: Request, response: Response, ids=Depends(principal)):
        return begin_google(request, response, ids)

    @app.get(AUTH_PATH + "/google/callback", response_model=s.TokenPair, tags=["google"])
    def google_callback(
        request: Request,
        response: Response,
        state: str = Query(max_length=512),
        code: str | None = Query(None, max_length=4096),
        error: str | None = Query(None, max_length=128),
    ):
        limit(request, "google_callback")
        browser = request.cookies.get(FLOW_COOKIE, "")
        with factory.begin() as db:
            attempt = db.scalar(
                select(OAuthAttempt)
                .where(OAuthAttempt.state_hash == digest(state))
                .with_for_update()
            )
            if (
                not attempt
                or attempt.consumed_at
                or attempt.expires_at <= now()
                or not hmac.compare_digest(attempt.browser_hash, digest(browser))
            ):
                fail("invalid_oauth_state")
            attempt.consumed_at = now()
        response.delete_cookie(FLOW_COOKIE, path=AUTH_PATH + "/google")
        if error or not code:
            fail("google_authorization_denied", 400)
        # No row locks or DB transaction span Google's network calls.
        google_token = app.state.google.exchange(code, derive(settings, "google_pkce", attempt.id))
        claims = app.state.google.verify(google_token, derive(settings, "google_nonce", attempt.id))
        with factory.begin() as db:
            email_lock(db, claims["email"])
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:subject, 1))"),
                {"subject": claims["sub"]},
            )
            identity = db.scalar(
                select(ExternalIdentity).where(
                    ExternalIdentity.provider == "google", ExternalIdentity.subject == claims["sub"]
                )
            )
            if attempt.link_session_id:
                link_session = db.get(AuthSession, attempt.link_session_id)
                user, _ = valid_session(db, link_session.user_id, link_session.id, lock=True)
                if identity and identity.user_id != user.id:
                    fail("google_identity_already_linked", 409)
                other = db.scalar(
                    select(ExternalIdentity).where(
                        ExternalIdentity.user_id == user.id, ExternalIdentity.provider == "google"
                    )
                )
                if other and other.subject != claims["sub"]:
                    fail("google_identity_already_linked", 409)
            elif identity:
                user = locked_user(db, identity.user_id)
                eligible(user)
            else:
                existing = db.scalar(select(User).where(User.email == claims["email"]))
                if existing:
                    fail("account_link_required", 409)
                name = claims.get("name")
                user = User(
                    email=claims["email"],
                    display_name=(
                        name[:100] if isinstance(name, str) and name.strip() else "BiletFlow user"
                    ),
                    password_hash=None,
                    email_verified_at=now(),
                )
                db.add(user)
                db.flush()
                audit(db, user, "auth.google_registered")
            if not identity:
                db.add(ExternalIdentity(user_id=user.id, provider="google", subject=claims["sub"]))
                audit(db, user, "auth.google_linked")
            session, raw = new_session(db, settings, user, "web")
        return pair(response, session, raw)

    from .event_api import router as event_router
    from .organization_api import router as organization_router

    app.include_router(organization_router(factory, settings, principal))
    app.include_router(event_router(factory, settings, principal))
    return app
