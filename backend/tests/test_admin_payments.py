import csv
import io
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.catalog_models import Event
from app.checkout_models import Ticket
from app.commerce_models import PaymentAttempt, PayoutProfile, Refund, SalesActivation
from app.models import AuditLog
from tests.test_admin import admin as admin
from tests.test_admin import code
from tests.test_paid_orders import checkout, hold, paid_event, pay

ADMIN = "/api/v1/admin"


def url(f, action=None):
    base = ADMIN + f"/events/{f['event']['id']}/paid-sales"
    return base + ("/" + action if action else "")


def test_admin_commerce_permissions(client, setup, account):
    f = setup()
    _, _, attendee = account()
    for headers in (attendee, f["headers"]):
        for path in (
            "/payments",
            "/refunds",
            "/failed-payments",
            "/exports/payments.csv",
            "/exports/refunds.csv",
            "/exports/failed-payments.csv",
        ):
            assert client.get(ADMIN + path, headers=headers).status_code == 403
        assert client.get(url(f), headers=headers).status_code == 403
        for action in ("suspend", "reinstate"):
            assert (
                client.post(url(f, action), headers=headers, json={"reason": "Review"}).status_code
                == 403
            )


def test_admin_suspension_blocks_paid_hold_checkout_and_fulfillment_but_not_free(
    client, setup, account, admin, factory
):
    headers = admin[2]
    f = paid_event(client, setup)
    email, _, buyer = account()
    pending_hold = hold(client, f, buyer, f["paid"]["id"])
    pending = checkout(client, pending_hold, buyer, [("Buyer", email)]).json()
    email2, _, buyer2 = account()
    held = hold(client, f, buyer2, f["paid"]["id"])
    r = client.post(url(f, "suspend"), headers=headers, json={"reason": " Risk review "})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "suspended"
    assert r.json()["suspension_reason"] == "Risk review"
    assert (
        code(client.post(url(f, "suspend"), headers=headers, json={"reason": "Again"}))
        == "paid_sales_not_active"
    )
    denied = client.post(
        f"/api/v1/events/{f['event']['id']}/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}]},
    )
    assert denied.status_code == 409 and code(denied) == "paid_sales_inactive"
    assert code(checkout(client, held, buyer2, [("Buyer", email2)])) == "paid_sales_inactive"
    pay(client, buyer, pending["payment"]["id"], "succeeded")
    with factory() as db:
        assert db.scalar(select(Ticket.id)) is None
        refund = db.scalar(select(Refund))
        assert refund.reason == "blocked_fulfillment"
        assert db.get(Event, UUID(f["event"]["id"])).moderation_state == "normal"
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "admin.paid_sales_suspended"))
        assert audit.actor_user_id and audit.entity_type == "sales_activation"
        assert audit.safe_change == {
            "reason": "Risk review",
            "before": "active",
            "after": "suspended",
        }
    free = hold(client, f, buyer2, f["ticket"]["id"])
    assert checkout(client, free, buyer2, [("Buyer", email2)]).json()["status"] == "confirmed"
    with factory.begin() as db:
        db.execute(update(PayoutProfile).values(status="rejected"))
    denied = client.post(url(f, "reinstate"), headers=headers, json={"reason": "Resolved"})
    assert denied.status_code == 409 and code(denied) == "activation_incomplete"
    with factory.begin() as db:
        db.execute(update(PayoutProfile).values(status="verified"))
        activation = db.scalar(select(SalesActivation))
        original_payment = activation.paid_attempt_id
        activation.paid_attempt_id = None
    unpaid = client.post(url(f, "reinstate"), headers=headers, json={"reason": "Resolved"})
    assert unpaid.status_code == 409 and code(unpaid) == "activation_incomplete"
    with factory.begin() as db:
        db.scalar(select(SalesActivation)).paid_attempt_id = original_payment
    resumed = client.post(url(f, "reinstate"), headers=headers, json={"reason": "Resolved"})
    assert resumed.status_code == 200 and resumed.json()["status"] == "active"
    assert client.get(url(f), headers=headers).json()["status"] == "active"


def test_admin_suspension_concurrency_and_idempotent_replay(client, setup, admin, factory, app):
    f = paid_event(client, setup)
    headers = admin[2] | {"Idempotency-Key": str(uuid4())}

    def send(_):
        with TestClient(app) as local:
            return local.post(url(f, "suspend"), headers=headers, json={"reason": "Review"})

    with ThreadPoolExecutor(4) as pool:
        responses = list(pool.map(send, range(4)))
    assert [r.status_code for r in responses] == [200] * 4
    changed = client.post(url(f, "suspend"), headers=headers, json={"reason": "Changed"})
    assert changed.status_code == 409 and code(changed) == "idempotency_key_reused"
    with factory() as db:
        assert (
            len(
                list(
                    db.scalars(
                        select(AuditLog).where(AuditLog.action == "admin.paid_sales_suspended")
                    )
                )
            )
            == 1
        )
        assert db.scalar(select(SalesActivation.status)) == "suspended"
    assert (
        client.post(url(f, "reinstate"), headers=admin[2], json={"reason": "Resolved"}).status_code
        == 200
    )
    headers = admin[2]
    with ThreadPoolExecutor(4) as pool:
        responses = list(pool.map(send, range(4)))
    assert sorted(r.status_code for r in responses) == [200, 409, 409, 409]


def test_commerce_lists_filters_pagination_and_safe_exports(client, setup, account, admin, factory):
    f = paid_event(client, setup)
    other = paid_event(client, setup)
    email, _, buyer = account()
    held = hold(client, f, buyer, f["paid"]["id"])
    order = checkout(client, held, buyer, [("Buyer", email)]).json()
    failed_id = order["payment"]["id"]
    pay(client, buyer, failed_id, "failed")
    headers = admin[2]
    params = {
        "event_id": f["event"]["id"],
        "organization_id": f["org"]["id"],
        "order_id": order["id"],
        "purpose": "ticket_order",
        "environment": "simulation",
    }
    page = client.get(ADMIN + "/payments", headers=headers, params=params).json()
    assert page["total"] == 1 and page["items"][0]["id"] == failed_id
    assert page["items"][0]["expected_minor"] == 400000
    assert page["items"][0]["simulated"] is True
    created = page["items"][0]["created_at"]
    for extra, expected in (
        ({"from": created}, 1),
        ({"to": created}, 0),
        ({"payer_user_id": page["items"][0]["payer_user_id"]}, 1),
        ({"payer_user_id": str(uuid4())}, 0),
        ({"environment": "sandbox"}, 0),
        ({"status": "succeeded"}, 0),
    ):
        assert (
            client.get(ADMIN + "/payments", headers=headers, params=params | extra).json()["total"]
            == expected
        )
    assert (
        client.get(ADMIN + "/failed-payments", headers=headers, params=params).json()["total"] == 1
    )
    assert (
        client.get(
            ADMIN + "/payments",
            headers=headers,
            params=params | {"organization_id": other["org"]["id"]},
        ).json()["total"]
        == 0
    )
    assert (
        client.get(ADMIN + "/payments", headers=headers, params=params | {"offset": 1}).json()[
            "items"
        ]
        == []
    )
    with factory.begin() as db:
        db.execute(
            update(PaymentAttempt)
            .where(PaymentAttempt.id == UUID(failed_id))
            .values(provider_payment_id="=EVIL()", safe_result={"secret": "NEVER_EXPORT"})
        )
    exported = client.get(
        ADMIN + "/exports/failed-payments.csv", headers=headers, params=params | {"limit": 1}
    )
    assert exported.status_code == 200, exported.text
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert len(rows) == 1 and rows[0]["provider_payment_id"] == "'=EVIL()"
    assert "NEVER_EXPORT" not in exported.text and "merchant_account_key" not in exported.text
    bounded = client.get(ADMIN + "/exports/payments.csv?limit=1", headers=headers)
    assert len(list(csv.DictReader(io.StringIO(bounded.text)))) == 1
    # Authoritative compensation refund remains inspectable independently of an order's state.
    pay(client, buyer, failed_id, "succeeded", amount_minor=100)
    refunds = client.get(ADMIN + "/refunds", headers=headers, params=params).json()
    assert refunds["total"] == 1 and refunds["items"][0]["amount_minor"] == 100
    assert refunds["items"][0]["reason"] == "blocked_fulfillment"
    assert (
        client.get(ADMIN + "/exports/refunds.csv", headers=headers, params=params).status_code
        == 200
    )


def test_admin_commerce_invalid_input(client, setup, admin):
    f = setup()
    headers = admin[2]
    for action in ("suspend", "reinstate"):
        assert (
            client.post(url(f, action), headers=headers, json={"reason": "  "}).status_code == 422
        )
        assert (
            client.post(
                ADMIN + f"/events/{uuid4()}/paid-sales/{action}",
                headers=headers,
                json={"reason": "Review"},
            ).status_code
            == 404
        )
    for path in (
        "/payments",
        "/refunds",
        "/failed-payments",
        "/exports/payments.csv",
        "/exports/refunds.csv",
        "/exports/failed-payments.csv",
    ):
        for params in (
            {"status": "bogus"},
            {"purpose": "bogus"},
            {"event_id": "bad"},
            {"environment": "production"},
            {"from": "2026-11-01"},
            {"from": "2026-11-02T00:00:00Z", "to": "2026-11-01T00:00:00Z"},
            {"limit": 0},
        ):
            assert client.get(ADMIN + path, headers=headers, params=params).status_code == 422, (
                path,
                params,
            )
    assert (
        client.get(ADMIN + "/failed-payments?status=succeeded", headers=headers).status_code == 422
    )
    assert (
        client.get(ADMIN + "/exports/payments.csv?limit=5001", headers=headers).status_code == 422
    )
