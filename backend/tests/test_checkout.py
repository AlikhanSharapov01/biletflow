from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.catalog_models import Allocation, Hold
from app.checkout_models import Ticket, TicketOrder
from app.checkout_schemas import QR_PREFIX
from app.models import AuditLog, OutboxJob
from app.security import digest, now
from app.worker import deliver_once

API = "/api/v1"


def published(client, setup, **options):
    f = setup(**options)
    if options.get("assigned"):
        tid = f["ticket"]["id"]
        r = client.post(
            API + f"/events/{f['event']['id']}/seats/configure",
            headers=f["headers"],
            json={"ticket_types": {"standard": tid, "premium": tid}},
        )
        assert r.status_code == 200, r.text
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text
    return f


def hold(client, f, headers, quantity=1, seat_ids=None, ticket_id=None):
    line = {"ticket_type_id": ticket_id or f["ticket"]["id"], "quantity": quantity}
    if seat_ids:
        line["seat_ids"] = seat_ids
    return client.post(
        API + f"/events/{f['event']['id']}/holds", headers=headers, json={"items": [line]}
    )


def recipients(held, *people):
    return {
        "recipients": [
            {"allocation_id": row["id"], "name": name, "email": email}
            for row, (name, email) in zip(held["allocations"], people, strict=True)
        ]
    }


def test_free_registration_issues_tickets_claims_and_delivers(
    client, setup, account, factory, settings
):
    f = published(client, setup)
    buyer_email, _, buyer = account()
    friend_email, _, friend = account()
    r = hold(client, f, buyer, quantity=2)
    assert r.status_code == 201, r.text
    held = r.json()
    assert held["status"] == "active" and len(held["allocations"]) == 2
    body = recipients(held, ("Buyer", buyer_email.upper()), ("Friend", friend_email))
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=buyer, json=body)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["status"] == "confirmed"
    assert order["gross_minor"] == order["payable_minor"] == order["processing_fee_minor"] == 0
    own, other = order["items"]
    assert own["recipient_email"] == buyer_email and own["unit_number"] == 1
    assert own["ticket"]["qr_payload"].startswith(QR_PREFIX)
    assert own["ticket"]["event_title"] == "Campus Concert"
    assert other["ticket"]["qr_payload"] is None and other["ticket"]["recipient_user_id"] is None

    # Refreshing confirmation must not issue a second ticket set.
    again = client.post(API + f"/holds/{held['id']}/confirm", headers=buyer, json=body)
    assert again.status_code == 200 and again.json()["id"] == order["id"]
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 2
        assert db.scalar(select(Hold)).status == "consumed"
        assert set(db.scalars(select(Allocation.state))) == {"sold"}
        ticket = db.get(Ticket, UUID(own["ticket"]["id"]))
        payload = own["ticket"]["qr_payload"].removeprefix(QR_PREFIX)
        assert ticket.qr_token_hash == digest(payload)
        assert db.scalar(select(AuditLog.id).where(AuditLog.action == "checkout.order_confirmed"))

    assert [t["id"] for t in client.get(API + "/tickets", headers=buyer).json()] == [
        own["ticket"]["id"]
    ]
    assert client.get(API + f"/tickets/{other['ticket']['id']}", headers=buyer).status_code == 404
    assert client.get(API + "/tickets", headers=friend).json() == []
    r = client.post(API + "/tickets/claim", headers=friend)
    assert r.status_code == 200 and r.json() == {"claimed": 1}
    assert client.post(API + "/tickets/claim", headers=friend).json() == {"claimed": 0}
    mine = client.get(API + f"/tickets/{other['ticket']['id']}", headers=friend)
    assert mine.status_code == 200 and mine.json()["qr_payload"].startswith(QR_PREFIX)

    assert len(client.get(API + "/orders", headers=buyer).json()) == 1
    assert client.get(API + f"/orders/{order['id']}", headers=friend).status_code == 404
    attendees = client.get(API + f"/events/{f['event']['id']}/attendees", headers=f["headers"])
    assert attendees.status_code == 200
    assert {row["recipient_email"] for row in attendees.json()} == {buyer_email, friend_email}
    assert all(row["claimed"] for row in attendees.json())
    assert (
        client.get(API + f"/events/{f['event']['id']}/attendees", headers=buyer).status_code == 404
    )

    sent = []
    while deliver_once(factory, settings, send=sent.append):
        pass
    tickets = [m for m in sent if m["Subject"].startswith("Your BiletFlow ticket")]
    assert sorted(m["To"] for m in tickets) == sorted([buyer_email, friend_email])
    assert own["ticket"]["id"] in "".join(m.get_content() for m in tickets)
    assert "biletflow:ticket:" not in "".join(m.get_content() for m in tickets)
    with factory() as db:
        assert set(
            db.scalars(select(OutboxJob.status).where(OutboxJob.kind == "ticket_delivery_email"))
        ) == {"done"}


def test_checkout_rejects_invalid_requests(client, setup, account, factory):
    f = published(client, setup)
    _, _, buyer = account()
    _, _, stranger = account()
    assert hold(client, f, buyer, quantity=6).json()["detail"]["code"] == (
        "per_order_limit_exceeded"
    )
    paid = client.post(
        API + f"/events/{f['event']['id']}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Paid", "kind": "paid", "price_minor": 500000},
    )
    assert paid.status_code == 201, paid.text
    r = hold(client, f, buyer, ticket_id=paid.json()["id"])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "paid_checkout_unavailable"

    held = hold(client, f, buyer, quantity=2).json()
    body = recipients(held, ("A", "a@example.com"), ("B", "b@example.com"))
    assert client.get(API + f"/holds/{held['id']}", headers=stranger).status_code == 404
    assert (
        client.post(API + f"/holds/{held['id']}/confirm", headers=stranger, json=body).status_code
        == 404
    )
    body_short = {"recipients": body["recipients"][:1]}
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=buyer, json=body_short)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "recipient_allocation_mismatch"
    duplicated = {"recipients": [body["recipients"][0]] * 2}
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=buyer, json=duplicated)
    assert r.status_code == 422

    with factory.begin() as db:
        db.execute(
            update(Hold)
            .where(Hold.id == UUID(held["id"]))
            .values(
                created_at=now() - timedelta(minutes=20), expires_at=now() - timedelta(minutes=10)
            )
        )
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=buyer, json=body)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "hold_expired"
    with factory() as db:
        assert db.scalar(select(func.count(TicketOrder.id))) == 0
        assert db.scalar(select(func.count(Ticket.id))) == 0
    # The rejected request rolls back; the next successful hold sweeps the expired one.
    assert hold(client, f, stranger).status_code == 201
    with factory() as db:
        assert db.get(Hold, UUID(held["id"])).status == "expired"

    assert hold(client, f, {}).status_code == 401


def test_release_and_capacity(client, setup, account):
    f = published(client, setup)
    buyers = [account()[2] for _ in range(3)]
    first = hold(client, f, buyers[0], quantity=5).json()
    assert hold(client, f, buyers[1], quantity=5).status_code == 201
    r = hold(client, f, buyers[2], quantity=5)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "event_capacity_exceeded"
    released = client.delete(API + f"/holds/{first['id']}", headers=buyers[0])
    assert released.status_code == 200 and released.json()["status"] == "released"
    assert {row["state"] for row in released.json()["allocations"]} == {"released"}
    assert hold(client, f, buyers[2], quantity=5).status_code == 201
    body = recipients(first, *[("X", f"x{i}@example.com") for i in range(5)])
    r = client.post(API + f"/holds/{first['id']}/confirm", headers=buyers[0], json=body)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "hold_expired"


def test_private_event_requires_access_grant(client, setup, account):
    f = published(client, setup, visibility="private")
    _, _, buyer = account()
    r = hold(client, f, buyer)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "event_not_found"
    uid = client.get(API + "/me", headers=buyer).json()["id"]
    client.put(
        API + f"/events/{f['event']['id']}/access", headers=f["headers"], json={"user_id": uid}
    )
    assert hold(client, f, buyer).status_code == 201


def test_assigned_seat_is_sold_once_under_concurrency(client, setup, account, app):
    f = published(client, setup, assigned=True)
    eid = f["event"]["id"]
    seat = client.get(API + f"/events/{eid}/seats").json()["items"][0]["id"]
    buyers = [account()[2] for _ in range(2)]

    def reserve(headers):
        with TestClient(app) as other:
            return hold(other, f, headers, seat_ids=[seat]).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reserve, buyers)) == [201, 409]
    seats = {row["id"]: row for row in client.get(API + f"/events/{eid}/seats").json()["items"]}
    assert seats[seat]["status"] == "held"
    assert hold(client, f, buyers[0]).json()["detail"]["code"] == "seats_required"
