from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import update
from test_admission import free_ticket, published, scan, staff
from test_paid_orders import buyer_order, hold, paid_event, pay
from test_refunds import refund, settle

from app.catalog_models import Hold
from app.models import AuditLog, OutboxJob
from app.security import now

API = "/api/v1"
METRICS = {"sold", "reserved", "refunded", "checked_in"}


def types(client, f, headers=None):
    r = client.get(
        API + f"/events/{f['event']['id']}/ticket-types", headers=headers or f["headers"]
    )
    assert r.status_code == 200, r.text
    return {row["id"]: row for row in r.json()}


def metrics(row):
    return {key: row[key] for key in METRICS}


def test_counts_refund_quarantine_rebuy_and_expired_hold(client, setup, account, factory):
    f = paid_event(client, setup)
    order, buyer, _ = buyer_order(client, account, f, quantity=2)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    assert refund(client, f, order).status_code == 200
    assert metrics(types(client, f)[f["paid"]["id"]]) == dict(
        sold=2, reserved=0, refunded=0, checked_in=0
    )
    settle(client, factory, order["id"], buyer, "failed")
    assert metrics(types(client, f)[f["paid"]["id"]]) == dict(
        sold=2, reserved=0, refunded=0, checked_in=0
    )
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "refund_dispatch", OutboxJob.status == "pending")
            .values(available_at=now())
        )
    settle(client, factory, order["id"], buyer)
    new, buyer, _ = buyer_order(client, account, f)
    pay(client, buyer, new["payment"]["id"], "succeeded")
    _, _, buyer = account()
    held = hold(client, f, buyer, f["ticket"]["id"])
    _, _, other = account()
    hold(client, f, other, f["paid"]["id"])
    with factory.begin() as db:
        instant = datetime.now(UTC)
        db.execute(
            update(Hold)
            .where(Hold.id == UUID(held["id"]))
            .values(
                created_at=instant - timedelta(minutes=30),
                expires_at=instant - timedelta(minutes=10),
            )
        )
    rows = types(client, f)
    assert metrics(rows[f["paid"]["id"]]) == dict(sold=1, reserved=1, refunded=2, checked_in=0)
    assert metrics(rows[f["ticket"]["id"]]) == dict(sold=0, reserved=0, refunded=0, checked_in=0)


def test_current_checkins_reconcile_and_public_metrics_are_absent(
    client, setup, account, factory, settings, no_entry_confirmation
):
    f = published(client, setup, factory)
    ticket, buyer = free_ticket(client, account, f)
    scanner = staff(client, settings, account, f, ["scan", "reverse_checkin"])
    reporter = staff(client, settings, account, f, ["reports"])
    editor = staff(client, settings, account, f, ["event_edit"])
    hidden = client.post(
        API + f"/events/{f['event']['id']}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Hidden", "is_hidden": True},
    )
    assert hidden.status_code == 201
    assert metrics(hidden.json()) == dict(sold=0, reserved=0, refunded=0, checked_in=0)
    edited = client.put(
        API + f"/events/{f['event']['id']}/ticket-types/{hidden.json()['id']}",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Still hidden", "is_hidden": True},
    )
    assert edited.status_code == 200
    assert metrics(edited.json()) == metrics(hidden.json())
    admitted = scan(client, f, scanner, ticket["qr_payload"]).json()
    for headers in (f["headers"], reporter, editor):
        rows = types(client, f, headers)
        assert rows[f["ticket"]["id"]]["checked_in"] == 1
    counts = client.get(API + f"/scanner/events/{f['event']['id']}/counts", headers=scanner).json()
    assert sum(row["sold"] for row in types(client, f).values()) == counts["registered"]
    assert sum(row["checked_in"] for row in types(client, f).values()) == counts["admitted"]
    for headers in ({}, buyer, scanner):
        r = client.get(API + f"/events/{f['event']['id']}/ticket-types", headers=headers)
        assert len(r.json()) == 1
        assert METRICS.isdisjoint(r.json()[0])
    assert hidden.json()["id"] not in types(client, f, reporter)
    assert (
        client.post(
            API + f"/scanner/check-ins/{admitted['check_in_id']}/reverse",
            headers=scanner,
            json={"reason": "Mistake"},
        ).status_code
        == 200
    )
    assert types(client, f)[f["ticket"]["id"]]["checked_in"] == 0
    assert scan(client, f, scanner, ticket["qr_payload"]).status_code == 200
    assert types(client, f)[f["ticket"]["id"]]["checked_in"] == 1


def history(client, f, **params):
    return client.get(
        API + f"/events/{f['event']['id']}/history", headers=f["headers"], params=params
    )


def test_history_filters_boundaries_and_pagination(client, setup, factory):
    f = setup()
    actor = client.get(API + "/me", headers=f["headers"]).json()["id"]
    instant = datetime(2026, 10, 1, tzinfo=UTC)
    ids = sorted([uuid4(), uuid4()])
    with factory.begin() as db:
        for identifier, action, at in (
            (ids[0], "test.changed", instant),
            (ids[1], "test.changed", instant),
            (uuid4(), "test.changed", instant + timedelta(days=1)),
            (uuid4(), "test.other", instant),
        ):
            db.add(
                AuditLog(
                    id=identifier,
                    event_id=UUID(f["event"]["id"]),
                    organization_id=UUID(f["org"]["id"]),
                    actor_user_id=UUID(actor),
                    action=action,
                    entity_type="event",
                    entity_id=UUID(f["event"]["id"]),
                    description=action,
                    correlation_id=uuid4(),
                    created_at=at,
                )
            )
    params = {
        "actor": actor,
        "action": "test.changed",
        "from": instant.isoformat(),
        "to": (instant + timedelta(days=1)).isoformat(),
    }
    r = history(client, f, **params)
    assert r.status_code == 200, r.text
    assert [row["id"] for row in r.json()] == list(map(str, ids))
    assert history(client, f, **params, limit=1, offset=1).json() == r.json()[1:]
    assert history(client, f, action="test.unknown").json() == []


@pytest.mark.parametrize(
    "params",
    [
        {"actor": "bad"},
        {"action": ""},
        {"action": " "},
        {"action": "a" * 129},
        {"from": "bad"},
        {"from": "2026-10-01T00:00:00"},
        {"from": "2026-10-02T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
        {"from": "2026-10-01T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
    ],
)
def test_history_invalid_filters(client, setup, params):
    assert history(client, setup(), **params).status_code == 422


def test_history_permissions_and_cross_org_actor(client, setup, account, settings):
    f, other = setup(), setup()
    actor = client.get(API + "/me", headers=other["headers"]).json()["id"]
    assert history(client, f, actor=actor).json() == []
    assert history(client, f, actor=str(uuid4())).json() == []
    url = API + f"/events/{f['event']['id']}/history"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=other["headers"]).status_code == 404
    scanner = staff(client, settings, account, f, ["scan"])
    assert client.get(url, headers=scanner).status_code == 403
    reporter = staff(client, settings, account, f, ["reports"])
    assert client.get(url, headers=reporter).status_code == 200
