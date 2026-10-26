from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.activation_service import TERMS_VERSION, suspend
from app.catalog_models import Allocation, Hold, TicketType
from app.checkout_expiry import sweep_expired_holds
from app.checkout_models import Ticket, TicketOrder
from app.commerce_models import Refund, RefundAttempt
from app.models import OutboxJob
from app.paid_checkout_service import quote
from app.payments_service import dispatch_refund_once, process_received_once, receive
from app.security import now

API = "/api/v1"
PRICE = 400000


def paid_event(client, setup, limit=12):
    f = setup()
    eid = f["event"]["id"]
    assert client.post(API + f"/events/{eid}/publish", headers=f["headers"]).status_code == 200
    paid = client.post(
        API + f"/events/{eid}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"]
        | {"name": "Paid seat", "kind": "paid", "price_minor": PRICE, "quantity_limit": limit},
    ).json()
    for step in ("payout-profile", "identity-verification"):
        client.post(
            API + f"/organizations/{f['org']['id']}/paid-sales/{step}", headers=f["headers"]
        )
    client.post(
        API + f"/events/{eid}/paid-sales/terms",
        headers=f["headers"],
        json={"terms_version": TERMS_VERSION},
    )
    fee = client.post(API + f"/events/{eid}/paid-sales/activation", headers=f["headers"]).json()
    pay(client, f["headers"], fee["payment"]["id"], "succeeded")
    return f | {"paid": paid}


def pay(client, headers, attempt_id, outcome, **extra):
    r = client.post(
        API + f"/simulator/payments/{attempt_id}/events",
        headers=headers,
        json={"outcome": outcome, **extra},
    )
    assert r.status_code == 200, r.text
    return r.json()


def refund_event(client, headers, refund_attempt_id, outcome, **extra):
    r = client.post(
        API + f"/simulator/refunds/{refund_attempt_id}/events",
        headers=headers,
        json={"outcome": outcome, **extra},
    )
    assert r.status_code == 200, r.text
    return r.json()


def hold(client, f, headers, type_id, quantity=1):
    r = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={"items": [{"ticket_type_id": type_id, "quantity": quantity}]},
    )
    assert r.status_code == 201, r.text
    return r.json()


def body(held, people):
    return {
        "recipients": [
            {"allocation_id": row["id"], "name": name, "email": email}
            for row, (name, email) in zip(held["allocations"], people, strict=True)
        ]
    }


def checkout(client, held, headers, people):
    return client.post(
        API + f"/holds/{held['id']}/checkout", headers=headers, json=body(held, people)
    )


def buyer_order(client, account, f, quantity=1):
    email, _, headers = account()
    held = hold(client, f, headers, f["paid"]["id"], quantity)
    people = [("Aru", email)] + [
        (f"Guest {i}", f"guest{i}@example.com") for i in range(1, quantity)
    ]
    order = checkout(client, held, headers, people)
    assert order.status_code == 200, order.text
    return order.json(), headers, held


def test_quote_is_exact_in_integer_minor_units():
    types = {"t": SimpleNamespace(price_minor=100001), "u": SimpleNamespace(price_minor=99999)}
    allocations = [SimpleNamespace(id=i, ticket_type_id=t) for i, t in enumerate("ttu")]
    data = SimpleNamespace(recipients=[SimpleNamespace(allocation_id=i) for i in range(3)])
    totals, lines = quote(types, allocations, data)
    assert totals == {"gross": 300001, "fee": 9000}
    assert sum(fee for _, fee in lines) == totals["fee"]
    assert all(0 <= fee <= face for face, fee in lines)
    zero = {"t": SimpleNamespace(price_minor=0)}
    free = quote(zero, allocations[:1], SimpleNamespace(recipients=data.recipients[:1]))
    assert free == ({"gross": 0, "fee": 0}, [(0, 0)])


def test_paid_order_is_fulfilled_once_after_payment(client, setup, account, factory):
    f = paid_event(client, setup)
    order, headers, held = buyer_order(client, account, f, quantity=2)
    assert order["status"] == "pending" and order["payable_minor"] == 2 * PRICE
    assert order["processing_fee_minor"] == 24000
    assert [item["paid_minor"] for item in order["items"]] == [PRICE, PRICE]
    assert all(item["ticket"] is None for item in order["items"])
    assert order["payment"]["status"] == "created" and order["payment"]["simulated"] is True
    # Retrying checkout returns the same pending order.
    again = checkout(
        client,
        held,
        headers,
        [("Aru", order["items"][0]["recipient_email"]), ("Guest 1", "guest1@example.com")],
    )
    assert again.json()["id"] == order["id"]
    assert client.get(API + "/tickets", headers=headers).json() == []

    attempt = order["payment"]["id"]
    first = pay(client, headers, attempt, "succeeded", external_event_id="evt-pay-1")
    assert first["attempt"]["charged_minor"] == 2 * PRICE
    pay(client, headers, attempt, "succeeded", external_event_id="evt-pay-1")
    pay(client, headers, attempt, "succeeded")
    done = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert done["status"] == "confirmed" and done["refunds"] == []
    assert all(item["ticket"] for item in done["items"])
    assert done["items"][0]["ticket"]["qr_payload"].startswith("biletflow:ticket:")
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 2
        jobs = select(func.count(OutboxJob.id)).where(OutboxJob.kind == "ticket_delivery_email")
        assert db.scalar(jobs) == 2
        assert db.get(Hold, UUID(held["id"])).status == "consumed"
        states = set(
            db.scalars(select(Allocation.state).where(Allocation.hold_id == UUID(held["id"])))
        )
        assert states == {"sold"}


def test_wrong_amount_and_client_price_never_issue_tickets(client, setup, account, factory):
    f = paid_event(client, setup)
    email, _, headers = account()
    held = hold(client, f, headers, f["paid"]["id"])
    tampered = body(held, [("Aru", email)])
    tampered["recipients"][0]["price_minor"] = 1
    r = client.post(API + f"/holds/{held['id']}/checkout", headers=headers, json=tampered)
    assert r.status_code == 422
    order = checkout(client, held, headers, [("Aru", email)]).json()
    pay(client, headers, order["payment"]["id"], "succeeded", amount_minor=1)
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "pending"
    assert [(r["reason"], r["amount_minor"]) for r in view["refunds"]] == [
        ("blocked_fulfillment", 1)
    ]
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 0


def test_failed_retry_and_extra_success_are_compensated(client, setup, account, factory):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    first = order["payment"]["id"]
    pay(client, headers, first, "failed")
    assert client.get(API + f"/orders/{order['id']}", headers=headers).json()["status"] == "pending"
    retried = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers).json()
    second = retried["payment"]["id"]
    assert second != first
    again = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers).json()
    assert again["payment"]["id"] == second
    pay(client, headers, second, "succeeded")
    # The provider later reports the first attempt captured money after all.
    pay(client, headers, first, "succeeded")
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "confirmed"
    assert [(r["reason"], r["payment_attempt_id"]) for r in view["refunds"]] == [
        ("duplicate_charge", first)
    ]
    with factory() as db:
        assert db.get(TicketOrder, UUID(order["id"])).fulfillment_payment_attempt_id == UUID(second)
        assert set(db.scalars(select(Ticket.status))) == {"valid"}
        assert db.scalar(select(func.count(Ticket.id))) == 1


def test_late_success_after_expiry_is_refunded_not_resold(client, setup, account, factory):
    f = paid_event(client, setup, limit=1)
    order, headers, held = buyer_order(client, account, f)
    with factory.begin() as db:
        db.execute(
            update(Hold)
            .where(Hold.id == UUID(held["id"]))
            .values(
                created_at=now() - timedelta(minutes=30), expires_at=now() - timedelta(minutes=10)
            )
        )
    assert sweep_expired_holds(factory) == 1
    assert client.get(API + f"/orders/{order['id']}", headers=headers).json()["status"] == "expired"
    other, other_headers, _ = buyer_order(client, account, f)
    pay(client, headers, order["payment"]["id"], "succeeded")
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "expired"
    assert [r["reason"] for r in view["refunds"]] == ["late_payment"]
    r = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "quote_expired"
    # The place now belongs to the other buyer, who can still pay for it.
    pay(client, other_headers, other["payment"]["id"], "succeeded")
    assert (
        client.get(API + f"/orders/{other['id']}", headers=other_headers).json()["status"]
        == "confirmed"
    )
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 1


def test_racing_successes_fulfil_once(client, setup, account, factory, app):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    first = order["payment"]["id"]
    pay(client, headers, first, "failed")
    second = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers).json()[
        "payment"
    ]["id"]

    def succeed(attempt_id):
        with TestClient(app) as other:
            return pay(other, headers, attempt_id, "succeeded")["attempt"]["status"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(succeed, [first, second])) == ["succeeded", "succeeded"]
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "confirmed" and len(view["refunds"]) == 1
    assert view["refunds"][0]["reason"] == "duplicate_charge"
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 1


def test_refund_failure_retry_unknown_and_reconcile(client, setup, account, factory, settings):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    first = order["payment"]["id"]
    pay(client, headers, first, "failed")
    second = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers).json()[
        "payment"
    ]["id"]
    pay(client, headers, second, "succeeded")
    pay(client, headers, first, "succeeded")

    assert dispatch_refund_once(factory) is True
    refund = client.get(API + f"/orders/{order['id']}", headers=headers).json()["refunds"][0]
    assert refund["status"] == "pending" and refund["latest_attempt_status"] == "pending"
    failed = refund_event(client, headers, refund["latest_attempt_id"], "failed")
    assert failed["refund"]["status"] == "failed"
    # The retry is the same obligation with a new attempt, scheduled after a back-off.
    assert dispatch_refund_once(factory) is False
    with factory.begin() as db:
        db.execute(
            update(OutboxJob).where(OutboxJob.kind == "refund_dispatch").values(available_at=now())
        )
    assert dispatch_refund_once(factory) is True
    retry = client.get(API + f"/orders/{order['id']}", headers=headers).json()["refunds"][0]
    assert retry["latest_attempt_id"] != refund["latest_attempt_id"]
    unknown = refund_event(client, headers, retry["latest_attempt_id"], "unknown")
    assert unknown["refund"]["status"] == "pending"
    assert unknown["refund"]["latest_attempt_status"] == "unknown"

    # The authoritative answer arrives while no request is running; the worker applies it.
    receive(
        factory,
        "evt-refund-ok",
        {"outcome": "succeeded"},
        refund_attempt_id=UUID(retry["latest_attempt_id"]),
    )
    assert process_received_once(factory, settings) is True
    stale = refund_event(client, headers, retry["latest_attempt_id"], "failed")
    assert stale["refund"]["status"] == "succeeded"
    with factory() as db:
        assert db.scalar(select(func.count(Refund.id))) == 1
        assert db.scalar(select(func.count(RefundAttempt.id))) == 2
        assert set(db.scalars(select(Ticket.status))) == {"valid"}


def test_free_endpoint_never_charges_and_free_checkout_still_works(client, setup, account):
    f = paid_event(client, setup)
    email, _, headers = account()
    held = hold(client, f, headers, f["paid"]["id"])
    r = client.post(
        API + f"/holds/{held['id']}/confirm", headers=headers, json=body(held, [("Aru", email)])
    )
    assert r.status_code == 409 and r.json()["detail"]["code"] == "payment_required"
    free = hold(client, f, headers, f["ticket"]["id"])
    order = checkout(client, free, headers, [("Aru", email)])
    assert order.status_code == 200 and order.json()["status"] == "confirmed"
    assert order.json()["payable_minor"] == 0 and order.json()["payment"] is None


def test_suspended_paid_sales_block_fulfilment(client, setup, account, factory):
    f = paid_event(client, setup)
    order, headers, _ = buyer_order(client, account, f)
    with factory.begin() as db:
        suspend(db, UUID(f["event"]["id"]), "Fraud review")
    pay(client, headers, order["payment"]["id"], "succeeded")
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "pending"
    assert [r["reason"] for r in view["refunds"]] == ["blocked_fulfillment"]
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 0


def test_checkout_key_replays_the_same_order(client, setup, account, factory):
    f = paid_event(client, setup)
    email, _, headers = account()
    held = hold(client, f, headers, f["paid"]["id"])
    key = {"Idempotency-Key": str(uuid4())}
    one = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=headers | key,
        json=body(held, [("Aru", email)]),
    )
    two = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=headers | key,
        json=body(held, [("Aru", email)]),
    )
    assert one.json()["id"] == two.json()["id"]
    changed = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=headers | key,
        json=body(held, [("X", "x@example.com")]),
    )
    assert (
        changed.status_code == 409 and changed.json()["detail"]["code"] == "idempotency_key_reused"
    )
    with factory.begin() as db:
        db.execute(
            update(TicketType).where(TicketType.id == UUID(f["paid"]["id"])).values(price_minor=1)
        )
    # The saved quote is kept: a later price change never re-prices the pending order.
    pay(client, headers, one.json()["payment"]["id"], "succeeded")
    assert (
        client.get(API + f"/orders/{one.json()['id']}", headers=headers).json()["status"]
        == "confirmed"
    )
