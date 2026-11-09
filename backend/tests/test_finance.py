from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from test_paid_orders import buyer_order, paid_event, pay
from test_refunds import refund, settle

from app.models import OutboxJob

API = "/api/v1/events/"


def finance(client, f):
    return client.get(API + f["event"]["id"] + "/finance", headers=f["headers"])


def payout(client, f, amount, key=None):
    return client.post(
        API + f["event"]["id"] + "/finance/payouts",
        headers=f["headers"] | {"Idempotency-Key": key or str(uuid4())},
        json={"amount_minor": amount},
    )


def transition(client, f, identifier, status):
    return client.post(
        API + f["event"]["id"] + f"/finance/payouts/{identifier}/simulate",
        headers=f["headers"],
        json={"status": status},
    )


def funded(client, setup, account):
    f = paid_event(client, setup)
    order, buyer, _ = buyer_order(client, account, f, quantity=3)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    return f, order, buyer


def test_finance_reconciles_and_pending_refunds_block_payout(client, setup, account, factory):
    f, order, buyer = funded(client, setup, account)
    r = finance(client, f)
    assert r.status_code == 200, r.text
    data = r.json()
    revenue = client.get(API + f["event"]["id"] + "/analytics", headers=f["headers"]).json()[
        "revenue"
    ]
    for key in (
        "gross_minor",
        "discount_minor",
        "collected_minor",
        "fees_minor",
        "refunds_minor",
        "pending_refunds_minor",
    ):
        assert data[key] == revenue[key]
    assert data["activation_charges_minor"] == 500000
    assert data["estimated_payout_minor"] == 664000
    assert data["simulated"] is True
    assert refund(client, f, order).status_code == 200
    assert finance(client, f).json()["estimated_payout_minor"] == 0
    assert payout(client, f, 1).status_code == 409
    settle(client, factory, order["id"], buyer)
    assert finance(client, f).json()["balance_minor"] == -500000


def test_payout_retry_states_notification_and_post_payout_adjustment(
    client, setup, account, factory
):
    f, order, buyer = funded(client, setup, account)
    key = str(uuid4())
    r = payout(client, f, 664000, key)
    assert r.status_code == 201, r.text
    identifier = r.json()["id"]
    assert payout(client, f, 664000, key).json()["id"] == identifier
    assert payout(client, f, 1, key).status_code == 409
    assert payout(client, f, 1).status_code == 409
    assert transition(client, f, identifier, "sent").status_code == 409
    end_event(factory, f)
    assert transition(client, f, identifier, "eligible").status_code == 200
    assert transition(client, f, identifier, "sent").status_code == 200
    assert transition(client, f, identifier, "sent").status_code == 200
    assert finance(client, f).json()["balance_minor"] == 0
    assert refund(client, f, order).status_code == 200
    settle(client, factory, order["id"], buyer)
    data = finance(client, f).json()
    assert data["balance_minor"] == -1164000
    history = client.get(API + f["event"]["id"] + "/finance/payouts", headers=f["headers"]).json()
    assert history[0]["status"] == "adjusted"
    assert history[0]["amount_minor"] == 664000 and history[0]["sent_at"]
    assert history[0]["adjustment_minor"] == -1164000
    with factory() as db:
        jobs = list(
            db.scalars(select(OutboxJob).where(OutboxJob.deduplication_key.like("notify-payout:%")))
        )
        assert len(jobs) == 4


def test_refund_invalidates_reserved_payout(client, setup, account):
    f, order, _ = funded(client, setup, account)
    r = payout(client, f, 664000)
    assert r.status_code == 201, r.text
    identifier = r.json()["id"]
    assert refund(client, f, order).status_code == 200
    assert transition(client, f, identifier, "eligible").status_code == 409
    assert finance(client, f).json()["reserved_minor"] == 0


def test_concurrent_payout_cannot_overreserve(client, app, setup, account):
    f, _, _ = funded(client, setup, account)

    def create(_):
        with TestClient(app) as other:
            return payout(other, f, 664000).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(create, range(2))) == [201, 409]
    assert finance(client, f).json()["reserved_minor"] == 664000


def test_finance_denies_unrelated_buyer(client, setup, account):
    f, _, buyer = funded(client, setup, account)
    response = client.get(API + f["event"]["id"] + "/finance", headers=buyer)
    assert response.status_code == 404
    assert payout(client, f, 0).status_code == 422


def end_event(factory, f):
    from datetime import timedelta
    from uuid import UUID

    from sqlalchemy import update

    from app.catalog_models import Event
    from app.security import now

    with factory.begin() as db:
        db.execute(
            update(Event)
            .where(Event.id == UUID(f["event"]["id"]))
            .values(
                starts_at=now() - timedelta(hours=2),
                ends_at=now() - timedelta(hours=1),
                registration_closes_at=now() - timedelta(hours=3),
                admission_opens_at=now() - timedelta(hours=3),
                admission_closes_at=now() - timedelta(minutes=30),
                refund_cutoff_at=now() - timedelta(hours=4),
            )
        )


def test_pending_payout_waits_until_event_end(client, setup, account, factory):
    f, _, _ = funded(client, setup, account)
    response = payout(client, f, 664000)
    assert response.status_code == 201
    identifier = response.json()["id"]
    r = transition(client, f, identifier, "eligible")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "payout_not_yet_eligible"
    end_event(factory, f)
    assert transition(client, f, identifier, "eligible").status_code == 200


def test_payout_notifications_fanout_localized_once(client, setup, account, factory):
    from app.notification_service import fanout_once

    f, _, _ = funded(client, setup, account)
    r = payout(client, f, 100000)
    assert r.status_code == 201
    identifier = r.json()["id"]
    assert transition(client, f, identifier, "failed").status_code == 200
    assert transition(client, f, identifier, "failed").status_code == 200
    for _ in range(40):
        if not fanout_once(factory):
            break
    inbox = client.get("/api/v1/notifications", headers=f["headers"])
    assert inbox.status_code == 200, inbox.text
    notices = [n for n in inbox.json() if n["kind"] == "payout_status"]
    assert len(notices) == 2
    assert {n["payload"]["status"] for n in notices} == {"pending", "failed"}
    assert all(n["payload"]["simulated"] is True for n in notices)
    assert all(
        n["target"]["type"] == "event" and n["target"]["id"] == f["event"]["id"] for n in notices
    )
    assert all(n["body"] and n["title"] for n in notices)


def test_finance_permissions_grant_and_revoke(client, setup, account, settings, factory):
    from uuid import UUID

    from test_admission import staff

    from app.catalog_models import Member
    from app.notification_service import fanout_once

    f, _, _ = funded(client, setup, account)
    headers = staff(client, settings, account, f, ["reports", "refund", "scan"])
    path = API + f["event"]["id"] + "/finance"
    assert client.get(path, headers=headers).status_code == 403
    with factory() as db:
        members = list(
            db.scalars(select(Member).where(Member.organization_id == UUID(f["org"]["id"])))
        )
        member = next(m for m in members if str(m.user_id) != f["org"]["owner_user_id"])
        member_id = str(member.id)
    permission = f"/api/v1/organizations/{f['org']['id']}/members/{member_id}/permissions"
    assert (
        client.put(permission, headers=f["headers"], json={"capabilities": ["finance"]}).status_code
        == 200
    )
    assert client.get(path, headers=headers).status_code == 200
    member_f = f | {"headers": headers}
    assert payout(client, member_f, 100000).status_code == 201
    assert (
        client.put(permission, headers=f["headers"], json={"capabilities": []}).status_code == 200
    )
    assert client.get(path, headers=headers).status_code == 403
    for _ in range(40):
        if not fanout_once(factory):
            break
    inbox = client.get("/api/v1/notifications", headers=headers)
    assert not [n for n in inbox.json() if n["kind"] == "payout_status"]


def test_activation_compensation_is_positive_adjustment(client, setup, account, factory):
    from uuid import UUID

    from test_paid_orders import refund_event

    from app.commerce_models import PaymentIntent, Refund, RefundAttempt
    from app.payments_service import dispatch_refund_once, new_attempt

    f, _, _ = funded(client, setup, account)
    p = payout(client, f, 664000).json()
    end_event(factory, f)
    assert transition(client, f, p["id"], "eligible").status_code == 200
    assert transition(client, f, p["id"], "sent").status_code == 200
    with factory.begin() as db:
        intent = db.scalar(
            select(PaymentIntent).where(
                PaymentIntent.event_id == UUID(f["event"]["id"]),
                PaymentIntent.purpose == "activation",
            )
        )
        attempt_id = new_attempt(db, intent).id
    pay(client, f["headers"], str(attempt_id), "succeeded")
    for _ in range(10):
        if not dispatch_refund_once(factory):
            break
    with factory() as db:
        r = db.scalar(select(Refund).where(Refund.payment_attempt_id == attempt_id))
        attempt = db.scalar(select(RefundAttempt).where(RefundAttempt.refund_id == r.id))
        refund_attempt_id = str(attempt.id)
    refund_event(client, f["headers"], refund_attempt_id, "succeeded")
    assert finance(client, f).json()["balance_minor"] == 0
    history = client.get(API + f["event"]["id"] + "/finance/payouts", headers=f["headers"]).json()
    assert history[0]["transfer_status"] == "sent"
    assert history[0]["adjustment_minor"] == 500000


def test_send_and_refund_race_preserves_solvency(client, app, setup, account, factory):
    from uuid import UUID

    from app.finance_models import DemoPayout, FinanceEntry

    f, order, _ = funded(client, setup, account)
    identifier = payout(client, f, 664000).json()["id"]
    end_event(factory, f)
    assert transition(client, f, identifier, "eligible").status_code == 200

    def send():
        with TestClient(app) as other:
            return transition(other, f, identifier, "sent").status_code

    def approve():
        with TestClient(app) as other:
            return refund(other, f, order).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(send), pool.submit(approve)
        sent_code, refund_code = a.result(), b.result()
    assert refund_code == 200 and sent_code in (200, 409)
    with factory() as db:
        state = db.get(DemoPayout, UUID(identifier)).status
        entries = list(
            db.scalars(
                select(FinanceEntry).where(
                    FinanceEntry.payout_id == UUID(identifier), FinanceEntry.kind == "payout"
                )
            )
        )
        assert len(entries) == (1 if state == "sent" else 0)
        assert state in ("sent", "failed")
    assert finance(client, f).json()["estimated_payout_minor"] == 0


def test_discount_free_order_and_refund_reconcile(client, setup, account, factory):
    from test_campaigns import create as create_campaign
    from test_paid_orders import body, hold

    f = paid_event(client, setup)
    create_campaign(client, f, code="OFF10", eligible_ticket_type_ids=[f["paid"]["id"]])
    email, _, buyer = account()
    held = client.post(
        API + f["event"]["id"] + "/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": f["paid"]["id"], "quantity": 2}], "promo_code": "OFF10"},
    ).json()
    order = client.post(
        "/api/v1/holds/" + held["id"] + "/checkout",
        headers=buyer,
        json=body(held, [("A", email), ("B", email)]),
    ).json()
    pay(client, buyer, order["payment"]["id"], "succeeded")
    free = hold(client, f, buyer, f["ticket"]["id"])
    assert (
        client.post(
            "/api/v1/holds/" + free["id"] + "/confirm",
            headers=buyer,
            json=body(free, [("Free", email)]),
        ).status_code
        == 200
    )
    data = finance(client, f).json()
    assert (
        data["gross_minor"],
        data["discount_minor"],
        data["collected_minor"],
        data["fees_minor"],
        data["estimated_payout_minor"],
    ) == (800000, 80000, 720000, 21600, 198400)
    assert refund(client, f, order).status_code == 200
    settle(client, factory, order["id"], buyer)
    data = finance(client, f).json()
    assert data["gross_minor"] == 800000 and data["discount_minor"] == 80000
    assert data["fees_minor"] == 0 and data["refunds_minor"] == 720000
    assert data["balance_minor"] == -500000


def test_sent_payout_and_entries_are_database_immutable(client, setup, account, factory):
    import pytest
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    f, _, _ = funded(client, setup, account)
    identifier = payout(client, f, 664000).json()["id"]
    end_event(factory, f)
    assert transition(client, f, identifier, "eligible").status_code == 200
    assert transition(client, f, identifier, "sent").status_code == 200
    for statement in (
        "UPDATE biletflow.demo_payout SET amount_minor=1 WHERE id=:id",
        "DELETE FROM biletflow.demo_payout WHERE id=:id",
        "UPDATE biletflow.finance_entry SET amount_minor=-1 WHERE payout_id=:id",
        "DELETE FROM biletflow.finance_entry WHERE payout_id=:id",
        "INSERT INTO biletflow.finance_entry(event_id,payout_id,kind,amount_minor) SELECT event_id,id,'payout',-1 FROM biletflow.demo_payout WHERE id=:id",
    ):
        with pytest.raises(IntegrityError):
            with factory.begin() as db:
                db.execute(text(statement), {"id": identifier})


def test_finance_actions_disable_in_production_and_validate(client, setup, account, app):
    f, _, _ = funded(client, setup, account)
    path = API + f["event"]["id"] + "/finance/payouts"
    assert client.post(path, headers=f["headers"], json={"amount_minor": 1}).status_code == 422
    for value in (True, 1.5, -1, 0, 9223372036854775808):
        assert (
            client.post(
                path,
                headers=f["headers"] | {"Idempotency-Key": str(uuid4())},
                json={"amount_minor": value},
            ).status_code
            == 422
        )
    identifier = payout(client, f, 100000).json()["id"]
    app.state.settings.environment = "production"
    assert payout(client, f, 1).status_code == 404
    assert transition(client, f, identifier, "failed").status_code == 404
    assert finance(client, f).status_code == 200
