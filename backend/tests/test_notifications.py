from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, update

from app.catalog_models import Event
from app.checkout_models import Ticket
from app.models import OutboxJob, User
from app.notification_models import Notification, NotificationDelivery
from app.notification_service import (
    deliver_notifications_once,
    email_once,
    enqueue_event_notice,
    enqueue_support_notice,
    expand,
    fanout_once,
    resolve_locale,
)
from app.security import now

API = "/api/v1"


def published(client, setup, **options):
    f = setup(**options)
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text
    return f


def buy(client, f, email, headers):
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
    ).json()
    body = {
        "recipients": [
            {"allocation_id": held["allocations"][0]["id"], "name": "Holder", "email": email}
        ]
    }
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def drain(factory, settings, send=None, limit=50):
    sent = []
    for _ in range(limit):
        if not deliver_notifications_once(factory, settings, send or sent.append):
            break
    return sent


def inbox(client, headers, **params):
    r = client.get(API + "/notifications", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def user_id(client, headers):
    return client.get(API + "/me", headers=headers).json()["id"]


def edit_title(client, f, title="Renamed concert"):
    r = client.put(
        API + f"/events/{f['event']['id']}",
        headers=f["headers"],
        json={**f["data"], "title": title},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_event_update_notifies_ticket_holders_by_inbox_and_email(
    client, setup, account, factory, settings
):
    f = published(client, setup)
    email, _, holder = account()
    _, _, bystander = account()
    buy(client, f, email, holder)
    drain(factory, settings)  # clear the ticket_delivered notification
    edit_title(client, f)
    with factory() as db:
        job = db.scalar(
            select(OutboxJob).where(
                OutboxJob.kind == "notification_fanout",
                OutboxJob.deduplication_key.like("notify-event-updated:%"),
            )
        )
        assert job and job.status == "pending"
        assert set(job.payload) == {"version", "notice", "event_id", "calendar_sequence"}
    sent = drain(factory, settings)
    items = inbox(client, holder)
    updated = [n for n in items if n["kind"] == "event_updated"]
    assert len(updated) == 1 and updated[0]["read_at"] is None
    assert updated[0]["target"] == {"type": "event", "id": f["event"]["id"]}
    assert "Renamed concert" in updated[0]["title"] + updated[0]["body"]
    assert updated[0]["locale"] == "ru"
    assert [m["To"] for m in sent] == [email]
    assert "Renamed concert" in sent[0].get_content()
    assert inbox(client, bystander) == []
    # The organizer is not a recipient unless they hold a ticket.
    assert inbox(client, f["headers"]) == []


def test_unrelated_edit_does_not_notify(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    r = client.put(
        API + f"/events/{f['event']['id']}",
        headers=f["headers"],
        json={**f["data"], "refund_cutoff_at": f["data"]["registration_opens_at"]},
    )
    assert r.status_code == 200, r.text
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(OutboxJob.id)).where(
                    OutboxJob.deduplication_key.like("notify-event-updated:%")
                )
            )
            == 0
        )


def test_recipient_locale_and_fallback(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    with factory.begin() as db:
        db.execute(update(User).where(User.email == email).values(locale="kk"))
    edit_title(client, f)
    sent = drain(factory, settings)
    assert sent and sent[0]["Subject"].startswith("Іс-шара өзгерді")
    assert inbox(client, holder, unread_only=True)[0]["locale"] in ("kk",)
    assert resolve_locale("en") == "en" and resolve_locale("fr") == "ru"
    assert resolve_locale(None) == "ru"


def test_replay_creates_no_second_intent(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    edit_title(client, f)
    eid = UUID(f["event"]["id"])
    with factory.begin() as db:
        event = db.get(Event, eid)
        enqueue_event_notice(db, event, "updated")  # replay of the same business operation
        count = db.scalar(
            select(func.count(OutboxJob.id)).where(
                OutboxJob.deduplication_key
                == f"notify-event-updated:{eid}:{event.calendar_sequence}"
            )
        )
        assert count == 1
        payload = {
            "notice": "event_updated",
            "event_id": str(eid),
            "calendar_sequence": event.calendar_sequence,
        }
    drain(factory, settings)
    with factory.begin() as db:
        expand(db, payload)  # even a re-run of the fan-out is deduplicated
        expand(db, payload)
        rows = db.scalar(
            select(func.count(Notification.id)).where(Notification.kind == "event_updated")
        )
        assert rows == 1


def test_cancellation_notification(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    eid = UUID(f["event"]["id"])
    with factory.begin() as db:
        event = db.get(Event, eid)
        event.publication_state = "cancelled"
        event.calendar_sequence += 1
        enqueue_event_notice(db, event, "cancelled")
    sent = drain(factory, settings)
    cancelled = [n for n in inbox(client, holder) if n["kind"] == "event_cancelled"]
    assert len(cancelled) == 1 and "отменено" in cancelled[0]["title"]
    assert sent and sent[0]["To"] == email


def test_cancel_endpoint_enqueues_in_same_transaction(client, setup, factory):
    f = published(client, setup)
    assert (
        client.post(API + f"/events/{f['event']['id']}/cancel", headers=f["headers"]).status_code
        == 200
    )
    with factory() as db:
        job = db.scalar(
            select(OutboxJob).where(OutboxJob.deduplication_key.like("notify-event-cancelled:%"))
        )
        assert job and job.event_id == UUID(f["event"]["id"])


def test_outbox_row_rolls_back_with_business_change(factory, client, setup):
    f = published(client, setup)
    eid = UUID(f["event"]["id"])

    class Boom(Exception):
        pass

    with pytest.raises(Boom):
        with factory.begin() as db:
            event = db.get(Event, eid)
            event.calendar_sequence += 1
            enqueue_event_notice(db, event, "updated")
            raise Boom
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(OutboxJob.id)).where(OutboxJob.kind == "notification_fanout")
            )
            == 0
        )


def test_ticket_delivered_is_in_app_only_and_deduplicated(
    client, setup, account, factory, settings
):
    f = published(client, setup)
    email, _, buyer = account()
    other_email, _, other = account()
    order = buy(client, f, email, buyer)
    ticket_id = order["items"][0]["ticket"]["id"]
    sent = drain(factory, settings)
    items = inbox(client, buyer)
    assert [n["kind"] for n in items] == ["ticket_delivered"]
    assert items[0]["target"] == {"type": "ticket", "id": ticket_id}
    assert sent == []  # the ticket email comes from the existing ticket_delivery_email job
    with factory() as db:
        channels = list(db.scalars(select(NotificationDelivery.channel)))
        assert channels == ["in_app"]
    # A ticket addressed to someone else notifies them only after they claim it.
    buy(client, f, other_email, buyer)
    drain(factory, settings)
    assert inbox(client, other) == []
    assert client.post(API + "/tickets/claim", headers=other).json() == {"claimed": 1}
    drain(factory, settings)
    assert [n["kind"] for n in inbox(client, other)] == ["ticket_delivered"]
    assert client.post(API + "/tickets/claim", headers=other).json() == {"claimed": 0}
    drain(factory, settings)
    assert len(inbox(client, other)) == 1


def test_inbox_pagination_read_state_and_isolation(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    _, _, other = account()
    buy(client, f, email, holder)
    for index in range(3):
        edit_title(client, f, f"Title {index}")
    drain(factory, settings)
    everything = inbox(client, holder)
    assert len(everything) == 4  # ticket_delivered + three updates
    assert everything == sorted(everything, key=lambda n: (n["created_at"], n["id"]), reverse=True)
    first = inbox(client, holder, limit=3)
    rest = inbox(client, holder, limit=3, offset=3)
    assert [n["id"] for n in first + rest] == [n["id"] for n in everything]
    assert client.get(API + "/notifications?limit=0", headers=holder).status_code == 422
    assert client.get(API + "/notifications?limit=101", headers=holder).status_code == 422
    assert client.get(API + "/notifications/unread-count", headers=holder).json() == {"unread": 4}

    target = everything[0]["id"]
    r = client.post(API + f"/notifications/{target}/read", headers=holder)
    assert r.status_code == 200 and r.json()["read_at"]
    stamp = r.json()["read_at"]
    assert (
        client.post(API + f"/notifications/{target}/read", headers=holder).json()["read_at"]
        == stamp
    )
    assert client.get(API + "/notifications/unread-count", headers=holder).json() == {"unread": 3}
    assert len(inbox(client, holder, unread_only=True)) == 3
    # Another account can neither see nor mark it.
    r = client.post(API + f"/notifications/{target}/read", headers=other)
    assert r.status_code == 404 and r.json() == {"detail": {"code": "notification_not_found"}}
    assert client.post(API + f"/notifications/{uuid4()}/read", headers=holder).status_code == 404
    assert client.post(API + "/notifications/read-all", headers=other).json() == {"updated": 0}
    assert client.post(API + "/notifications/read-all", headers=holder).json() == {"updated": 3}
    assert client.get(API + "/notifications/unread-count", headers=holder).json() == {"unread": 0}


def test_notifications_require_sign_in(client):
    assert client.get(API + "/notifications").status_code == 401
    assert client.get(API + "/notifications/unread-count").status_code == 401
    assert client.post(API + "/notifications/read-all").status_code == 401
    assert client.post(f"{API}/notifications/{uuid4()}/read").status_code == 401


def test_email_failure_is_retried_bounded_and_keeps_inbox(
    client, setup, account, factory, settings
):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    edit_title(client, f)

    def broken(message):
        raise OSError(f"smtp password hunter2 for {message['To']}")

    sent = []
    assert fanout_once(factory)
    for attempt in range(1, 6):
        assert email_once(factory, settings, broken)
        with factory.begin() as db:
            delivery = db.scalar(
                select(NotificationDelivery).where(NotificationDelivery.channel == "email")
            )
            assert delivery.attempt_count == attempt
            assert delivery.last_error == "email_delivery_failed"
            assert "hunter2" not in delivery.last_error
            assert delivery.status == ("failed" if attempt == 5 else "pending")
            if delivery.status == "pending":
                assert delivery.next_attempt_at > now()
                delivery.next_attempt_at = now()
    assert not email_once(factory, settings, sent.append)
    assert sent == []
    # The in-app record and the business change survived the failed delivery.
    assert any(n["kind"] == "event_updated" for n in inbox(client, holder))
    assert client.get(API + f"/events/{f['event']['id']}").json()["title"] == "Renamed concert"


def test_failed_delivery_recovers_on_retry(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    edit_title(client, f)
    assert fanout_once(factory)

    def broken(message):
        raise OSError("down")

    assert email_once(factory, settings, broken)
    with factory.begin() as db:
        db.execute(update(NotificationDelivery).values(next_attempt_at=now()))
    sent = []
    assert email_once(factory, settings, sent.append)
    with factory() as db:
        delivery = db.scalar(
            select(NotificationDelivery).where(NotificationDelivery.channel == "email")
        )
        assert delivery.status == "sent" and delivery.attempt_count == 2 and delivery.sent_at
    assert len(sent) == 1


def test_suspended_recipient_gets_no_email(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    drain(factory, settings)
    edit_title(client, f)
    assert fanout_once(factory)
    with factory.begin() as db:
        db.execute(update(User).where(User.email == email).values(status="suspended"))
    sent = []
    assert email_once(factory, settings, sent.append)
    assert sent == []
    with factory() as db:
        delivery = db.scalar(
            select(NotificationDelivery).where(NotificationDelivery.channel == "email")
        )
        assert delivery.status == "failed" and delivery.last_error == "recipient_unavailable"


def test_support_hook_creates_deduplicated_notifications(client, account, factory, settings):
    _, _, headers = account()
    uid = UUID(user_id(client, headers))
    case_id, change_id = uuid4(), uuid4()
    for _ in range(2):  # the same persisted change replayed
        with factory.begin() as db:
            enqueue_support_notice(
                db, recipient_user_id=uid, case_id=case_id, change="reply", change_id=change_id
            )
    with factory.begin() as db:
        enqueue_support_notice(
            db,
            recipient_user_id=uid,
            case_id=case_id,
            change="status",
            change_id=uuid4(),
            status="resolved",
        )
    sent = drain(factory, settings)
    items = inbox(client, headers)
    assert sorted(n["kind"] for n in items) == ["support_reply", "support_status"]
    status = next(n for n in items if n["kind"] == "support_status")
    assert status["payload"] == {"version": 1, "case_id": str(case_id), "status": "resolved"}
    assert status["target"] == {"type": "support_case", "id": str(case_id)}
    assert len(sent) == 2
    with pytest.raises(ValueError):
        with factory.begin() as db:
            enqueue_support_notice(
                db, recipient_user_id=uid, case_id=case_id, change="oops", change_id=1
            )


def test_payloads_hold_no_tokens(client, setup, account, factory, settings):
    f = published(client, setup)
    email, _, holder = account()
    buy(client, f, email, holder)
    edit_title(client, f)
    drain(factory, settings)
    with factory() as db:
        payloads = [str(n.safe_payload) for n in db.scalars(select(Notification))]
        payloads += [
            str(j.payload) for j in db.scalars(select(OutboxJob)) if j.kind == "notification_fanout"
        ]
        assert payloads and not any(
            "biletflow:ticket" in p or "token" in p.lower() for p in payloads
        )
        assert db.scalar(select(func.count(Ticket.id))) == 1
