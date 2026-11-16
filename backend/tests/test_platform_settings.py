"""Platform settings reach new holds, quotes, activations and uploads (BF-06/07/14/21)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import platform_settings
from app.activation_service import TERMS_VERSION
from app.admin_cli import set_admin
from app.catalog_models import Hold
from app.checkout_models import TicketOrder
from app.platform_settings import effective_setting
from app.security import now
from tests.test_admin import ADMIN, code
from tests.test_admission import free_ticket, published, staff
from tests.test_file_content import pdf
from tests.test_paid_orders import PRICE, body, hold, paid_event, pay
from tests.test_support import SUPPORT, open_case

API = "/api/v1"
MIB = 1024 * 1024


@pytest.fixture
def admin(account, factory):
    email, tokens, headers = account()
    assert set_admin(factory, email, True) == "granted"
    return email, tokens, headers


def put_setting(client, headers, key, value, version, effective_at=None):
    payload = {"value": value, "expected_version": version}
    if effective_at:
        payload["effective_at"] = effective_at.isoformat()
    response = client.put(ADMIN + f"/settings/{key}", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def minutes_of(held):
    created = datetime.fromisoformat(held["created_at"])
    return (datetime.fromisoformat(held["expires_at"]) - created).total_seconds() / 60


def place_hold(client, f, account, type_id=None):
    _, _, headers = account()
    return hold(client, f, headers, type_id or f["ticket"]["id"]), headers


# ------------------------------------------------------------------ hold length


def test_new_holds_follow_the_setting_and_old_holds_keep_their_expiry(
    client, setup, account, factory, admin
):
    _, _, headers = admin
    f = published(client, setup, factory)
    before, _ = place_hold(client, f, account)
    assert minutes_of(before) == pytest.approx(10, abs=0.01)

    put_setting(client, headers, "hold_minutes", 3, 0)
    after, _ = place_hold(client, f, account)
    assert minutes_of(after) == pytest.approx(3, abs=0.01)
    # The earlier hold is untouched, even when it is read again.
    with factory() as db:
        row = db.get(Hold, UUID(before["id"]))
        assert (row.expires_at - row.created_at).total_seconds() == pytest.approx(600, abs=1)

    # The documented boundaries are both usable.
    put_setting(client, headers, "hold_minutes", 1, 1)
    assert minutes_of(place_hold(client, f, account)[0]) == pytest.approx(1, abs=0.01)
    put_setting(client, headers, "hold_minutes", 60, 2)
    assert minutes_of(place_hold(client, f, account)[0]) == pytest.approx(60, abs=0.01)


def test_future_setting_applies_exactly_from_its_effective_time(
    client, setup, account, factory, admin, monkeypatch
):
    _, _, headers = admin
    f = published(client, setup, factory)
    start = now() + timedelta(days=2)
    put_setting(client, headers, "hold_minutes", 30, 0, effective_at=start)
    assert minutes_of(place_hold(client, f, account)[0]) == pytest.approx(10, abs=0.01)

    # Move the clock used for stamping new holds to either side of the effective time.
    for instant, expected in (
        (start - timedelta(seconds=1), 10),
        (start, 30),
        (start + timedelta(hours=1), 30),
    ):
        monkeypatch.setattr(platform_settings, "now", lambda instant=instant: instant)
        held, _ = place_hold(client, f, account)
        assert minutes_of(held) == pytest.approx(expected, abs=0.01), instant


def test_concurrent_change_never_splits_a_hold_from_its_setting(
    client, setup, account, factory, admin, app
):
    _, _, headers = admin
    f = published(client, setup, factory)
    buyers = [account()[2] for _ in range(6)]

    def buy(index):
        with TestClient(app) as local:
            r = local.post(
                API + f"/events/{f['event']['id']}/holds",
                headers=buyers[index],
                json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
            )
            assert r.status_code == 201, r.text

    def change(value, version):
        with TestClient(app) as local:
            r = local.put(
                ADMIN + "/settings/hold_minutes",
                headers=headers,
                json={"value": value, "expected_version": version},
            )
            assert r.status_code == 200, r.text

    with ThreadPoolExecutor(8) as pool:
        jobs = [pool.submit(buy, i) for i in range(3)]
        jobs.append(pool.submit(change, 5, 0))
        jobs += [pool.submit(buy, i) for i in range(3, 6)]
        for job in jobs:
            job.result()

    with factory() as db:
        holds = list(db.scalars(select(Hold)))
        assert len(holds) == 6
        for row in holds:
            wanted = effective_setting(db, "hold_minutes", row.created_at)
            assert round((row.expires_at - row.created_at).total_seconds() / 60) == wanted


# ------------------------------------------------------------------ quote rate


def quoted_order(client, f, headers, email, held):
    response = client.post(
        API + f"/holds/{held['id']}/checkout", headers=headers, json=body(held, [("Aru", email)])
    )
    assert response.status_code == 200, response.text
    return response.json()


def stored_order(factory, order_id):
    with factory() as db:
        row = db.get(TicketOrder, UUID(order_id))
        return row.processing_rate_bps, row.processing_fee_minor, row.policy_snapshot


def test_quotes_use_the_rate_of_their_hold_and_old_orders_are_unchanged(
    client, setup, account, factory, admin
):
    _, _, headers = admin
    f = paid_event(client, setup)
    email_a, _, buyer_a = account()
    first = hold(client, f, buyer_a, f["paid"]["id"])
    assert first["pricing"]["processing_fee"] == PRICE * 300 // 10000

    put_setting(client, headers, "processing_rate_bps", 500, 0)
    email_b, _, buyer_b = account()
    second = hold(client, f, buyer_b, f["paid"]["id"])
    assert second["pricing"]["processing_fee"] == PRICE * 500 // 10000

    # A rate change between hold and checkout never re-prices what the buyer was shown.
    put_setting(client, headers, "processing_rate_bps", 900, 1)
    order_a = quoted_order(client, f, buyer_a, email_a, first)
    order_b = quoted_order(client, f, buyer_b, email_b, second)
    rate_a, fee_a, policy_a = stored_order(factory, order_a["id"])
    rate_b, fee_b, policy_b = stored_order(factory, order_b["id"])
    assert (rate_a, fee_a) == (300, PRICE * 300 // 10000)
    assert (rate_b, fee_b) == (500, PRICE * 500 // 10000)
    assert policy_a["processing_rate_bps"] == 300 and policy_b["processing_rate_bps"] == 500
    assert policy_a["hold_minutes"] == policy_b["hold_minutes"] == 10

    # A hold created after the change is quoted at the new rate; paying keeps the saved fee.
    email_c, _, buyer_c = account()
    third = hold(client, f, buyer_c, f["paid"]["id"])
    order_c = quoted_order(client, f, buyer_c, email_c, third)
    assert stored_order(factory, order_c["id"])[:2] == (900, PRICE * 900 // 10000)
    pay(client, buyer_a, order_a["payment"]["id"], "succeeded")
    assert stored_order(factory, order_a["id"])[:2] == (300, PRICE * 300 // 10000)


def test_hold_length_is_saved_on_the_order_policy(client, setup, account, factory, admin):
    _, _, headers = admin
    f = paid_event(client, setup)
    put_setting(client, headers, "hold_minutes", 7, 0)
    email, _, buyer = account()
    held = hold(client, f, buyer, f["paid"]["id"])
    order = quoted_order(client, f, buyer, email, held)
    assert stored_order(factory, order["id"])[2]["hold_minutes"] == 7
    put_setting(client, headers, "hold_minutes", 20, 1)
    assert stored_order(factory, order["id"])[2]["hold_minutes"] == 7


# ------------------------------------------------------------------ activation fee


def start_activation(client, setup):
    f = setup()
    eid = f["event"]["id"]
    assert client.post(API + f"/events/{eid}/publish", headers=f["headers"]).status_code == 200
    client.post(
        API + f"/events/{eid}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Paid", "kind": "paid", "price_minor": PRICE},
    )
    for step in ("payout-profile", "identity-verification"):
        client.post(
            API + f"/organizations/{f['org']['id']}/paid-sales/{step}", headers=f["headers"]
        )
    client.post(
        API + f"/events/{eid}/paid-sales/terms",
        headers=f["headers"],
        json={"terms_version": TERMS_VERSION},
    )
    preview = client.get(API + f"/events/{eid}/paid-sales", headers=f["headers"]).json()
    started = client.post(API + f"/events/{eid}/paid-sales/activation", headers=f["headers"])
    assert started.status_code == 200, started.text
    return f, preview, started.json()


def test_new_activations_use_the_current_fee_and_existing_ones_keep_theirs(client, setup, admin):
    _, _, headers = admin
    first, preview, started = start_activation(client, setup)
    assert preview["activation_fee_minor"] == started["activation_fee_minor"] == 500000

    put_setting(client, headers, "activation_fee_minor", 700000, 0)
    # The first organizer already holds an activation: it is neither re-priced nor re-read.
    again = client.get(
        API + f"/events/{first['event']['id']}/paid-sales", headers=first["headers"]
    ).json()
    assert again["activation_fee_minor"] == 500000

    second, preview, started = start_activation(client, setup)
    assert preview["activation_fee_minor"] == started["activation_fee_minor"] == 700000


def test_activation_fee_setting_cannot_be_zero(client, admin):
    _, _, headers = admin
    for bad in (0, -1):
        response = client.put(
            ADMIN + "/settings/activation_fee_minor",
            headers=headers,
            json={"value": bad, "expected_version": 0},
        )
        assert response.status_code == 422, bad
    put_setting(client, headers, "activation_fee_minor", 1, 0)


# ------------------------------------------------------------------ upload limits


def test_support_uploads_follow_the_setting_and_never_exceed_the_deployment_cap(
    client, setup, account, factory, settings, admin
):
    _, _, headers = admin
    f = published(client, setup, factory)
    _, buyer = free_ticket(client, account, f)
    staff(client, settings, account, f, ["support"])
    case_id = open_case(client, buyer, f).json()["case"]["id"]

    def upload(size):
        return client.post(
            SUPPORT + f"/cases/{case_id}/attachments",
            params={"filename": "note.pdf"},
            content=pdf(size=size),  # a valid PDF of exactly `size` bytes
            headers={**buyer, "Content-Type": "application/pdf"},
        )

    assert upload(2 * MIB).status_code == 201
    put_setting(client, headers, "upload_max_mb", 1, 0)
    assert upload(MIB).status_code == 201
    too_big = upload(MIB + 1)
    assert too_big.status_code == 413 and code(too_big) == "attachment_too_large"
    # A larger setting cannot lift the deployment cap (5 MiB by default).
    put_setting(client, headers, "upload_max_mb", 50, 1)
    assert upload(5 * MIB).status_code == 201
    assert upload(5 * MIB + 1).status_code == 413


def test_event_images_use_the_same_effective_limit(client, setup, factory, admin):
    _, _, headers = admin
    f = setup()
    put_setting(client, headers, "upload_max_mb", 1, 0)

    def upload(size):
        return client.post(
            API + f"/events/{f['event']['id']}/images",
            params={"alt_text": "Poster"},
            content=b"\x89PNG\r\n\x1a\n" + b"x" * (size - 8),
            headers={**f["headers"], "Content-Type": "image/png"},
        )

    assert upload(MIB + 1).status_code == 413
    assert code(upload(MIB + 1)) == "image_too_large"


# ------------------------------------------------------------------ public settings


def test_public_settings_expose_only_the_allowlist(client, admin):
    _, _, headers = admin
    anonymous = client.get(API + "/settings/public")
    assert anonymous.status_code == 200
    assert anonymous.headers["cache-control"] == "no-store"
    assert anonymous.json() == {
        "hold_minutes": 10,
        "processing_rate_bps": 300,
        "activation_fee_minor": 500000,
        "upload_max_bytes": 5 * MIB,
        "currency": "KZT",
    }

    put_setting(client, headers, "hold_minutes", 15, 0, effective_at=now() + timedelta(days=1))
    put_setting(client, headers, "processing_rate_bps", 450, 0)
    put_setting(client, headers, "upload_max_mb", 2, 0)
    shown = client.get(API + "/settings/public").json()
    # A scheduled change is not announced before it takes effect; nothing internal appears.
    assert shown["hold_minutes"] == 10
    assert shown["processing_rate_bps"] == 450 and shown["upload_max_bytes"] == 2 * MIB
    assert set(shown) == {
        "hold_minutes",
        "processing_rate_bps",
        "activation_fee_minor",
        "upload_max_bytes",
        "currency",
    }
    # History and versions stay admin-only.
    assert client.get(ADMIN + "/settings").status_code == 401
    assert client.get(ADMIN + "/settings/hold_minutes/history").status_code == 401
