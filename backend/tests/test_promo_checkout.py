from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from test_campaigns import body as campaign_body
from test_campaigns import create as create_campaign
from test_campaigns import path as campaign_path
from test_paid_orders import PRICE, paid_event, pay

from app.activation_service import suspend
from app.campaign_models import PromoRedemption, PromoReservation
from app.catalog_models import Hold
from app.checkout_expiry import sweep_expired_holds
from app.checkout_models import OrderItem, Ticket, TicketOrder
from app.commerce_models import Refund
from app.pricing import discounts, hold_quote, split
from app.security import now

API = "/api/v1"
PCT = {
    "discount_kind": "percentage",
    "percentage_bps": 1000,
    "fixed_minor": None,
    "all_ticket_types": True,
    "ticket_type_ids": [],
}


def add_paid_type(client, f, name="VIP", price=PRICE):
    r = client.post(
        API + f"/events/{f['event']['id']}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": name, "kind": "paid", "price_minor": price},
    )
    assert r.status_code == 201, r.text
    return r.json()


def make_hold(client, f, headers, items, code=None, key=None):
    payload = {"items": items}
    if code is not None:
        payload["promo_code"] = code
    extra = {"Idempotency-Key": key} if key else {}
    return client.post(
        API + f"/events/{f['event']['id']}/holds", headers=headers | extra, json=payload
    )


def lines(type_id, quantity=1):
    return [{"ticket_type_id": type_id, "quantity": quantity}]


def people(held, email):
    return {
        "recipients": [
            {"allocation_id": row["id"], "name": f"Guest {i}", "email": email}
            for i, row in enumerate(held["allocations"])
        ]
    }


def checkout(client, held, headers, email):
    return client.post(
        API + f"/holds/{held['id']}/checkout", headers=headers, json=people(held, email)
    )


def buy(client, f, account, code, quantity=1):
    email, _, headers = account()
    r = make_hold(client, f, headers, lines(f["paid"]["id"], quantity), code)
    assert r.status_code == 201, r.text
    held = r.json()
    order = checkout(client, held, headers, email)
    assert order.status_code == 200, order.text
    return held, order.json(), headers, email


def counts(factory):
    with factory() as db:
        return (
            db.scalar(select(func.count(PromoRedemption.id))),
            db.scalar(
                select(func.count(PromoReservation.id)).where(PromoReservation.status == "active")
            ),
        )


def test_split_is_exact_and_stable():
    assert split(100, [1, 1, 1]) == [34, 33, 33]
    assert sum(split(999, [7, 13, 0, 29])) == 999
    assert split(5, [0, 0]) == [0, 0]


def test_percentage_rounds_per_line_and_never_exceeds_face():
    assert discounts([100001, 5], [True, True], PCT) == [10000, 1]
    full = PCT | {"percentage_bps": 10000}
    assert discounts([7, 9], [True, False], full) == [7, 0]


def test_fixed_discount_is_applied_once_capped_and_split():
    fixed = PCT | {"discount_kind": "fixed", "percentage_bps": None, "fixed_minor": 100}
    assert discounts([300, 100], [True, True], fixed) == [75, 25]
    assert discounts([300, 100], [False, True], fixed) == [0, 100]
    assert sum(discounts([40, 30], [True, True], fixed)) == 70


def test_worked_example_from_the_requirements():
    types = {"t": SimpleNamespace(price_minor=1_000_000)}
    rows = [SimpleNamespace(id=i, ticket_type_id="t") for i in range(2)]
    totals, items = hold_quote(types, rows, PCT)
    assert totals == {"gross": 2_000_000, "discount": 200_000, "subtotal": 1_800_000, "fee": 54_000}
    assert sum(line.discount for line in items) == totals["discount"]
    assert sum(line.fee for line in items) == totals["fee"]
    assert all(line.paid == 900_000 for line in items)


def test_worked_example_through_the_api(client, setup, account, factory):
    f = paid_event(client, setup)
    price = add_paid_type(client, f, "Ten thousand", 1_000_000)
    made = create_campaign(client, f, code="TEN")
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(price["id"], 2), " ten ").json()
    pricing = held["pricing"]
    assert pricing["gross"] == 2_000_000 and pricing["discount"] == 200_000
    assert pricing["subtotal"] == pricing["payable"] == 1_800_000
    assert pricing["processing_fee"] == 54_000
    assert [row["paid_minor"] for row in pricing["lines"]] == [900_000, 900_000]
    assert held["promo"]["code"] == "TEN" and held["promo"]["discount_kind"] == "percent"
    assert counts(factory) == (0, 1)

    order = checkout(client, held, headers, email).json()
    assert order["gross_minor"] == 2_000_000 and order["discount_minor"] == 200_000
    assert order["payable_minor"] == 1_800_000 and order["processing_fee_minor"] == 54_000
    assert order["promo"] == {"code": "TEN", "campaign_id": made["id"]}
    assert order["payment"]["status"] == "created"

    result = pay(client, headers, order["payment"]["id"], "succeeded")
    assert result["attempt"]["charged_minor"] == 1_800_000
    done = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    assert done["status"] == "confirmed" and all(item["ticket"] for item in done["items"])
    assert counts(factory) == (1, 0)
    with factory() as db:
        redemption = db.scalar(select(PromoRedemption))
        assert redemption.discount_minor == 200_000 and redemption.order_id == UUID(order["id"])
        assert db.scalar(select(PromoReservation)).status == "consumed"
        assert all(db.scalars(select(OrderItem.campaign_eligible)))


def test_hold_without_promo_reports_plain_pricing(client, setup, account, factory):
    f = paid_event(client, setup)
    _, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"])).json()
    assert held["promo"] is None and held["pricing"]["discount"] == 0
    assert held["pricing"]["payable"] == PRICE and held["pricing"]["processing_fee"] == 12000
    assert counts(factory) == (0, 0)


def test_only_eligible_ticket_types_are_discounted(client, setup, account, factory):
    f = paid_event(client, setup)
    other = add_paid_type(client, f)
    create_campaign(client, f, code="ONLYVIP", eligible_ticket_type_ids=[other["id"]])
    email, _, headers = account()
    items = lines(f["paid"]["id"]) + lines(other["id"])
    held = make_hold(client, f, headers, items, "ONLYVIP").json()
    by_type = {row["ticket_type_id"]: row for row in held["pricing"]["lines"]}
    assert by_type[other["id"]]["discount_minor"] == PRICE // 10
    assert by_type[f["paid"]["id"]]["discount_minor"] == 0
    assert held["pricing"]["discount"] == PRICE // 10
    checkout(client, held, headers, email)
    with factory() as db:
        marks = {
            str(row.ticket_type_id): row.campaign_eligible for row in db.scalars(select(OrderItem))
        }
    assert marks == {other["id"]: True, f["paid"]["id"]: False}
    _, _, second = account()
    r = make_hold(client, f, second, lines(f["paid"]["id"]), "ONLYVIP")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "promo_not_applicable"


def test_a_free_ticket_alone_cannot_use_a_promo(client, setup, account):
    f = paid_event(client, setup)
    create_campaign(client, f, code="FREEONE")
    _, _, headers = account()
    r = make_hold(client, f, headers, lines(f["ticket"]["id"]), "FREEONE")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "promo_not_applicable"


def test_fixed_discount_is_split_across_the_basket(client, setup, account):
    f = paid_event(client, setup)
    create_campaign(client, f, code="FIXED", discount_kind="fixed", value=100_000)
    _, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"], 3), "FIXED").json()
    assert held["pricing"]["discount"] == 100_000
    assert sorted(row["discount_minor"] for row in held["pricing"]["lines"]) == [
        33333,
        33333,
        33334,
    ]
    assert held["promo"]["discount_kind"] == "fixed" and held["promo"]["discount_value"] == 100_000


def test_rejected_codes_leave_no_hold(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="OFF")
    client.post(campaign_path(f, made, "/disable"), headers=f["headers"])
    create_campaign(
        client,
        f,
        code="OLD",
        starts_at=(now() - timedelta(days=3)).isoformat(),
        ends_at=(now() - timedelta(days=1)).isoformat(),
    )
    create_campaign(client, f, code="SOON", starts_at=(now() + timedelta(days=1)).isoformat())
    _, _, headers = account()
    for code, status, error in (
        ("NOPE", 404, "promo_not_found"),
        ("OFF", 409, "promo_disabled"),
        ("OLD", 409, "promo_expired"),
        ("SOON", 409, "promo_not_applicable"),
    ):
        r = make_hold(client, f, headers, lines(f["paid"]["id"]), code)
        assert r.status_code == status and r.json()["detail"]["code"] == error, code
    with factory() as db:
        assert db.scalar(select(func.count(Hold.id))) == 0


def test_a_rejected_promo_keeps_the_buyers_earlier_hold(client, setup, account, factory):
    f = paid_event(client, setup)
    _, _, headers = account()
    first = make_hold(client, f, headers, lines(f["paid"]["id"])).json()
    r = make_hold(client, f, headers, lines(f["paid"]["id"]), "NOPE")
    assert r.status_code == 404
    with factory() as db:
        assert db.get(Hold, UUID(first["id"])).status == "active"


def test_preview_and_error_codes(client, setup, account):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="SHOW", max_redemptions=1)
    url = API + f"/events/{f['event']['id']}/promo-codes/%s/preview"
    ok = client.get(url % "show")
    assert ok.status_code == 200, ok.text
    assert ok.json()["code"] == "SHOW" and ok.json()["discount_value"] == 10
    assert ok.json()["eligible_ticket_type_ids"] == [] and ok.json()["valid_until"]
    missing = client.get(url % "MISSING")
    assert missing.status_code == 404 and missing.json()["detail"]["code"] == "promo_not_found"
    buy(client, f, account, "SHOW")
    gone = client.get(url % "SHOW")
    assert gone.status_code == 409 and gone.json()["detail"]["code"] == "promo_exhausted"
    assert made["id"]


def test_preview_is_rate_limited_per_account(client, setup, account):
    f = paid_event(client, setup)
    create_campaign(client, f, code="LIMIT")
    _, _, headers = account()
    url = API + f"/events/{f['event']['id']}/promo-codes/LIMIT/preview"
    for _ in range(30):
        assert client.get(url, headers=headers).status_code == 200
    limited = client.get(url, headers=headers)
    assert limited.status_code == 429 and limited.json()["detail"]["code"] == "rate_limited"


def test_campaign_link_resolves_and_respects_private_events(client, setup, account):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="LINK")
    token = made["link_url"].rsplit("/", 1)[1]
    link = client.get(API + f"/campaign-links/{token}")
    assert link.status_code == 200 and link.json() == {"event_id": f["event"]["id"], "code": "LINK"}
    assert client.get(API + "/campaign-links/not-a-token").status_code == 404

    private = setup(visibility="private")
    client.post(API + f"/events/{private['event']['id']}/publish", headers=private["headers"])
    hidden = create_campaign(client, private, code="HIDE")
    token = hidden["link_url"].rsplit("/", 1)[1]
    assert client.get(API + f"/campaign-links/{token}").status_code == 404
    _, _, stranger = account()
    assert client.get(API + f"/campaign-links/{token}", headers=stranger).status_code == 404
    owner = client.get(API + f"/campaign-links/{token}", headers=private["headers"])
    assert owner.status_code == 200
    preview = API + f"/events/{private['event']['id']}/promo-codes/HIDE/preview"
    assert client.get(preview).status_code == 404


def test_promo_is_part_of_the_idempotency_fingerprint(client, setup, account):
    f = paid_event(client, setup)
    create_campaign(client, f, code="KEYED")
    _, _, headers = account()
    key = "promo-key-0001"
    first = make_hold(client, f, headers, lines(f["paid"]["id"]), "KEYED", key)
    again = make_hold(client, f, headers, lines(f["paid"]["id"]), "KEYED", key)
    assert first.status_code == 201 and again.json()["id"] == first.json()["id"]
    assert again.json()["promo"]["code"] == "KEYED"
    other = make_hold(client, f, headers, lines(f["paid"]["id"]), None, key)
    assert other.status_code == 409 and other.json()["detail"]["code"] == "idempotency_key_reused"


def test_race_for_the_last_redemption(client, setup, account, app, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="LAST", max_redemptions=1)
    buyers = [account()[2] for _ in range(2)]

    def attempt(headers):
        with TestClient(app) as local:
            return make_hold(local, f, headers, lines(f["paid"]["id"]), "LAST")

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, buyers))
    assert sorted(r.status_code for r in results) == [201, 409]
    loser = next(r for r in results if r.status_code == 409)
    assert loser.json()["detail"]["code"] == "promo_exhausted"
    assert counts(factory) == (0, 1)


def test_expired_hold_returns_the_allowance(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="ONE", max_redemptions=1)
    _, _, first = account()
    held = make_hold(client, f, first, lines(f["paid"]["id"]), "ONE").json()
    _, _, second = account()
    assert make_hold(client, f, second, lines(f["paid"]["id"]), "ONE").status_code == 409
    with factory.begin() as db:
        db.execute(
            update(Hold)
            .where(Hold.id == UUID(held["id"]))
            .values(expires_at=now(), created_at=now() - timedelta(minutes=20))
        )
    sweep_expired_holds(factory)
    assert counts(factory) == (0, 0)
    assert make_hold(client, f, second, lines(f["paid"]["id"]), "ONE").status_code == 201


def test_replacing_a_hold_releases_its_promo(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="SWAP", max_redemptions=1)
    _, _, headers = account()
    make_hold(client, f, headers, lines(f["paid"]["id"]), "SWAP")
    again = make_hold(client, f, headers, lines(f["paid"]["id"], 2), "SWAP")
    assert again.status_code == 201, again.text
    assert counts(factory) == (0, 1)


def test_changed_campaign_requires_a_new_quote(client, setup, account):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="MOVE")
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"]), "MOVE").json()
    edited = client.put(
        campaign_path(f, made), headers=f["headers"], json=campaign_body(code="MOVE", value=50)
    )
    assert edited.status_code == 200, edited.text
    r = checkout(client, held, headers, email)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "promo_requote_required"


def test_renaming_a_code_does_not_invalidate_a_quote(client, setup, account):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="OLDNAME")
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"]), "OLDNAME").json()
    client.put(campaign_path(f, made), headers=f["headers"], json=campaign_body(code="NEWNAME"))
    assert checkout(client, held, headers, email).status_code == 200


def test_disabled_campaign_blocks_checkout_and_retry(client, setup, account):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="STOP")
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"]), "STOP").json()
    order = checkout(client, held, headers, email).json()
    pay(client, headers, order["payment"]["id"], "failed")
    client.post(campaign_path(f, made, "/disable"), headers=f["headers"])
    retry = client.post(API + f"/orders/{order['id']}/payment-attempts", headers=headers)
    assert retry.status_code == 409 and retry.json()["detail"]["code"] == "promo_requote_required"


def test_disabled_while_paying_refunds_instead_of_issuing(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="RACE")
    _, order, headers, _ = buy(client, f, account, "RACE")
    client.post(campaign_path(f, made, "/disable"), headers=f["headers"])
    pay(client, headers, order["payment"]["id"], "succeeded")
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 0
        assert db.scalar(select(Refund)).reason == "blocked_fulfillment"
    assert counts(factory) == (0, 0)


def test_blocked_and_wrong_amount_payments_release_the_promo(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="WRONG")
    _, order, headers, _ = buy(client, f, account, "WRONG")
    assert counts(factory) == (0, 1)
    pay(client, headers, order["payment"]["id"], "succeeded", amount_minor=1)
    assert counts(factory) == (0, 0)
    with factory() as db:
        assert db.scalar(select(Refund)).reason == "blocked_fulfillment"

    g = paid_event(client, setup)
    create_campaign(client, g, code="BLOCK")
    _, second, second_headers, _ = buy(client, g, account, "BLOCK")
    with factory.begin() as db:
        suspend(db, UUID(g["event"]["id"]), "policy")
    pay(client, second_headers, second["payment"]["id"], "succeeded")
    assert counts(factory) == (0, 0)
    with factory() as db:
        assert db.scalar(select(func.count(Ticket.id))) == 0


def test_late_payment_is_refunded_with_the_allowance_already_back(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="LATE", max_redemptions=1)
    held, order, headers, _ = buy(client, f, account, "LATE")
    with factory.begin() as db:
        db.execute(
            update(Hold)
            .where(Hold.id == UUID(held["id"]))
            .values(expires_at=now(), created_at=now() - timedelta(minutes=20))
        )
    pay(client, headers, order["payment"]["id"], "succeeded")
    assert counts(factory) == (0, 0)
    with factory() as db:
        assert db.scalar(select(Refund)).reason == "late_payment"
        assert db.scalar(select(func.count(Ticket.id))) == 0


def test_full_discount_takes_the_free_path(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="FREE100", value=100)
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"], 2), "FREE100").json()
    assert held["pricing"]["payable"] == 0 and held["pricing"]["processing_fee"] == 0
    order = checkout(client, held, headers, email)
    assert order.status_code == 200, order.text
    order = order.json()
    assert order["status"] == "confirmed" and order["payable_minor"] == 0
    assert order["discount_minor"] == 2 * PRICE and order["payment"] is None
    assert all(item["ticket"] for item in order["items"])
    assert counts(factory) == (1, 0)
    # Retrying returns the same order and redeems nothing further.
    assert checkout(client, held, headers, email).json()["id"] == order["id"]
    assert counts(factory) == (1, 0)


def test_full_discount_works_through_the_free_confirm_endpoint(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="CONF100", value=100)
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"]), "CONF100").json()
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=headers, json=people(held, email))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmed"
    assert counts(factory) == (1, 0)


def test_partial_discount_still_requires_payment_on_confirm(client, setup, account):
    f = paid_event(client, setup)
    create_campaign(client, f, code="HALF", value=50)
    email, _, headers = account()
    held = make_hold(client, f, headers, lines(f["paid"]["id"]), "HALF").json()
    r = client.post(API + f"/holds/{held['id']}/confirm", headers=headers, json=people(held, email))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "payment_required"


def test_campaign_order_is_attributed_after_edits(client, setup, account, factory):
    f = paid_event(client, setup)
    made = create_campaign(client, f, code="KEEP")
    _, order, headers, _ = buy(client, f, account, "KEEP")
    pay(client, headers, order["payment"]["id"], "succeeded")
    client.put(campaign_path(f, made), headers=f["headers"], json=campaign_body(name="New name"))
    with factory() as db:
        stored = db.get(TicketOrder, UUID(order["id"]))
        assert str(stored.campaign_id) == made["id"] and stored.discount_minor == PRICE // 10
