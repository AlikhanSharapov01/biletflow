from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update

from app.checkout_models import OrderItem, Ticket, TicketOrder
from app.email_templates import copy
from app.models import User
from app.notification_service import CHANNELS, render, resolve_locale
from app.security import challenge_value
from app.seed import seed_catalog
from app.worker import deliver_once, support_message, ticket_message


@pytest.mark.parametrize(
    "locale,word",
    [("kk", "билет"), ("ru", "билет"), ("en", "ticket"), (None, "ticket"), ("fr", "ticket")],
)
def test_ticket_email_recipient_locale(settings, locale, word):
    user = SimpleNamespace(locale=locale, status="active", email_verified_at=True)
    ticket = SimpleNamespace(
        id=uuid4(), status="valid", order_item_id=uuid4(), recipient_user_id=uuid4()
    )
    item = SimpleNamespace(
        order_id=uuid4(),
        recipient_name="Original name",
        recipient_email="recipient@example.com",
        ticket_type_name="Original type",
        seat_snapshot={"section_label": "S", "row_label": "R", "seat_label": "1"},
    )
    order = SimpleNamespace(
        event_snapshot={
            "title": "Original title",
            "starts_at": "2026-11-09T12:00:00+00:00",
            "time_zone": "Asia/Almaty",
            "venue_name": "Original venue",
            "venue_city": "Original city",
        }
    )
    rows = {Ticket: ticket, OrderItem: item, TicketOrder: order, User: user}
    db = SimpleNamespace(get=lambda model, identifier: rows[model], scalar=lambda query: user)
    message = ticket_message(db, settings, "identifier", ticket.id, (b"pdf", "ticket.pdf"))
    assert word in str(message["Subject"])
    body = message.get_body(preferencelist=("plain",)).get_content()
    for original in (
        "Original name",
        "Original title",
        "Original type",
        "Original venue",
        "recipient@example.com",
        str(ticket.id),
    ):
        assert original in body


@pytest.mark.parametrize("locale", ["kk", "ru", "en", None, "fr"])
@pytest.mark.parametrize(
    "reason", ["case_opened", "message", "status", "assignment", "escalation", "unknown"]
)
def test_support_email_locale_and_privacy(settings, monkeypatch, locale, reason):
    user = SimpleNamespace(
        locale=locale, status="active", email_verified_at=True, email="recipient@example.com"
    )
    case = SimpleNamespace(id=uuid4(), subject="PRIVATE SUBJECT", body="PRIVATE BODY")
    db = SimpleNamespace(get=lambda model, identifier: user if model is User else case)
    monkeypatch.setattr("app.worker.case_roles", lambda *args: {"requester"})
    payload = {"recipient_user_id": str(uuid4()), "case_id": str(case.id), "reason": reason}
    message = support_message(db, settings, "identifier", payload)
    assert str(message["Subject"]) == "BiletFlow: " + copy(
        reason if reason != "unknown" else "support_update", locale
    )
    body = message.get_content()
    assert copy("sign_in", locale) in body and str(case.id) in body
    assert "PRIVATE" not in body


@pytest.mark.parametrize("locale", ["kk", "ru", "en"])
def test_auth_and_invitation_emails_follow_intended_recipient(
    client, setup, account, factory, settings, locale
):
    from app.models import AccountToken
    from tests.conftest import PASSWORD

    email = f"{uuid4().hex}@example.com"
    result = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "display_name": "Original name",
            "locale": locale,
        },
    )
    assert result.status_code == 202
    sent = []
    while deliver_once(factory, settings, sent.append):
        pass
    verification = next(m for m in sent if m["To"] == email)
    assert verification["Subject"] == copy("verify", locale)
    with factory() as db:
        token = db.scalar(select(AccountToken).join(User).where(User.email == email))
        value = challenge_value(settings, token.purpose, token.id)
    assert "#token=" + value in verification.get_content()
    assert copy("expires", locale) in verification.get_content()
    assert client.post("/api/v1/auth/verify-email", json={"token": value}).status_code == 200
    assert client.post("/api/v1/auth/password/forgot", json={"email": email}).status_code == 202
    sent = []
    while deliver_once(factory, settings, sent.append):
        pass
    reset = next(m for m in sent if m["To"] == email)
    assert reset["Subject"] == copy("reset", locale)
    assert (
        "/reset-password#token=" in reset.get_content()
        and copy("ignore", locale) in reset.get_content()
    )
    f = setup()
    invitation = client.post(
        f"/api/v1/organizations/{f['org']['id']}/invitations",
        headers=f["headers"],
        json={"email": email},
    )
    assert invitation.status_code == 201
    sent = []
    while deliver_once(factory, settings, sent.append):
        pass
    invite = next(m for m in sent if m["To"] == email)
    assert invite["Subject"] == copy("invitation_subject", locale)
    assert copy("invitation", locale, organization=f["org"]["name"]) in invite.get_content()
    assert (
        "#token=" + challenge_value(settings, "staff_invite", invitation.json()["id"])
        in invite.get_content()
    )


@pytest.mark.parametrize("locale", ["kk", "ru", "en", None, "fr"])
@pytest.mark.parametrize("kind", CHANNELS)
def test_notification_languages(settings, kind, locale):
    payload = {
        "title": "Original title",
        "event_id": "event-id",
        "case_id": "case-id",
        "ticket_id": "ticket-id",
        "order_id": "order-id",
        "status": "sent",
    }
    result = render(settings, kind, locale, payload)
    assert resolve_locale(locale) == (locale if locale in ("kk", "ru", "en") else "en")
    assert result == render(settings, kind, resolve_locale(locale), payload)
    assert all(result)
    assert settings.frontend_url.rstrip("/") in result[1]
    if locale in ("kk", "ru"):
        assert result != render(settings, kind, "en", payload)


@pytest.mark.parametrize("locale", ["kk", "ru", "en", "fr", None])
def test_category_selected_name(client, factory, locale):
    seed_catalog(factory)
    response = client.get("/api/v1/categories", params={} if locale is None else {"locale": locale})
    assert response.status_code == 200
    for row in response.json():
        assert row["name"] == row["name_" + (locale if locale in ("kk", "ru", "en") else "en")]


@pytest.mark.parametrize("locale", ["kk", "ru", "en", None, "unverified"])
def test_ticket_mailbox_locale_does_not_claim(client, setup, account, factory, settings, locale):
    from tests.conftest import PASSWORD
    from tests.test_admission import free_ticket, published

    email = f"{uuid4().hex}@example.com"
    if locale == "unverified":
        assert (
            client.post(
                "/api/v1/auth/register",
                json={
                    "email": email,
                    "password": PASSWORD,
                    "display_name": "Recipient",
                    "locale": "kk",
                },
            ).status_code
            == 202
        )
    elif locale:
        account(email)
        with factory.begin() as db:
            db.execute(update(User).where(User.email == email).values(locale=locale))
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f, recipient=email)
    with factory() as db:
        before = db.get(Ticket, UUID(ticket["id"])).recipient_user_id
        message = ticket_message(db, settings, "identifier", UUID(ticket["id"]))
        assert message["To"] == email
        assert message["Subject"] == copy("ticket_subject", locale, title=f["event"]["title"])
        assert db.get(Ticket, UUID(ticket["id"])).recipient_user_id == before
        if locale in (None, "unverified"):
            assert before is None


@pytest.mark.parametrize(
    "key", ["verify", "reset", "invitation_subject", "invitation", "expires", "ignore"]
)
@pytest.mark.parametrize("locale", [None, "fr"])
def test_direct_auth_invitation_copy_english_fallback(key, locale):
    assert copy(key, locale, organization="Original organization") == copy(
        key, "en", organization="Original organization"
    )


@pytest.mark.parametrize("unverified", [False, True])
def test_invitation_without_verified_recipient_uses_english(
    client, setup, factory, settings, unverified
):
    from tests.conftest import PASSWORD

    email = f"{uuid4().hex}@example.com"
    if unverified:
        assert (
            client.post(
                "/api/v1/auth/register",
                json={
                    "email": email,
                    "password": PASSWORD,
                    "display_name": "Recipient",
                    "locale": "kk",
                },
            ).status_code
            == 202
        )
    f = setup()
    invitation = client.post(
        f"/api/v1/organizations/{f['org']['id']}/invitations",
        headers=f["headers"],
        json={"email": email},
    )
    assert invitation.status_code == 201
    sent = []
    while deliver_once(factory, settings, sent.append):
        pass
    invite = next(m for m in sent if m["Subject"] == "BiletFlow organizer invitation")
    assert invite["To"] == email
    assert "You are invited to join " + f["org"]["name"] in invite.get_content()
