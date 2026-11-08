from sqlalchemy import func, select
from test_paid_orders import buyer_order, paid_event, pay, refund_event
from test_refunds import free_order, refund

from app.commerce_models import RefundAttempt
from app.notification_models import Notification
from app.notification_service import LOCALES, ORDER_NOTICES, TEMPLATES, deliver_notifications_once
from app.payments_service import dispatch_refund_once

API = "/api/v1"


def drain(factory, settings, sent):
    while deliver_notifications_once(factory, settings, sent.append):
        pass


def inbox(client, headers):
    return client.get(API + "/notifications", headers=headers).json()


def kinds(rows):
    return sorted(row["kind"] for row in rows)


def test_every_order_notice_has_all_locales():
    for notice in ORDER_NOTICES:
        assert set(TEMPLATES[notice]) == set(LOCALES)


def test_purchase_confirmation_once_with_order_link(client, setup, account, factory, settings):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    attempt = order["payment"]["id"]
    pay(client, headers, attempt, "succeeded", external_event_id="pay-1")
    sent = []
    drain(factory, settings, sent)
    pay(client, headers, attempt, "succeeded", external_event_id="pay-1")
    pay(client, headers, attempt, "succeeded")
    drain(factory, settings, sent)
    rows = [row for row in inbox(client, headers) if row["kind"] == "purchase_confirmed"]
    assert len(rows) == 1
    assert rows[0]["target"] == {"type": "order", "id": order["id"]}
    mails = [m for m in sent if "/orders/" + order["id"] in m.get_content()]
    assert len(mails) == 1


def test_failed_payment_notifies_once_per_attempt(client, setup, account, factory, settings):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    attempt = order["payment"]["id"]
    pay(client, headers, attempt, "failed", external_event_id="fail-1")
    pay(client, headers, attempt, "failed", external_event_id="fail-2")
    sent = []
    drain(factory, settings, sent)
    assert kinds(inbox(client, headers)) == ["payment_failed"]
    assert len(sent) == 1
    assert client.get(API + "/tickets", headers=headers).json() == []


def test_refund_notifies_started_and_completed_once(client, setup, account, factory, settings):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    pay(client, headers, order["payment"]["id"], "succeeded")
    refund(client, f, order)
    refund(client, f, order)
    assert dispatch_refund_once(factory)
    with factory() as db:
        attempt_id = str(db.scalar(select(RefundAttempt)).id)
    refund_event(client, headers, attempt_id, "succeeded", external_event_id="r-1")
    refund_event(client, headers, attempt_id, "succeeded", external_event_id="r-1")
    refund_event(client, headers, attempt_id, "succeeded")
    sent = []
    drain(factory, settings, sent)
    rows = inbox(client, headers)
    assert kinds(row for row in rows if row["kind"].startswith("refund_")) == [
        "refund_completed",
        "refund_started",
    ]
    with factory() as db:
        total = db.scalar(
            select(func.count(Notification.id)).where(Notification.kind == "refund_completed")
        )
    assert total == 1


def test_compensation_refund_also_tells_the_payer(client, setup, account, factory, settings):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    pay(client, headers, order["payment"]["id"], "succeeded", amount_minor=1)
    assert dispatch_refund_once(factory)
    with factory() as db:
        attempt_id = str(db.scalar(select(RefundAttempt)).id)
    refund_event(client, headers, attempt_id, "succeeded")
    drain(factory, settings, [])
    assert "refund_completed" in kinds(inbox(client, headers))
    assert "purchase_confirmed" not in kinds(inbox(client, headers))


def test_free_cancellation_notifies_the_attendee(client, setup, account, factory, settings):
    _, order, headers = free_order(client, setup, account)
    client.post(API + f"/orders/{order['id']}/cancel", headers=headers, json={"reason": ""})
    client.post(API + f"/orders/{order['id']}/cancel", headers=headers, json={"reason": ""})
    drain(factory, settings, [])
    rows = [row for row in inbox(client, headers) if row["kind"] == "order_cancelled"]
    assert len(rows) == 1 and rows[0]["target"]["type"] == "order"


def test_notification_text_is_localized(client, setup, account, factory, settings):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    assert client.patch(API + "/me", headers=headers, json={"locale": "kk"}).status_code == 200
    pay(client, headers, order["payment"]["id"], "succeeded")
    drain(factory, settings, [])
    row = next(r for r in inbox(client, headers) if r["kind"] == "purchase_confirmed")
    assert row["locale"] == "kk" and row["title"].startswith("Тапсырыс расталды")
