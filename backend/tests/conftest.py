import os
from datetime import timedelta
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
from app.security import challenge_value, now
from app.seed import seed_catalog, seed_id

API = "/api/v1"


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


@pytest.fixture
def setup(client, account, factory):
    seed_catalog(factory)

    def create(visibility="public", assigned=False, headers=None):
        headers = headers or account()[2]
        org = client.post(
            API + "/organizations",
            headers=headers,
            json={"name": "Demo Organizer", "contact_email": "organizer@example.com"},
        )
        assert org.status_code == 201, org.text
        data = {
            "category_id": str(seed_id("category-community")),
            "venue_id": str(seed_id("venue-campus")),
            "title": "Campus Concert",
            "description": "Demo event",
            "capacity": 12,
            "visibility": visibility,
            "starts_at": (now() + timedelta(days=10)).isoformat(),
            "ends_at": (now() + timedelta(days=10, hours=2)).isoformat(),
            "registration_opens_at": (now() - timedelta(days=1)).isoformat(),
            "registration_closes_at": (now() + timedelta(days=9)).isoformat(),
            "admission_opens_at": (now() + timedelta(days=10, minutes=-30)).isoformat(),
            "admission_closes_at": (now() + timedelta(days=10, hours=1)).isoformat(),
            "refund_cutoff_at": (now() + timedelta(days=8)).isoformat(),
        }
        if assigned:
            data.update(seating_mode="assigned", venue_layout_id=str(seed_id("layout-campus")))
        event = client.post(
            API + f"/organizations/{org.json()['id']}/events", headers=headers, json=data
        )
        assert event.status_code == 201, event.text
        ticket_data = {
            "name": "General admission",
            "kind": "free",
            "price_minor": 0,
            "quantity_limit": 12,
            "per_order_limit": 5,
            "sales_open_at": data["registration_opens_at"],
            "sales_close_at": data["registration_closes_at"],
        }
        ticket = client.post(
            API + f"/events/{event.json()['id']}/ticket-types", headers=headers, json=ticket_data
        )
        assert ticket.status_code == 201, ticket.text
        return {
            "headers": headers,
            "org": org.json(),
            "event": event.json(),
            "data": data,
            "ticket": ticket.json(),
            "ticket_data": ticket_data,
        }

    return create
