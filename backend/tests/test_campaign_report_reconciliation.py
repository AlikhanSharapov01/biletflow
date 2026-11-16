"""The per-campaign report and the event analytics must tell the same story (BF-09/BF-18)."""

from test_analytics import analytics
from test_campaigns import create as create_campaign
from test_campaigns import path
from test_paid_orders import PRICE, body, pay
from test_refunds import refund, settle

API = "/api/v1"
OTHER_PRICE = 100001

# Report field -> analytics ``by_campaign`` field. Both must be the same number.
SHARED = {
    "redemptions": "redemptions",
    "tickets": "original_tickets",
    "tickets_refunded": "refunded_tickets",
    "tickets_kept": "retained_tickets",
    "discount_minor": "discount_minor",
    "collected_minor": "collected_minor",
    "refunds_minor": "refunds_minor",
    "pending_refunds_minor": "pending_refunds_minor",
    "fees_minor": "fees_minor",
    "net_minor": "revenue_minor",
}


def mixed_event(client, setup, paid_event_factory):
    """Paid event with a second, ineligible ticket type and a KZT 0.01 fixed campaign."""
    f = paid_event_factory(client, setup)
    other = client.post(
        API + f"/events/{f['event']['id']}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"]
        | {"name": "Other paid", "kind": "paid", "price_minor": OTHER_PRICE, "quantity_limit": 12},
    ).json()
    campaign = create_campaign(
        client,
        f,
        code="ONE",
        discount_kind="fixed",
        value=1,
        eligible_ticket_type_ids=[f["paid"]["id"]],
    )
    return f, other, campaign


def mixed_order(client, account, f, other, quantity_eligible=1):
    email, _, buyer = account()
    items = [
        {"ticket_type_id": f["paid"]["id"], "quantity": quantity_eligible},
        {"ticket_type_id": other["id"], "quantity": 1},
    ]
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=buyer,
        json={"items": items, "promo_code": "ONE"},
    )
    assert held.status_code == 201, held.text
    held = held.json()
    recipients = [(f"Guest {i}", email) for i in range(quantity_eligible + 1)]
    order = client.post(
        API + f"/holds/{held['id']}/checkout", headers=buyer, json=body(held, recipients)
    )
    assert order.status_code == 200, order.text
    return order.json(), buyer


def report(client, f, campaign):
    r = client.get(path(f, campaign, "/report"), headers=f["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def campaign_row(client, f, campaign):
    rows = analytics(client, f).json()["by_campaign"]
    return next(row for row in rows if row["campaign_id"] == campaign["id"])


def assert_same_as_analytics(client, f, campaign):
    data, row = report(client, f, campaign), campaign_row(client, f, campaign)
    for left, right in SHARED.items():
        assert data[left] == row[right], (left, data[left], row[right])
    return data


def test_mixed_basket_only_counts_eligible_lines(client, setup, account):
    from test_paid_orders import paid_event

    f, other, campaign = mixed_event(client, setup, paid_event)
    order, buyer = mixed_order(client, account, f, other)
    pay(client, buyer, order["payment"]["id"], "succeeded")

    data = assert_same_as_analytics(client, f, campaign)
    # Whole order: KZT 5,000.01 face, 0.01 discount, 3% fee on 5,000.00 = 150.00.
    # The eligible line is 4,000.00 - 0.01 and takes 120.00 of the fee; the rest is
    # "Unattributed". The whole-order figures must not leak into the campaign.
    assert data["redemptions"] == data["orders"] == 1
    assert data["tickets"] == data["tickets_kept"] == 1 and data["tickets_refunded"] == 0
    assert data["gross_minor"] == PRICE
    assert data["discount_minor"] == 1
    assert data["collected_minor"] == PRICE - 1
    assert data["fees_minor"] == 12000
    assert data["net_minor"] == PRICE - 1 - 12000
    assert data["refunds_minor"] == data["pending_refunds_minor"] == 0
    assert set(data["definitions"]) >= {"attribution", "net_minor", "fees_minor"}

    whole = analytics(client, f).json()["revenue"]
    others = [
        row
        for row in analytics(client, f).json()["by_campaign"]
        if row["campaign_id"] != campaign["id"]
    ]
    assert whole["net_minor"] == data["net_minor"] + sum(r["revenue_minor"] for r in others)
    assert whole["net_minor"] == PRICE + OTHER_PRICE - 1 - 15000


def test_full_refund_reverses_fees_and_keeps_history(client, setup, account, factory):
    from test_paid_orders import paid_event

    f, other, campaign = mixed_event(client, setup, paid_event)
    order, buyer = mixed_order(client, account, f, other)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    assert refund(client, f, order).status_code == 200

    # Refund requested but not settled: the money is owed, nothing is refunded yet.
    pending = assert_same_as_analytics(client, f, campaign)
    assert pending["pending_refunds_minor"] == PRICE - 1
    assert pending["refunds_minor"] == 0
    assert pending["tickets"] == 1 and pending["tickets_kept"] == 0

    settle(client, factory, order["id"], buyer)
    done = assert_same_as_analytics(client, f, campaign)
    # The simulator returns the fee with the charge, so nothing is retained and net is zero,
    # never negative.
    assert done["refunds_minor"] == done["collected_minor"] == PRICE - 1
    assert done["pending_refunds_minor"] == 0
    assert done["fees_minor"] == 0 and done["net_minor"] == 0
    # History stays attributed to the campaign while retained tickets drop to zero.
    assert done["redemptions"] == 1 and done["tickets"] == 1
    assert done["tickets_refunded"] == 1 and done["tickets_kept"] == 0
    assert done["gross_minor"] == PRICE and done["discount_minor"] == 1


def test_refund_then_rebuy_keeps_both_purchases_distinct(client, setup, account, factory):
    from test_paid_orders import paid_event

    f, other, campaign = mixed_event(client, setup, paid_event)
    first, buyer = mixed_order(client, account, f, other)
    pay(client, buyer, first["payment"]["id"], "succeeded")
    assert refund(client, f, first).status_code == 200
    settle(client, factory, first["id"], buyer)

    second, buyer2 = mixed_order(client, account, f, other)
    pay(client, buyer2, second["payment"]["id"], "succeeded")

    data = assert_same_as_analytics(client, f, campaign)
    assert data["redemptions"] == 2 and data["tickets"] == 2
    assert data["tickets_refunded"] == 1 and data["tickets_kept"] == 1
    assert data["gross_minor"] == 2 * PRICE and data["discount_minor"] == 2
    assert data["collected_minor"] == 2 * (PRICE - 1)
    assert data["refunds_minor"] == PRICE - 1
    # Only the second purchase keeps its retained fee.
    assert data["fees_minor"] == 12000
    assert data["net_minor"] == PRICE - 1 - 12000


def test_report_for_unused_campaign_is_all_zero(client, setup):
    f = setup()
    campaign = create_campaign(client, f, code="EMPTY")
    data = report(client, f, campaign)
    for key in SHARED:
        assert data[key] == 0, key
    assert data["gross_minor"] == 0 and data["campaign_id"] == campaign["id"]
