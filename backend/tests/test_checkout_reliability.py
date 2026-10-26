from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.catalog_models import Allocation, Hold, Organization, TicketType
from app.checkout_expiry import sweep_expired_holds
from app.checkout_models import Ticket, TicketOrder
from app.commerce_models import IdempotencyRecord
from app.models import AuditLog, OutboxJob
from app.security import now

API = "/api/v1"


def published(client, setup):
    f = setup()
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text
    return f


def hold(client, f, headers, quantity=1, key=None):
    extra = {"Idempotency-Key": key} if key else {}
    return client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers | extra,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": quantity}]},
    )


def confirm(client, held, headers, people, key=None):
    extra = {"Idempotency-Key": key} if key else {}
    body = {
        "recipients": [
            {"allocation_id": row["id"], "name": name, "email": email}
            for row, (name, email) in zip(held["allocations"], people, strict=True)
        ]
    }
    return client.post(API + f"/holds/{held['id']}/confirm", headers=headers | extra, json=body)


def overdue(factory, *hold_ids):
    with factory.begin() as db:
        db.execute(
            update(Hold)
            .where(Hold.id.in_([UUID(i) for i in hold_ids]))
            .values(
                created_at=now() - timedelta(minutes=30), expires_at=now() - timedelta(minutes=10)
            )
        )


def test_hold_key_replays_and_rejects_changed_payload(client, setup, account, factory):
    f = published(client, setup)
    _, _, buyer = account()
    key = str(uuid4())
    first = hold(client, f, buyer, quantity=2, key=key)
    assert first.status_code == 201, first.text
    again = hold(client, f, buyer, quantity=2, key=key)
    assert again.status_code == 201 and again.json()["id"] == first.json()["id"]
    # The retry returned the original hold instead of replacing it with a new one.
    assert again.json()["status"] == "active"
    changed = hold(client, f, buyer, quantity=3, key=key)
    assert changed.status_code == 409
    assert changed.json()["detail"]["code"] == "idempotency_key_reused"
    bad = hold(client, f, buyer, key="short")
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_idempotency_key"
    with factory() as db:
        assert db.scalar(select(func.count(Hold.id))) == 1


def test_concurrent_identical_requests_create_one_hold(client, setup, account, factory, app):
    f = published(client, setup)
    _, _, buyer = account()
    key = str(uuid4())

    def send(_):
        with TestClient(app) as other:
            r = hold(other, f, buyer, quantity=1, key=key)
            return r.status_code, r.json().get("id")

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    assert {code for code, _ in results} == {201}
    assert len({hold_id for _, hold_id in results}) == 1
    with factory() as db:
        assert db.scalar(select(func.count(Hold.id))) == 1
        assert db.scalar(select(func.count(Allocation.id))) == 1


def test_confirmation_replays_only_the_same_recipients(client, setup, account, factory):
    f = published(client, setup)
    email, _, buyer = account()
    held = hold(client, f, buyer).json()
    key = str(uuid4())
    me = [("Aru", email)]
    order = confirm(client, held, buyer, me, key=key)
    assert order.status_code == 200, order.text
    assert confirm(client, held, buyer, me, key=key).json()["id"] == order.json()["id"]
    r = confirm(client, held, buyer, [("Someone Else", "else@example.com")], key=key)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "idempotency_key_reused"

    # Without a key the same rule holds: a changed request never looks accepted.
    assert confirm(client, held, buyer, me).json()["id"] == order.json()["id"]
    r = confirm(client, held, buyer, [("Someone Else", "else@example.com")])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "confirmation_conflict"
    with factory() as db:
        assert db.scalar(select(func.count(TicketOrder.id))) == 1
        assert db.scalar(select(func.count(Ticket.id))) == 1
        jobs = select(func.count(OutboxJob.id)).where(OutboxJob.kind == "ticket_delivery_email")
        assert db.scalar(jobs) == 1


def test_last_place_race_never_oversells(client, setup, account, factory, app):
    f = published(client, setup)
    with factory.begin() as db:
        db.execute(
            update(TicketType)
            .where(TicketType.id == UUID(f["ticket"]["id"]))
            .values(quantity_limit=1)
        )
    buyers = [account()[2] for _ in range(2)]

    def send(headers):
        with TestClient(app) as other:
            return hold(other, f, headers).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(send, buyers)) == [201, 409]
    with factory() as db:
        live = select(func.count(Allocation.id)).where(Allocation.state == "held")
        assert db.scalar(live) == 1


def test_background_sweep_releases_once_and_never_touches_sold(client, setup, account, factory):
    f = published(client, setup)
    email, _, buyer = account()
    sold = hold(client, f, buyer).json()
    assert confirm(client, sold, buyer, [("Aru", email)]).status_code == 200
    _, _, other = account()
    stale = hold(client, f, other, quantity=2).json()
    overdue(factory, stale["id"], sold["id"])

    # No checkout request touches the event; two sweepers race on it.
    with ThreadPoolExecutor(max_workers=2) as pool:
        released = list(pool.map(lambda _: sweep_expired_holds(factory), range(2)))
    assert sum(released) == 1
    assert sweep_expired_holds(factory) == 0
    with factory() as db:
        assert db.get(Hold, UUID(stale["id"])).status == "expired"
        assert db.get(Hold, UUID(sold["id"])).status == "consumed"
        states = dict(
            db.execute(
                select(Allocation.state, func.count(Allocation.id)).group_by(Allocation.state)
            ).all()
        )
        assert states == {"sold": 1, "released": 2}
        expired = select(func.count(AuditLog.id)).where(AuditLog.action == "checkout.holds_expired")
        assert db.scalar(expired) == 1


def test_failed_confirmation_still_releases_expired_stock(client, setup, account, factory):
    f = published(client, setup)
    email, _, buyer = account()
    held = hold(client, f, buyer, quantity=3).json()
    overdue(factory, held["id"])
    r = confirm(client, held, buyer, [("A", email), ("B", "b@example.com"), ("C", "c@x.kz")])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "hold_expired"
    with factory() as db:
        assert db.get(Hold, UUID(held["id"])).status == "expired"
        held_rows = select(func.count(Allocation.id)).where(Allocation.state == "held")
        assert db.scalar(held_rows) == 0


def test_overdue_holds_elsewhere_do_not_block_the_cap(client, setup, account, factory):
    events = [published(client, setup) for _ in range(4)]
    _, _, buyer = account()
    holds = [hold(client, f, buyer).json() for f in events[:3]]
    r = hold(client, events[3], buyer)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "too_many_active_holds"
    overdue(factory, *(h["id"] for h in holds))
    assert hold(client, events[3], buyer).status_code == 201


def test_suspended_organization_is_rechecked_under_lock(client, setup, account, factory):
    f = published(client, setup)
    _, _, buyer = account()
    with factory.begin() as db:
        db.execute(
            update(Organization)
            .where(Organization.id == UUID(f["org"]["id"]))
            .values(status="suspended")
        )
    r = hold(client, f, buyer)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "event_not_found"


def test_expired_key_can_be_reused_for_a_new_request(client, setup, account, factory):
    f = published(client, setup)
    _, _, buyer = account()
    key = str(uuid4())
    first = hold(client, f, buyer, quantity=1, key=key).json()
    with factory.begin() as db:
        db.execute(
            update(IdempotencyRecord).values(
                created_at=now() - timedelta(days=2), expires_at=now() - timedelta(days=1)
            )
        )
    second = hold(client, f, buyer, quantity=2, key=key)
    assert second.status_code == 201 and second.json()["id"] != first["id"]
    with factory() as db:
        assert db.scalar(select(func.count(IdempotencyRecord.id))) == 1
