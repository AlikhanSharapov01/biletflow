from datetime import timedelta
from uuid import UUID

from sqlalchemy import event as sa_event
from test_catalog import add_allocation

from app.catalog_models import Event, TicketType
from app.security import now

API = "/api/v1"


def add_type(client, f, price, limit, hidden=False, name="Tier", closes=None, opens=None):
    body = f["ticket_data"] | {
        "name": name,
        "kind": "paid" if price else "free",
        "price_minor": price,
        "quantity_limit": limit,
        "is_hidden": hidden,
    }
    if opens:
        body["sales_open_at"] = opens.isoformat()
    if closes:
        body["sales_close_at"] = closes.isoformat()
    r = client.post(
        API + f"/events/{f['event']['id']}/ticket-types", headers=f["headers"], json=body
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def hide_default_type(client, f):
    r = client.put(
        API + f"/events/{f['event']['id']}/ticket-types/{f['ticket']['id']}",
        headers=f["headers"],
        json=f["ticket_data"] | {"is_hidden": True},
    )
    assert r.status_code == 200, r.text


def roomy(client, f, capacity=50):
    r = client.put(
        API + f"/events/{f['event']['id']}",
        headers=f["headers"],
        json=f["data"] | {"capacity": capacity},
    )
    assert r.status_code == 200, r.text


def fill(factory, f, type_id, count, **kwargs):
    for _ in range(count):
        add_allocation(factory, f, type_id=type_id, **kwargs)


def offer(client, f):
    r = client.get(API + f"/events/{f['event']['id']}", headers=f["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    return body["price_from_minor"], body["sold_out"]


def test_event_without_any_ticket_types(client, setup):
    f = setup()
    r = client.post(
        API + f"/organizations/{f['org']['id']}/events", headers=f["headers"], json=f["data"]
    )
    assert r.status_code == 201, r.text
    assert (r.json()["price_from_minor"], r.json()["sold_out"]) == (None, False)


def test_no_visible_types_is_null_and_not_sold_out(client, setup):
    f = setup()
    hide_default_type(client, f)
    assert offer(client, f) == (None, False)


def test_free_and_paid_types_start_from_zero(client, setup):
    f = setup()
    add_type(client, f, 5000, 5)
    assert offer(client, f) == (0, False)


def test_cheapest_type_sold_out_uses_next_cheapest(client, setup, factory):
    f = setup()
    roomy(client, f)
    add_type(client, f, 5000, 5, name="Standard")
    add_type(client, f, 9000, 5, name="Premium")
    fill(factory, f, f["ticket"]["id"], f["ticket_data"]["quantity_limit"], state="sold")
    assert offer(client, f) == (5000, False)


def test_every_type_sold_out_reports_minimum_of_all(client, setup, factory):
    f = setup()
    roomy(client, f)
    paid = add_type(client, f, 5000, 2)
    fill(factory, f, f["ticket"]["id"], f["ticket_data"]["quantity_limit"])
    fill(factory, f, paid, 2, state="refund_quarantine")
    assert offer(client, f) == (0, True)


def test_event_capacity_reached_while_types_have_room(client, setup, factory):
    f = setup()
    half = f["data"]["capacity"] // 2
    paid = add_type(client, f, 5000, f["data"]["capacity"])
    fill(factory, f, f["ticket"]["id"], half)
    fill(factory, f, paid, half)
    assert offer(client, f) == (0, True)


def test_hidden_and_empty_types_are_ignored(client, setup):
    f = setup()
    add_type(client, f, 100, 5, hidden=True, name="Secret")
    add_type(client, f, 700, 0, name="Empty")
    hide_default_type(client, f)
    assert offer(client, f) == (None, False)
    add_type(client, f, 4000, 5, name="Public")
    assert offer(client, f) == (4000, False)


def test_released_do_not_count_but_held_do(client, setup, factory):
    f = setup()
    roomy(client, f)
    hide_default_type(client, f)
    only = add_type(client, f, 2500, 2)
    fill(factory, f, only, 2, state="released")
    assert offer(client, f) == (2500, False)
    fill(factory, f, only, 2, state="held")
    assert offer(client, f) == (2500, True)


def test_expired_hold_allocations_do_not_count(client, setup, factory):
    f = setup()
    roomy(client, f)
    hide_default_type(client, f)
    only = add_type(client, f, 2500, 2)
    fill(factory, f, only, 2, expired=True)
    assert offer(client, f) == (2500, False)
    fill(factory, f, only, 2, state="sold", expired=True)
    assert offer(client, f) == (2500, True)


def test_closed_early_bird_with_stock_is_skipped(client, setup):
    f = setup()
    hide_default_type(client, f)
    add_type(
        client,
        f,
        1000,
        5,
        name="Early bird",
        opens=now() - timedelta(hours=23),
        closes=now() - timedelta(hours=1),
    )
    add_type(client, f, 4000, 5, name="Regular")
    assert offer(client, f) == (4000, False)


def test_all_in_stock_types_closed_falls_back_to_cheapest(client, setup):
    f = setup()
    hide_default_type(client, f)
    past = {"opens": now() - timedelta(hours=23), "closes": now() - timedelta(hours=1)}
    add_type(client, f, 1000, 5, name="Early bird", **past)
    add_type(client, f, 3000, 5, name="Regular", **past)
    assert offer(client, f) == (1000, False)


def test_future_opening_type_counts_for_price(client, setup):
    f = setup()
    hide_default_type(client, f)
    add_type(
        client,
        f,
        1500,
        5,
        name="Late release",
        opens=now() + timedelta(days=2),
        closes=now() + timedelta(days=5),
    )
    add_type(client, f, 4000, 5, name="Regular")
    assert offer(client, f) == (1500, False)


def seated_event(client, setup):
    f = setup(assigned=True)
    eid, tid, headers = f["event"]["id"], f["ticket"]["id"], f["headers"]
    r = client.post(
        API + f"/events/{eid}/seats/configure",
        headers=headers,
        json={"ticket_types": {"premium": tid, "standard": tid}},
    )
    assert r.status_code == 200, r.text
    seats = client.get(API + f"/events/{eid}/seats", headers=headers, params={"limit": 100})
    assert seats.status_code == 200, seats.text
    seats = seats.json()["items"]
    return f, [seat["id"] for seat in seats]


def test_assigned_seating_without_free_seats_is_sold_out(client, setup, factory):
    f, seats = seated_event(client, setup)
    half = len(seats) // 2
    for seat in seats[:half]:
        add_allocation(factory, f, seat_id=seat)
    for seat in seats[half:]:
        r = client.patch(
            API + f"/events/{f['event']['id']}/seats/{seat}",
            headers=f["headers"],
            json={"is_blocked": True},
        )
        assert r.status_code == 200, r.text
    assert half < f["ticket_data"]["quantity_limit"]
    assert offer(client, f) == (0, True)


def test_seated_draft_without_mapped_seats_is_sold_out(client, setup):
    f = setup(assigned=True)
    assert offer(client, f) == (0, True)


def test_assigned_seating_with_free_seats_is_available(client, setup, factory):
    f, seats = seated_event(client, setup)
    add_allocation(factory, f, seat_id=seats[0])
    assert offer(client, f) == (0, False)


def test_discover_list_detail_and_managed_carry_the_fields(client, setup):
    f = setup()
    add_type(client, f, 3000, 5)
    published = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert published.json()["price_from_minor"] == 0
    listed = client.get(API + "/events").json()
    assert [(e["price_from_minor"], e["sold_out"]) for e in listed] == [(0, False)]
    assert offer(client, f) == (0, False)
    managed = client.get(
        API + f"/organizations/{f['org']['id']}/events", headers=f["headers"]
    ).json()
    assert [(e["price_from_minor"], e["sold_out"]) for e in managed] == [(0, False)]
    draft = client.post(
        API + f"/organizations/{f['org']['id']}/events", headers=f["headers"], json=f["data"]
    ).json()
    managed = client.get(
        API + f"/organizations/{f['org']['id']}/events", headers=f["headers"]
    ).json()
    assert {e["id"]: (e["price_from_minor"], e["sold_out"]) for e in managed} == {
        f["event"]["id"]: (0, False),
        draft["id"]: (None, False),
    }


def publish(client, f):
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text


def listed_offers(client):
    return {
        e["id"]: (e["price_from_minor"], e["sold_out"]) for e in client.get(API + "/events").json()
    }


def test_list_reports_each_events_own_offer(client, setup, account, factory):
    priced, free, sold = (setup(headers=account()[2]) for _ in range(3))
    hide_default_type(client, priced)
    add_type(client, priced, 3000, 5)
    fill(
        factory,
        sold,
        sold["ticket"]["id"],
        sold["ticket_data"]["quantity_limit"],
        state="sold",
    )
    for f in (priced, free, sold):
        publish(client, f)
    offers = listed_offers(client)
    assert offers == {
        priced["event"]["id"]: (3000, False),
        free["event"]["id"]: (0, False),
        sold["event"]["id"]: (0, True),
    }


def offer_queries(app, client):
    seen = []

    def count(conn, cursor, statement, *args):
        if "ticket_type" in statement or "inventory_allocation" in statement:
            seen.append(statement)

    sa_event.listen(app.state.engine, "before_cursor_execute", count)
    try:
        assert client.get(API + "/events").status_code == 200
    finally:
        sa_event.remove(app.state.engine, "before_cursor_execute", count)
    return len(seen)


def test_general_admission_page_uses_two_offer_queries(client, setup, account, app):
    for _ in range(2):
        f = setup(headers=account()[2])
        publish(client, f)
    assert offer_queries(app, client) == 2


def test_offer_queries_stay_constant(client, setup, account, app):
    # General, priced and seated events: ticket types, allocations and free seats.
    seated, _ = seated_event(client, setup)
    publish(client, seated)
    one = offer_queries(app, client)
    for _ in range(3):
        extra = setup(headers=account()[2])
        add_type(client, extra, 1000, 3)
        publish(client, extra)
    assert len(client.get(API + "/events").json()) == 4
    assert offer_queries(app, client) == one == 3


def discover_ids(client, **params):
    r = client.get(API + "/events", params=params)
    assert r.status_code == 200, r.text
    return [e["id"] for e in r.json()]


def listed_price(client, f):
    return {e["id"]: e["price_from_minor"] for e in client.get(API + "/events").json()}[
        f["event"]["id"]
    ]


def test_price_filter_ignores_sold_out_cheaper_tier(client, setup, factory):
    f = setup()
    hide_default_type(client, f)
    cheap = add_type(client, f, 1000, 2, name="Cheap")
    add_type(client, f, 5000, 5, name="Regular")
    fill(factory, f, cheap, 2, state="sold")
    publish(client, f)
    eid = f["event"]["id"]
    assert listed_price(client, f) == 5000
    assert eid not in discover_ids(client, min_price=0, max_price=2000)
    assert eid in discover_ids(client, min_price=4000, max_price=6000)


def test_price_filter_ignores_closed_sales_tier(client, setup):
    f = setup()
    hide_default_type(client, f)
    add_type(
        client,
        f,
        1000,
        5,
        name="Early bird",
        opens=now() - timedelta(hours=23),
        closes=now() - timedelta(hours=1),
    )
    add_type(client, f, 5000, 5, name="Regular")
    publish(client, f)
    eid = f["event"]["id"]
    assert listed_price(client, f) == 5000
    assert eid not in discover_ids(client, max_price=2000)
    assert eid in discover_ids(client, max_price=5000)


def test_free_filter_matches_free_label(client, setup, account, factory):
    mixed, free = (setup(headers=account()[2]) for _ in range(2))
    roomy(client, mixed)
    add_type(client, mixed, 3000, 5, name="Paid")
    fill(factory, mixed, mixed["ticket"]["id"], 12, state="sold")
    for f in (mixed, free):
        publish(client, f)
    assert listed_price(client, mixed) == 3000
    assert listed_price(client, free) == 0
    assert discover_ids(client, free="true") == [free["event"]["id"]]
    assert discover_ids(client, free="false") == [mixed["event"]["id"]]


def test_sold_out_event_filters_on_its_shown_price(client, setup, factory):
    f = setup()
    hide_default_type(client, f)
    a = add_type(client, f, 2000, 2, name="A")
    b = add_type(client, f, 4000, 2, name="B")
    fill(factory, f, a, 2, state="sold")
    fill(factory, f, b, 2, state="sold")
    publish(client, f)
    assert offer(client, f) == (2000, True)
    assert f["event"]["id"] in discover_ids(client, max_price=2500)
    assert f["event"]["id"] not in discover_ids(client, min_price=3000)


def test_seated_sold_out_event_filters_on_its_shown_price(client, setup, factory):
    f, seats = seated_event(client, setup)
    for seat in seats:
        add_allocation(factory, f, seat_id=seat, state="sold")
    add_type(client, f, 7000, 3, name="Standing")
    publish(client, f)
    assert offer(client, f) == (0, True)
    assert listed_price(client, f) == 0
    assert f["event"]["id"] in discover_ids(client, free="true")


def test_price_filter_paginates_after_filtering(client, setup, account):
    events = []
    for price in (1000, 9000, 2000):
        f = setup(headers=account()[2])
        hide_default_type(client, f)
        add_type(client, f, price, 5)
        publish(client, f)
        events.append(f["event"]["id"])
    expected = [events[0], events[2]]
    assert discover_ids(client, max_price=3000) == expected
    assert discover_ids(client, max_price=3000, limit=1, offset=1) == [expected[1]]


def test_ends_after_hides_finished_events(client, setup, account, factory):
    done, running, later = (setup(headers=account()[2]) for _ in range(3))
    for f in (done, running, later):
        publish(client, f)
    moments = [
        (done, now() - timedelta(hours=3), now() - timedelta(hours=1)),
        (running, now() - timedelta(hours=1), now() + timedelta(hours=1)),
        (later, now() + timedelta(days=1), now() + timedelta(days=1, hours=2)),
    ]
    windows = (
        "registration_opens_at",
        "registration_closes_at",
        "admission_opens_at",
        "admission_closes_at",
        "refund_cutoff_at",
    )
    with factory.begin() as db:
        for f, start, end in moments:
            row = db.get(Event, UUID(f["event"]["id"]))
            shift = start - row.starts_at
            for name in windows:
                setattr(row, name, getattr(row, name) + shift)
            row.starts_at, row.ends_at = start, end
    ids = [f["event"]["id"] for f in (done, running, later)]
    assert discover_ids(client) == ids
    assert discover_ids(client, ends_after=now().isoformat()) == ids[1:]


def agree(client, f):
    """The card's price and the price filter pick the same event, at the same boundary."""
    price = listed_price(client, f)
    eid = f["event"]["id"]
    assert eid in discover_ids(client, min_price=price, max_price=price)
    if price:
        assert eid not in discover_ids(client, max_price=price - 1)
    assert eid not in discover_ids(client, min_price=price + 1)
    return price


def test_filter_and_card_agree_when_a_hold_expired(client, setup, factory):
    f = setup()
    hide_default_type(client, f)
    cheap = add_type(client, f, 1000, 2, name="Cheap")
    add_type(client, f, 5000, 5, name="Regular")
    fill(factory, f, cheap, 2, state="held", expired=True)
    publish(client, f)
    assert agree(client, f) == 1000


def test_filter_and_card_agree_when_a_hold_is_live(client, setup, factory):
    f = setup()
    hide_default_type(client, f)
    cheap = add_type(client, f, 1000, 2, name="Cheap")
    add_type(client, f, 5000, 5, name="Regular")
    fill(factory, f, cheap, 2, state="held")
    publish(client, f)
    assert agree(client, f) == 5000


def test_filter_and_card_agree_when_every_sale_closed(client, setup, factory):
    f = setup()
    hide_default_type(client, f)
    a = add_type(client, f, 1000, 2, name="A")
    b = add_type(client, f, 3000, 2, name="B")
    c = add_type(client, f, 500, 2, name="C")
    publish(client, f)
    fill(factory, f, c, 2, state="sold")
    with factory.begin() as db:
        for type_id in (a, b, c):
            row = db.get(TicketType, UUID(type_id))
            row.sales_open_at = now() - timedelta(hours=5)
            row.sales_close_at = now() - timedelta(hours=1)
    assert offer(client, f) == (1000, False)
    assert agree(client, f) == 1000


def test_filter_and_card_agree_when_capacity_is_reached(client, setup, factory):
    f = setup()
    hide_default_type(client, f)
    cap = f["data"]["capacity"]
    a = add_type(client, f, 2000, cap, name="A")
    add_type(client, f, 6000, cap, name="B")
    fill(factory, f, a, cap, state="sold")
    publish(client, f)
    assert offer(client, f)[1] is True
    assert agree(client, f) == 2000
