"""BF-15/BF-21: people affected by a moderation decision are told, safely and exactly once."""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, update

from app import notification_service
from app.admin_cli import set_admin
from app.models import OutboxJob, User
from app.notification_models import Notification, NotificationDelivery
from app.notification_service import (
    CHANNELS,
    LOCALES,
    MODERATION_NOTICES,
    TEMPLATES,
    enqueue_moderation_notice,
    render,
)
from app.security import now
from tests.test_admin import ADMIN, code, reason
from tests.test_admission import published, staff
from tests.test_notifications import drain, inbox, user_id
from tests.test_paid_orders import paid_event

API = "/api/v1"
SECRET_REASON = "Internal fraud ticket 4711, do not share"


@pytest.fixture
def admin(account, factory):
    email, tokens, headers = account()
    assert set_admin(factory, email, True) == "granted"
    return email, tokens, headers


def intents(factory, notice):
    with factory() as db:
        return list(
            db.scalars(
                select(OutboxJob).where(
                    OutboxJob.kind == "notification_fanout",
                    OutboxJob.deduplication_key.like(f"notify-moderation-{notice}:%"),
                )
            )
        )


def notices(factory, kind, user=None):
    with factory() as db:
        query = select(Notification).where(Notification.kind == kind)
        if user:
            query = query.where(Notification.recipient_user_id == UUID(user))
        return list(db.scalars(query))


def mail_text(message):
    return message["Subject"] + "\n" + message.get_content()


# ------------------------------------------------------------------ user suspension


def test_suspended_user_is_mailed_without_the_reason_and_reinstatement_is_announced(
    client, admin, account, factory, settings
):
    _, _, headers = admin
    email, _, victim = account()
    victim_id = user_id(client, victim)
    with factory.begin() as db:
        db.execute(update(User).where(User.email == email).values(locale="ru"))

    r = client.post(
        ADMIN + f"/users/{victim_id}/suspend", headers=headers, json=reason(SECRET_REASON)
    )
    assert r.status_code == 200, r.text
    action_id = r.json()["id"]
    (job,) = intents(factory, "account_suspended")
    assert job.deduplication_key.endswith(action_id)
    assert SECRET_REASON not in str(job.payload)

    sent = drain(factory, settings)
    suspended = [m for m in sent if "заблокирован" in m["Subject"]]
    assert len(suspended) == 1 and suspended[0]["To"] == email
    assert SECRET_REASON not in mail_text(suspended[0]) and "4711" not in mail_text(suspended[0])
    # The session and inbox are gone: the email is the delivery path.
    assert client.get(API + "/notifications", headers=victim).status_code == 401
    (row,) = notices(factory, "account_suspended", victim_id)
    assert row.locale == "ru" and SECRET_REASON not in str(row.safe_payload)

    r = client.post(
        ADMIN + f"/users/{victim_id}/reinstate", headers=headers, json=reason("Appeal accepted")
    )
    assert r.status_code == 200
    sent = drain(factory, settings)
    (back,) = [m for m in sent if m["To"] == email]
    assert back["Subject"] == "Ваш аккаунт BiletFlow снова активен"
    assert "/sign-in" in back.get_content() and "Appeal accepted" not in mail_text(back)


def test_repeated_and_retried_actions_never_duplicate_the_notice(
    client, admin, account, factory, settings
):
    _, _, headers = admin
    _, _, victim = account()
    victim_id = user_id(client, victim)
    url = ADMIN + f"/users/{victim_id}/suspend"
    assert client.post(url, headers=headers, json=reason()).status_code == 200
    again = client.post(url, headers=headers, json=reason())
    assert again.status_code == 409 and code(again) == "user_already_suspended"
    (job,) = intents(factory, "account_suspended")

    # A retry of the same decision maps to the same intent and the same inbox row.
    with factory.begin() as db:
        enqueue_moderation_notice(
            db,
            "account_suspended",
            job.deduplication_key.rsplit(":", 1)[1],
            user_id=victim_id,
        )
    assert len(intents(factory, "account_suspended")) == 1
    drain(factory, settings)
    drain(factory, settings)
    assert len(notices(factory, "account_suspended", victim_id)) == 1


def test_a_decision_reversed_before_delivery_is_not_announced(
    client, admin, account, factory, settings
):
    _, _, headers = admin
    _, _, victim = account()
    victim_id = user_id(client, victim)
    client.post(ADMIN + f"/users/{victim_id}/suspend", headers=headers, json=reason())
    client.post(ADMIN + f"/users/{victim_id}/reinstate", headers=headers, json=reason())
    sent = drain(factory, settings)
    assert notices(factory, "account_suspended", victim_id) == []
    assert len(notices(factory, "account_reinstated", victim_id)) == 1
    assert all("suspended" not in m["Subject"].lower() for m in sent)


# ------------------------------------------------------------------ delivery outages


def test_delivery_outage_never_reverses_moderation(
    client, admin, account, factory, settings, monkeypatch
):
    _, _, headers = admin
    email, _, victim = account()
    victim_id = user_id(client, victim)
    assert (
        client.post(
            ADMIN + f"/users/{victim_id}/suspend", headers=headers, json=reason()
        ).status_code
        == 200
    )

    def unavailable(message):
        raise OSError("mail server down")

    drain(factory, settings, send=unavailable, limit=10)
    with factory() as db:
        assert db.scalar(select(User.status).where(User.email == email)) == "suspended"
        delivery = db.scalar(
            select(NotificationDelivery).where(NotificationDelivery.channel == "email")
        )
        assert delivery.status == "pending" and delivery.last_error == "email_delivery_failed"
    with factory.begin() as db:
        db.execute(update(NotificationDelivery).values(next_attempt_at=now()))
    assert len(drain(factory, settings)) == 1  # the retry is delivered once the outage ends

    # Even a broken fan-out leaves the decision in place and is retried later.
    other_email, _, other = account()
    other_id = user_id(client, other)

    def broken(db, payload):
        raise RuntimeError("fan-out failed")

    monkeypatch.setattr(notification_service, "expand", broken)
    assert (
        client.post(
            ADMIN + f"/users/{other_id}/suspend", headers=headers, json=reason()
        ).status_code
        == 200
    )
    drain(factory, settings, limit=5)
    with factory() as db:
        assert db.scalar(select(User.status).where(User.email == other_email)) == "suspended"
        jobs = intents(factory, "account_suspended")
        assert len(jobs) == 2
        assert [job.status for job in jobs].count("pending") == 1
        assert max(job.attempt_count for job in jobs) >= 1


# ------------------------------------------------------------------ event and paid sales


def test_event_suspension_notifies_the_organizers_and_not_attendees(
    client, setup, account, factory, settings, admin
):
    _, _, headers = admin
    f = published(client, setup, factory)
    editor = staff(client, settings, account, f, ["event_edit"])
    scanner = staff(client, settings, account, f, ["scan"])
    _, _, attendee = account()
    event_id = f["event"]["id"]
    drain(factory, settings)

    r = client.post(
        ADMIN + f"/events/{event_id}/suspend", headers=headers, json=reason(SECRET_REASON)
    )
    assert r.status_code == 200, r.text
    sent = drain(factory, settings)

    for who in (f["headers"], editor):
        (item,) = [n for n in inbox(client, who) if n["kind"] == "event_suspended"]
        assert f["event"]["title"] in item["title"]
        assert item["target"] == {"type": "organizer_event", "id": event_id}
        assert SECRET_REASON not in str(item)
    for who in (scanner, attendee):
        assert [n for n in inbox(client, who) if n["kind"].startswith("event_")] == []
    assert len(sent) == 2 and all(SECRET_REASON not in mail_text(m) for m in sent)
    assert all(f"/organizer/events/{event_id}" in m.get_content() for m in sent)

    client.post(ADMIN + f"/events/{event_id}/reinstate", headers=headers, json=reason())
    drain(factory, settings)
    assert [n["kind"] for n in inbox(client, editor) if n["kind"].startswith("event_")] == [
        "event_reinstated",
        "event_suspended",
    ]


def test_paid_sales_moderation_notifies_finance_people_once_per_decision(
    client, setup, account, factory, settings, admin
):
    _, _, headers = admin
    f = paid_event(client, setup)
    editor = staff(client, settings, account, f, ["event_edit"])
    event_id = f["event"]["id"]
    drain(factory, settings)
    url = ADMIN + f"/events/{event_id}/paid-sales/suspend"
    key = {"Idempotency-Key": "suspend-paid-sales-1"}

    first = client.post(url, headers=headers | key, json=reason(SECRET_REASON))
    assert first.status_code == 200, first.text
    replay = client.post(url, headers=headers | key, json=reason(SECRET_REASON))
    assert replay.status_code == 200
    again = client.post(url, headers=headers, json=reason(SECRET_REASON))
    assert again.status_code == 409
    assert len(intents(factory, "paid_sales_suspended")) == 1

    sent = drain(factory, settings)
    owner_items = [n for n in inbox(client, f["headers"]) if n["kind"] == "paid_sales_suspended"]
    assert len(owner_items) == 1 and f["event"]["title"] in owner_items[0]["title"]
    assert SECRET_REASON not in str(owner_items[0])
    # Event editors are not finance people, so they are not told about payment decisions.
    assert [n for n in inbox(client, editor) if n["kind"].startswith("paid_sales")] == []
    assert len(sent) == 1 and SECRET_REASON not in mail_text(sent[0])

    done = client.post(
        ADMIN + f"/events/{event_id}/paid-sales/reinstate", headers=headers, json=reason()
    )
    assert done.status_code == 200, done.text
    drain(factory, settings)
    kinds = [n["kind"] for n in inbox(client, f["headers"]) if n["kind"].startswith("paid_sales")]
    assert sorted(kinds) == ["paid_sales_reinstated", "paid_sales_suspended"]


# ------------------------------------------------------------------ templates


@pytest.mark.parametrize("kind", MODERATION_NOTICES)
def test_every_moderation_notice_has_complete_safe_templates(kind, settings):
    assert kind in CHANNELS and set(TEMPLATES[kind]) == set(LOCALES)
    payload = {
        "event_id": str(uuid4()),
        "title": "Spring concert",
        "starts_at": "2026-12-01T10:00:00+00:00",
        "time_zone": "Asia/Almaty",
    }
    subjects = set()
    for locale in LOCALES:
        subject, body = render(settings, kind, locale, payload)
        assert subject and body and "{" not in subject + body
        subjects.add(subject)
    assert len(subjects) == 3


def test_counts_of_notification_rows_are_unchanged_by_failed_moderation(client, admin, factory):
    _, _, headers = admin
    missing = client.post(ADMIN + f"/users/{uuid4()}/suspend", headers=headers, json=reason())
    assert missing.status_code == 404
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(OutboxJob.id)).where(OutboxJob.kind == "notification_fanout")
            )
            == 0
        )
