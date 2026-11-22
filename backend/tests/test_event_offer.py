from datetime import timedelta
from uuid import UUID

from sqlalchemy import event as sa_event

from app.catalog_models import Allocation, Hold
from app.security import now

API = "/api/v1"


def add_type(client, f, price, limit, hidden=False, name="Tier"):
    body = f["ticket_data"] | {
        "name": name,
        "kind": "paid" if price else "free",
        "price_minor": price,
        "quantity_limit": limit,
        "is_hidden": hidden,
    }
    r = client.post(
        API + f"/events/{f['event']['id']}/ticket-types", headers=f["headers"], json=body
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def drop_default_type(client, f):
    body = f["ticket_data"] | {"is_hidden": True}
    r = client.put(
        API + f"/events/{f['event']['id']}/ticket-types/{f['ticket']['id']}",
        headers=f["headers"],
        json=body,
    )
    assert r.status_code == 200, r.text


def allocate(factory, f, type_id, count=1, state="held"):
    with factory.begin() as db:
        hold = Hold(
            event_id=UUID(f["event"]["id"]),
            buyer_user_id=UUID(f["org"]["owner_user_id"]),
            expires_at=now() + timedelta(minutes=10),
        )
        db.add(hold)
        db.flush()
        for _ in range(count):
            reason = {"released": "abandoned"}.get(state)
            db.add(
                Allocation(
                    event_id=hold.event_id,
                    hold_id=hold.id,
                    ticket_type_id=UUID(type_id),
                    state=state,
                    released_at=now() if state == "released" else None,
                    release_reason=reason,
                )
            )


def offer(client, f):
    r = client.get(API + f"/events/{f['event']['id']}", headers=f["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    return body["price_from_minor"], body["sold_out"]


def test_no_visible_types_is_null_and_not_sold_out(client, setup):
    f = setup()
    drop_default_type(client, f)
    assert offer(client, f) == (None, False)


def test_free_and_paid_types_start_from_zero(client, setup):
    f = setup()
    add_type(client, f, 5000, 5)
    assert offer(client, f) == (0, False)


def test_cheapest_type_sold_out_uses_next_cheapest(client, setup, factory):
    f = setup()
    body = f["data"] | {"capacity": 50}
    r = client.put(API + f"/events/{f['event']['id']}", headers=f["headers"], json=body)
    assert r.status_code == 200, r.text
    add_type(client, f, 5000, 5, name="Standard")
    add_type(client, f, 9000, 5, name="Premium")
    allocate(factory, f, f["ticket"]["id"], 12, state="sold")
    assert offer(client, f) == (5000, False)


def test_every_type_sold_out_reports_minimum_of_all(client, setup, factory):
    f = setup()
    body = f["data"] | {"capacity": 50}
    client.put(API + f"/events/{f['event']['id']}", headers=f["headers"], json=body)
    paid = add_type(client, f, 5000, 2)
    allocate(factory, f, f["ticket"]["id"], 12)
    allocate(factory, f, paid, 2, state="refund_quarantine")
    assert offer(client, f) == (0, True)


def test_event_capacity_reached_while_types_have_room(client, setup, factory):
    f = setup()
    paid = add_type(client, f, 5000, 12)
    allocate(factory, f, f["ticket"]["id"], 6)
    allocate(factory, f, paid, 6)
    assert offer(client, f) == (0, True)


def test_hidden_types_are_ignored(client, setup):
    f = setup()
    add_type(client, f, 100, 5, hidden=True, name="Secret")
    add_type(client, f, 700, 0, name="Empty")
    drop_default_type(client, f)
    assert offer(client, f) == (None, False)
    add_type(client, f, 4000, 5, name="Public")
    assert offer(client, f) == (4000, False)


def test_released_allocations_do_not_count_but_held_do(client, setup, factory):
    f = setup()
    body = f["data"] | {"capacity": 50}
    client.put(API + f"/events/{f['event']['id']}", headers=f["headers"], json=body)
    drop_default_type(client, f)
    only = add_type(client, f, 2500, 2)
    allocate(factory, f, only, 2, state="released")
    assert offer(client, f) == (2500, False)
    allocate(factory, f, only, 2, state="held")
    assert offer(client, f) == (2500, True)


def test_discover_list_and_detail_carry_the_fields(client, setup):
    f = setup()
    add_type(client, f, 3000, 5)
    assert (
        client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"]).json()[
            "price_from_minor"
        ]
        == 0
    )
    listed = client.get(API + "/events").json()
    assert [(e["price_from_minor"], e["sold_out"]) for e in listed] == [(0, False)]
    detail = client.get(API + f"/events/{f['event']['id']}").json()
    assert (detail["price_from_minor"], detail["sold_out"]) == (0, False)
    managed = client.get(
        API + f"/organizations/{f['org']['id']}/events", headers=f["headers"]
    ).json()
    assert [(e["price_from_minor"], e["sold_out"]) for e in managed] == [(0, False)]


def offer_queries(engine, client):
    seen = []

    def count(conn, cursor, statement, *args):
        if "ticket_type" in statement or "inventory_allocation" in statement:
            seen.append(statement)

    sa_event.listen(engine, "before_cursor_execute", count)
    try:
        assert client.get(API + "/events").status_code == 200
    finally:
        sa_event.remove(engine, "before_cursor_execute", count)
    return len(seen)


def test_list_query_count_does_not_grow_with_events(client, setup, account, factory):
    first = setup()
    client.post(API + f"/events/{first['event']['id']}/publish", headers=first["headers"])
    engine = factory.kw["bind"]
    one = offer_queries(engine, client)
    for _ in range(3):
        extra = setup(headers=account()[2])
        add_type(client, extra, 1000, 3)
        client.post(API + f"/events/{extra['event']['id']}/publish", headers=extra["headers"])
    assert len(client.get(API + "/events").json()) == 4
    assert offer_queries(engine, client) == one
