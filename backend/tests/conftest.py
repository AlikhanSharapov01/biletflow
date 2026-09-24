import os
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.engine import make_url

from app.config import Settings
from app.main import create_app
from app.models import AccountToken, Base, User
from app.security import challenge_value


@pytest.fixture(scope="session")
def settings():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.fail("Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test")
    if not make_url(url).database.endswith("_test"):
        pytest.fail("Refusing destructive test cleanup: database name must end in _test")
    config = Settings(
        _env_file=None,
        database_url=url,
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
        environment="test",
        cookie_secure=False,
        rate_ip_limit=1000,
        rate_identity_limit=1000,
        allowed_origins=["http://testserver"],
        google_client_id="test-client",
        google_client_secret="test-google-secret",
    )
    previous = {
        key: os.environ.get(key) for key in ("DATABASE_URL", "JWT_SECRET", "CHALLENGE_SECRET")
    }
    os.environ.update(DATABASE_URL=url, JWT_SECRET="j" * 48, CHALLENGE_SECRET="c" * 48)
    command.upgrade(Config("alembic.ini"), "head")
    yield config
    for key, value in previous.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


@pytest.fixture
def app(settings):
    app = create_app(settings.model_copy(deep=True))
    with app.state.engine.begin() as connection:
        tables = ", ".join(f'biletflow."{t.name}"' for t in Base.metadata.sorted_tables)
        connection.execute(text(f"TRUNCATE {tables}"))
    yield app
    app.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def factory(app):
    return app.state.sessions


def latest_token(factory, settings, email, purpose):
    with factory() as db:
        token = db.scalar(
            select(AccountToken)
            .join(User)
            .where(User.email == email, AccountToken.purpose == purpose)
            .order_by(AccountToken.created_at.desc())
            .limit(1)
        )
        return challenge_value(settings, purpose, token.id)


PASSWORD = "correct horse battery staple"


@pytest.fixture
def account(client, factory, settings):
    def create(email=None, kind="scanner"):
        email = email or f"{uuid4().hex}@example.com"
        result = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": PASSWORD, "display_name": "Test Attendee"},
        )
        assert result.status_code == 202, result.text
        token = latest_token(factory, settings, email, "email_verify")
        assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
        result = client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD, "client_kind": kind}
        )
        assert result.status_code == 200, result.text
        tokens = result.json()
        return email, tokens, {"Authorization": "Bearer " + tokens["access_token"]}

    return create
