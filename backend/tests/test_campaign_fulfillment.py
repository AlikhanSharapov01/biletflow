"""Issue #66 (BF-09): a campaign is revalidated when a successful payment is applied.

Each case quotes a discounted paid order, changes the campaign while the payment is pending, then
reports a successful charge for exactly the quoted amount. A campaign that is disabled, ended,
not yet started, or whose discount or eligible types changed issues no tickets: the allowance is
released and the captured charge becomes one `blocked_fulfillment` refund. The quoted price is
never replaced by a different one.
"""

from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select, update
from test_campaigns import body as campaign_body
from test_campaigns import create as create_campaign
from test_campaigns import path as campaign_path
from test_finance import finance
from test_paid_orders import PRICE, paid_event, pay
from test_promo_checkout import add_paid_type, buy, counts
from test_refunds import settle

from app.campaign_models import Campaign, PromoRedemption, PromoReservation
from app.checkout_models import Ticket, TicketOrder
from app.commerce_models import PaymentIntent, Refund
from app.security import now

API = "/api/v1"
QUOTED = PRICE - PRICE // 10  # 10% campaign on one paid ticket


def edit(client, f, made, **changes):
    r = client.put(campaign_path(f, made), headers=f["headers"], json=campaign_body(**changes))
    assert r.status_code == 200, r.text


def expire(client, f, made, factory):
    # Time passing beyond ends_at; the API refuses an end date in the past for a new window.
    with factory.begin() as db:
        db.execute(
            update(Campaign)
            .where(Campaign.id == UUID(made["id"]))
            .values(ends_at=now() - timedelta(seconds=1))
        )


def disable(client, f, made, factory):
    assert client.post(campaign_path(f, made, "/disable"), headers=f["headers"]).status_code == 200


def start_later(client, f, made, factory):
    later = now() + timedelta(days=1)
    edit(
        client,
        f,
        made,
        code=None,
        starts_at=later.isoformat(),
        ends_at=(later + timedelta(days=5)).isoformat(),
    )


def end_earlier(client, f, made, factory):
    # The API accepts a window that already ended; it is then outside its validity.
    edit(
        client,
        f,
        made,
        code=None,
        starts_at=(now() - timedelta(days=3)).isoformat(),
        ends_at=(now() - timedelta(minutes=1)).isoformat(),
    )


def bigger_discount(client, f, made, factory):
    edit(client, f, made, code=None, value=50)


def smaller_discount(client, f, made, factory):
    edit(client, f, made, code=None, value=5)


def fixed_discount(client, f, made, factory):
    edit(client, f, made, code=None, discount_kind="fixed", value=PRICE // 10)


def other_type_only(client, f, made, factory):
    other = add_paid_type(client, f)
    edit(client, f, made, code=None, eligible_ticket_type_ids=[other["id"]])


def specific_to_all_types(client, f, made, factory):
    # The campaign starts restricted to the bought type (see `campaign_for`).
    edit(client, f, made, code=None, eligible_ticket_type_ids=[])


MATERIAL = {
    "expired": expire,
    "disabled": disable,
    "start_moved_later": start_later,
    "end_moved_earlier": end_earlier,
    "discount_raised": bigger_discount,
    "discount_lowered": smaller_discount,
    "discount_kind_changed": fixed_discount,
    "eligible_type_changed": other_type_only,
    "eligible_widened_to_all": specific_to_all_types,
}


def campaign_for(client, f, case):
    restricted = [f["paid"]["id"]] if case == "eligible_widened_to_all" else []
    return create_campaign(
        client, f, code="PAYNOW", max_redemptions=1, eligible_ticket_type_ids=restricted
    )


def assert_blocked(client, factory, f, held, order, headers):
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "pending"
    assert all(item["ticket"] is None for item in view["items"])
    # The saved quote is unchanged and exactly the captured amount is refunded once.
    assert view["payable_minor"] == order["payable_minor"] == QUOTED
    assert view["discount_minor"] == order["discount_minor"] == PRICE // 10
    assert [(r["reason"], r["amount_minor"]) for r in view["refunds"]] == [
        ("blocked_fulfillment", QUOTED)
    ]
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 0
        assert db.scalar(select(func.count(PromoRedemption.id))) == 0
        reservation = db.scalar(
            select(PromoReservation).where(PromoReservation.hold_id == UUID(held["id"]))
        )
        assert reservation.status == "released"
        stored = db.get(TicketOrder, UUID(order["id"]))
        assert stored.confirmed_at is None and stored.fulfillment_payment_attempt_id is None
        intent = db.scalar(select(PaymentIntent).where(PaymentIntent.order_id == stored.id))
        assert intent.expected_minor == QUOTED
        assert db.scalar(select(func.count(Refund.id))) == 1
    # Allowance is back: nothing reserved or redeemed.
    assert counts(factory) == (0, 0)
    # A retry cannot charge again for this order, at the old price or a new one.
    retry = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers)
    assert retry.status_code == 409
    assert retry.json()["detail"]["code"] == "promo_requote_required"


@pytest.mark.parametrize("case", list(MATERIAL))
def test_material_change_before_payment_success_issues_nothing(
    client, setup, account, factory, case
):
    f = paid_event(client, setup)
    made = campaign_for(client, f, case)
    held, order, headers, _ = buy(client, f, account, "PAYNOW")
    assert order["payable_minor"] == QUOTED and order["status"] == "pending"
    assert counts(factory) == (0, 1)

    MATERIAL[case](client, f, made, factory)
    pay(client, headers, order["payment"]["id"], "succeeded")

    assert_blocked(client, factory, f, held, order, headers)


def test_unchanged_campaign_issues_at_the_quoted_price(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="SAME", max_redemptions=1)
    held, order, headers, _ = buy(client, f, account, "SAME")
    result = pay(client, headers, order["payment"]["id"], "succeeded")
    assert result["attempt"]["charged_minor"] == QUOTED
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "confirmed" and view["refunds"] == []
    assert view["payable_minor"] == QUOTED and all(item["ticket"] for item in view["items"])
    assert counts(factory) == (1, 0)
    report = client.get(campaign_path(f, made, "/report"), headers=f["headers"]).json()
    assert report["redemptions"] == 1 and report["collected_minor"] == QUOTED


def test_non_material_edits_still_issue(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="KEEPIT", max_redemptions=1)
    held, order, headers, _ = buy(client, f, account, "KEEPIT")
    # Renamed campaign and code, a longer window that still contains now, a higher limit.
    edit(
        client,
        f,
        made,
        name="Renamed",
        code="RENAMED",
        starts_at=(now() - timedelta(days=2)).isoformat(),
        ends_at=(now() + timedelta(days=30)).isoformat(),
        max_redemptions=50,
    )
    pay(client, headers, order["payment"]["id"], "succeeded")
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert view["status"] == "confirmed" and view["refunds"] == []
    assert view["payable_minor"] == QUOTED and all(item["ticket"] for item in view["items"])
    assert counts(factory) == (1, 0)


def test_expired_campaign_refund_keeps_finance_consistent(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="LATECAMP", max_redemptions=1)
    before = finance(client, f).json()
    held, order, headers, _ = buy(client, f, account, "LATECAMP")
    expire(client, f, made, factory)
    pay(client, headers, order["payment"]["id"], "succeeded")
    assert_blocked(client, factory, f, held, order, headers)

    pending = finance(client, f).json()
    assert pending["collected_minor"] == QUOTED
    assert pending["pending_refunds_minor"] == QUOTED and pending["refunds_minor"] == 0
    assert pending["gross_minor"] == pending["discount_minor"] == 0
    assert pending["fulfilled_collected_minor"] == 0
    assert pending["estimated_payout_minor"] == before["estimated_payout_minor"]
    report = client.get(campaign_path(f, made, "/report"), headers=f["headers"]).json()
    assert report["redemptions"] == report["orders"] == report["tickets"] == 0
    assert report["collected_minor"] == 0

    settle(client, factory, order["id"], headers)
    done = finance(client, f).json()
    assert done["refunds_minor"] == QUOTED and done["pending_refunds_minor"] == 0
    assert done["fees_minor"] == 0
    assert done["balance_minor"] == before["balance_minor"]
    with factory() as db:
        assert db.scalar(select(Refund)).status == "succeeded"
        assert db.scalar(select(func.count(Ticket.id))) == 0


def test_requote_after_blocked_payment_uses_the_current_campaign(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="NEWQUOTE", max_redemptions=1)
    held, order, headers, _ = buy(client, f, account, "NEWQUOTE")
    smaller_discount(client, f, made, factory)
    pay(client, headers, order["payment"]["id"], "succeeded")
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 0
    # The released allowance lets the buyer take a new hold and see the new price first.
    again = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={
            "items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}],
            "promo_code": "NEWQUOTE",
        },
    )
    assert again.status_code == 201, again.text
    assert again.json()["pricing"]["payable"] == PRICE - PRICE // 20
