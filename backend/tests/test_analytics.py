from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import update
from test_admission import free_ticket, published, scan, staff
from test_campaigns import create as create_campaign
from test_paid_orders import PRICE, body, buyer_order, hold, paid_event, pay
from test_refunds import refund, settle

from app.catalog_models import Event, Hold
from app.checkout_expiry import sweep_expired_holds
from app.checkout_models import TicketOrder
from app.commerce_models import PaymentAttempt

API = "/api/v1"


def analytics(client, f, **params):
    return client.get(
        API + f"/events/{f['event']['id']}/analytics", headers=f["headers"], params=params
    )


def test_paid_refund_rebuy_and_free_reconcile(client, setup, account, factory):
    f = paid_event(client, setup)
    old, buyer, _ = buyer_order(client, account, f, quantity=2)
    pay(client, buyer, old["payment"]["id"], "succeeded")
    pending = refund(client, f, old)
    assert pending.status_code == 200
    data = analytics(client, f)
    assert data.status_code == 200, data.text
    assert data.json()["inventory"]["sold"] == 2
    assert data.json()["inventory"]["refund_pending"] == 2
    assert data.json()["revenue"]["pending_refunds_minor"] == 2 * PRICE
    assert data.json()["attendance"]["issued"] == 0
    settle(client, factory, old["id"], buyer)
    new, buyer2, _ = buyer_order(client, account, f)
    pay(client, buyer2, new["payment"]["id"], "succeeded")
    email, _, free_buyer = account()
    held = hold(client, f, free_buyer, f["ticket"]["id"])
    assert (
        client.post(
            API + f"/holds/{held['id']}/confirm",
            headers=free_buyer,
            json=body(held, [("Free", email)]),
        ).status_code
        == 200
    )
    result = analytics(client, f).json()
    assert result["inventory"]["sold"] == 2
    assert result["inventory"]["sold_percentage"] == pytest.approx(100 / 6)
    assert result["attendance"]["issued"] == 2
    assert result["attendance"]["checked_in"] == 0
    assert result["attendance"]["not_checked_in_label"] == "not_yet_checked_in"
    revenue = result["revenue"]
    assert revenue["gross_minor"] == revenue["collected_minor"] == 3 * PRICE
    assert revenue["refunds_minor"] == 2 * PRICE
    assert revenue["fees_minor"] == PRICE * 3 // 100
    assert revenue["fee_reversals_minor"] == 2 * PRICE * 3 // 100
    assert revenue["net_minor"] == PRICE * 97 // 100
    assert sum(row["revenue_minor"] for row in result["by_ticket_type"]) == revenue["net_minor"]
    assert sum(row["revenue_minor"] for row in result["by_campaign"]) == revenue["net_minor"]
    assert result["filters"] == {
        "from": None,
        "to": None,
        "ticket_type_id": None,
        "campaign_id": None,
    }
    assert result["definitions"] and result["generated_at"] and result["timezone"]


def test_campaign_discount_and_filters(client, setup, account, factory):
    f = paid_event(client, setup)
    campaign = create_campaign(client, f, code="OFF10", eligible_ticket_type_ids=[f["paid"]["id"]])
    email, _, buyer = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": f["paid"]["id"], "quantity": 2}], "promo_code": "OFF10"},
    ).json()
    order = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=buyer,
        json=body(held, [("A", email), ("B", email)]),
    ).json()
    pay(client, buyer, order["payment"]["id"], "succeeded")
    result = analytics(client, f, campaign_id=campaign["id"]).json()
    assert result["revenue"]["gross_minor"] == 800000
    assert result["revenue"]["discount_minor"] == 80000
    assert result["revenue"]["collected_minor"] == 720000
    assert result["revenue"]["net_minor"] == 698400
    row = result["by_campaign"][0]
    assert row["campaign_id"] == campaign["id"] and row["redemptions"] == 1
    assert row["original_tickets"] == row["retained_tickets"] == 2
    assert row["refunded_tickets"] == 0
    assert (
        analytics(client, f, ticket_type_id=f["ticket"]["id"]).json()["revenue"]["gross_minor"] == 0
    )
    assert refund(client, f, order).status_code == 200
    settle(client, factory, order["id"], buyer)
    row = analytics(client, f, campaign_id=campaign["id"]).json()["by_campaign"][0]
    assert row["redemptions"] == 1 and row["original_tickets"] == row["refunded_tickets"] == 2
    assert row["retained_tickets"] == row["revenue_minor"] == 0


def test_dates_and_timezone_series(client, setup, account, factory):
    f = paid_event(client, setup)
    first, buyer, _ = buyer_order(client, account, f)
    second, buyer2, _ = buyer_order(client, account, f)
    pay(client, buyer, first["payment"]["id"], "succeeded")
    pay(client, buyer2, second["payment"]["id"], "succeeded")
    instant = datetime(2026, 10, 1, 20, 30, tzinfo=UTC)
    with factory.begin() as db:
        db.execute(
            update(Event).where(Event.id == UUID(f["event"]["id"])).values(time_zone="Asia/Almaty")
        )
        db.execute(
            update(TicketOrder)
            .where(TicketOrder.id == UUID(first["id"]))
            .values(confirmed_at=instant)
        )
        db.execute(
            update(TicketOrder)
            .where(TicketOrder.id == UUID(second["id"]))
            .values(confirmed_at=instant + timedelta(days=1))
        )
    params = {"from": instant.isoformat(), "to": (instant + timedelta(days=1)).isoformat()}
    result = analytics(client, f, **params).json()
    assert result["revenue"]["gross_minor"] == PRICE
    for bucket, expected in (
        ("day", "2026-10-02T00:00:00+05:00"),
        ("hour", "2026-10-02T01:00:00+05:00"),
    ):
        r = client.get(
            API + f"/events/{f['event']['id']}/analytics/sales-series",
            headers=f["headers"],
            params=params | {"bucket": bucket},
        )
        assert r.status_code == 200, r.text
        assert r.json()["points"] == [
            {"bucket_start": expected, "tickets": 1, "revenue_minor": PRICE}
        ]


def test_zero_denominators(client, setup, factory):
    f = setup()
    with factory.begin() as db:
        db.execute(update(Event).where(Event.id == UUID(f["event"]["id"])).values(capacity=0))
    r = analytics(client, f)
    assert r.status_code == 200, r.text
    assert r.json()["inventory"]["sold_percentage"] == 0
    assert r.json()["attendance"]["percentage"] == 0
    assert r.json()["revenue"]["net_minor"] == 0


def test_expired_hold_is_separate_and_still_blocks_available(client, setup, account, factory):
    f = published(client, setup, factory)
    _, _, buyer = account()
    held = hold(client, f, buyer, f["ticket"]["id"])
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
    inventory = analytics(client, f).json()["inventory"]
    assert inventory["held"] == inventory["sold"] == 0
    assert inventory["expired_held"] == 1 and inventory["available"] == 11


def test_extra_charge_compensation_does_not_double_count_sales(client, setup, account, factory):
    f = paid_event(client, setup)
    order, buyer, _ = buyer_order(client, account, f, quantity=2)
    first = order["payment"]["id"]
    pay(client, buyer, first, "failed")
    second = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=buyer).json()[
        "payment"
    ]["id"]
    pay(client, buyer, second, "succeeded")
    pay(client, buyer, first, "succeeded")
    # The simulator stores canonical fees on order items; extra captures may have
    # their own actual provider fee. An odd minor unit must survive allocation.
    with factory.begin() as db:
        db.execute(
            update(PaymentAttempt)
            .where(PaymentAttempt.id == UUID(first))
            .values(processing_fee_minor=1)
        )
    result = analytics(client, f).json()
    assert result["inventory"]["sold"] == 2
    assert result["revenue"]["gross_minor"] == 2 * PRICE
    assert result["revenue"]["collected_minor"] == 4 * PRICE
    assert result["revenue"]["pending_refunds_minor"] == 2 * PRICE
    assert result["revenue"]["fees_minor"] == 2 * PRICE * 3 // 100 + 1
    settle(client, factory, order["id"], buyer)
    result = analytics(client, f).json()
    assert result["revenue"]["collected_minor"] == 4 * PRICE
    assert result["revenue"]["refunds_minor"] == 2 * PRICE
    assert result["revenue"]["net_minor"] == 2 * PRICE * 97 // 100
    assert result["revenue"]["fee_reversals_minor"] == 1
    assert result["inventory"]["sold"] == result["attendance"]["issued"] == 2


def test_current_admission_ignores_reversals(
    client, setup, account, factory, settings, no_entry_confirmation
):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan", "reverse_checkin"])
    ticket, _ = free_ticket(client, account, f)
    admitted = scan(client, f, scanner, ticket["qr_payload"]).json()
    assert analytics(client, f).json()["attendance"]["percentage"] == 100
    assert (
        client.post(
            API + f"/scanner/check-ins/{admitted['check_in_id']}/reverse",
            headers=scanner,
            json={"reason": "Accidental scan"},
        ).status_code
        == 200
    )
    result = analytics(client, f).json()
    assert result["attendance"]["issued"] == 1 and result["attendance"]["checked_in"] == 0
    assert result["by_ticket_type"][0]["checked_in"] == 0


def test_cross_event_filters_rejected(client, setup):
    one, two = setup(), setup()
    assert analytics(client, one, ticket_type_id=two["ticket"]["id"]).status_code == 422
    campaign = create_campaign(client, two)
    assert analytics(client, one, campaign_id=campaign["id"]).status_code == 422


def test_mixed_campaign_items_reconcile_and_saved_fees_survive_price_edits(
    client, setup, account, factory
):
    f = paid_event(client, setup)
    other = client.post(
        API + f"/events/{f['event']['id']}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Other paid", "kind": "paid", "price_minor": 100001},
    ).json()
    campaign = create_campaign(
        client,
        f,
        code="ONE",
        discount_kind="fixed",
        value=1,
        eligible_ticket_type_ids=[f["paid"]["id"]],
    )
    email, _, buyer = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=buyer,
        json={
            "items": [
                {"ticket_type_id": f["paid"]["id"], "quantity": 1},
                {"ticket_type_id": other["id"], "quantity": 1},
            ],
            "promo_code": "ONE",
        },
    ).json()
    order = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=buyer,
        json=body(held, [("A", email), ("B", email)]),
    ).json()
    pay(client, buyer, order["payment"]["id"], "succeeded")
    result = analytics(client, f).json()
    assert result["revenue"]["gross_minor"] == 500001
    assert result["revenue"]["discount_minor"] == 1
    assert result["revenue"]["collected_minor"] == 500000
    assert result["revenue"]["fees_minor"] == 15000
    assert result["revenue"]["net_minor"] == 485000
    assert len(result["by_campaign"]) == 2
    assert sum(row["revenue_minor"] for row in result["by_campaign"]) == 485000
    attributed = analytics(client, f, campaign_id=campaign["id"]).json()
    assert attributed["revenue"]["collected_minor"] == 399999
    assert attributed["inventory"]["sold"] == 1
    assert attributed["by_campaign"][0]["original_tickets"] == 1
    assert (
        analytics(client, f, ticket_type_id=other["id"]).json()["revenue"]["collected_minor"]
        == 100001
    )
    # Change present-day price, preserving all saved purchase/fee allocations.
    changed = client.put(
        API + f"/events/{f['event']['id']}/ticket-types/{other['id']}",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Other paid", "kind": "paid", "price_minor": 900000},
    )
    assert changed.status_code == 200, changed.text
    assert analytics(client, f).json()["revenue"] == result["revenue"]


def test_read_does_not_wait_for_event_writer(client, setup, factory):
    from sqlalchemy import text

    f = setup()
    with factory.begin() as writer:
        writer.execute(
            text("SELECT id FROM biletflow.event WHERE id=:id FOR UPDATE"),
            {"id": UUID(f["event"]["id"])},
        )
        result = analytics(client, f)
        assert result.status_code == 200, result.text


def test_late_charge_has_no_fulfilled_sales_and_compensation_reconciles(
    client, setup, account, factory
):
    f = paid_event(client, setup)
    order, buyer, held = buyer_order(client, account, f)
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
    assert sweep_expired_holds(factory) == 1
    pay(client, buyer, order["payment"]["id"], "succeeded")
    result = analytics(client, f).json()
    assert result["inventory"]["sold"] == result["attendance"]["issued"] == 0
    assert result["revenue"]["gross_minor"] == result["revenue"]["fulfilled_collected_minor"] == 0
    assert (
        result["revenue"]["collected_minor"] == result["revenue"]["pending_refunds_minor"] == PRICE
    )
    settle(client, factory, order["id"], buyer)
    result = analytics(client, f).json()
    assert result["revenue"]["net_minor"] == result["revenue"]["pending_refunds_minor"] == 0
    assert result["revenue"]["refunds_minor"] == PRICE


def test_fully_discounted_paid_ticket_has_attendance_without_fake_charge(client, setup, account):
    f = paid_event(client, setup)
    campaign = create_campaign(client, f, code="FREE100", value=100)
    email, _, buyer = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=buyer,
        json={
            "items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}],
            "promo_code": "FREE100",
        },
    ).json()
    done = client.post(
        API + f"/holds/{held['id']}/checkout", headers=buyer, json=body(held, [("A", email)])
    )
    assert done.status_code == 200, done.text
    result = analytics(client, f).json()
    assert result["inventory"]["sold"] == result["attendance"]["issued"] == 1
    assert result["revenue"]["gross_minor"] == result["revenue"]["discount_minor"] == PRICE
    assert result["revenue"]["collected_minor"] == result["revenue"]["net_minor"] == 0
    assert result["by_campaign"][0]["campaign_id"] == campaign["id"]
    assert result["by_campaign"][0]["redemptions"] == 1


def test_reports_permission_and_event_scope(client, setup, account, settings):
    f = setup()
    _, _, outsider = account()
    url = API + f"/events/{f['event']['id']}/analytics"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=outsider).status_code == 404
    scanner = staff(client, settings, account, f, ["scan"])
    assert client.get(url, headers=scanner).status_code == 403
    reporter = staff(client, settings, account, f, ["reports"])
    assert client.get(url, headers=reporter).status_code == 200


@pytest.mark.parametrize(
    "params",
    [
        {"from": "bad"},
        {"from": "2026-10-01T00:00:00"},
        {"from": "2026-10-02T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
        {"ticket_type_id": "bad"},
        {"ticket_type_id": str(uuid4())},
        {"campaign_id": str(uuid4())},
    ],
)
def test_invalid_filters(client, setup, params):
    assert analytics(client, setup(), **params).status_code == 422


def test_invalid_bucket(client, setup):
    f = setup()
    r = client.get(
        API + f"/events/{f['event']['id']}/analytics/sales-series",
        headers=f["headers"],
        params={"bucket": "month"},
    )
    assert r.status_code == 422


def test_analytics_openapi_contract_without_database():
    from app.config import Settings
    from app.main import create_app

    app = create_app(
        Settings(
            _env_file=None,
            database_url="postgresql+psycopg://localhost/unused_test",
            jwt_secret="j" * 48,
            challenge_secret="c" * 48,
        )
    )
    try:
        paths = app.openapi()["paths"]
        assert API + "/events/{event_id}/analytics" in paths
        assert API + "/events/{event_id}/analytics/sales-series" in paths
    finally:
        app.state.engine.dispose()
