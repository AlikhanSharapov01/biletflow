from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select
from test_admission import published, staff
from test_paid_orders import paid_event, pay

from app.campaign_models import Campaign, PromoCode, PromoRedemption
from app.config import Settings
from app.security import digest, now
from app.seed import seed_catalog, seed_demo_campaigns

API = "/api/v1"


def body(**extra):
    return {
        "name": "Spring sale",
        "discount_kind": "percent",
        "value": 10,
        "starts_at": (now() - timedelta(days=1)).isoformat(),
        "ends_at": (now() + timedelta(days=5)).isoformat(),
        "max_redemptions": 100,
        "eligible_ticket_type_ids": [],
        "code": "spring10",
    } | extra


def create(client, f, **extra):
    r = client.post(
        API + f"/events/{f['event']['id']}/campaigns", headers=f["headers"], json=body(**extra)
    )
    assert r.status_code == 201, r.text
    return r.json()


def path(f, campaign=None, suffix=""):
    base = API + f"/events/{f['event']['id']}/campaigns"
    return f"{base}/{campaign['id']}{suffix}" if campaign else base


def test_campaign_create_read_update_disable(client, setup, factory):
    f = setup()
    made = create(client, f)
    assert made["code"] == "SPRING10" and made["status"] == "active"
    assert made["value"] == 10 and made["discount_kind"] == "percent"
    assert made["redemptions_used"] == 0 and "/c/" in made["link_url"]
    assert client.get(path(f), headers=f["headers"]).json() == [made]
    assert client.get(path(f, made), headers=f["headers"]).json() == made

    changed = client.put(
        path(f, made), headers=f["headers"], json=body(name="Renamed", value=15, code=None)
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["name"] == "Renamed" and changed.json()["value"] == 15
    assert changed.json()["code"] == "SPRING10"

    off = client.post(path(f, made, "/disable"), headers=f["headers"])
    assert off.json()["status"] == "disabled"
    assert client.post(path(f, made, "/disable"), headers=f["headers"]).status_code == 200
    history = client.get(API + f"/events/{f['event']['id']}/history", headers=f["headers"]).json()
    actions = [row["action"] for row in history]
    assert actions.count("campaign.created") == 1 and actions.count("campaign.updated") == 1
    assert actions.count("campaign.disabled") == 1


def test_campaign_code_is_generated_and_unique_per_event(client, setup):
    f = setup()
    generated = create(client, f, code=None)
    assert len(generated["code"]) == 10
    create(client, f, code="SAME")
    taken = client.post(path(f), headers=f["headers"], json=body(code=" same "))
    assert taken.status_code == 409 and taken.json()["detail"]["code"] == "promo_code_taken"
    # Another organizer's event may use the same code.
    create(client, setup(), code="SAME")


def test_campaign_status_and_input_validation(client, setup):
    f = setup()
    later = create(
        client,
        f,
        code="LATER",
        starts_at=(now() + timedelta(days=1)).isoformat(),
    )
    assert later["status"] == "scheduled"
    ended = create(
        client,
        f,
        code="ENDED",
        starts_at=(now() - timedelta(days=3)).isoformat(),
        ends_at=(now() - timedelta(days=1)).isoformat(),
    )
    assert ended["status"] == "ended"
    for bad in (
        {"value": 101},
        {"value": 0},
        {"code": "a b"},
        {"ends_at": (now() - timedelta(days=9)).isoformat()},
        {"max_redemptions": 0},
    ):
        r = client.post(path(f), headers=f["headers"], json=body(**bad))
        assert r.status_code == 422, bad
    wrong = setup()
    r = client.post(
        path(f),
        headers=f["headers"],
        json=body(code="WRONG", eligible_ticket_type_ids=[wrong["ticket"]["id"]]),
    )
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ticket_type_not_found"


def test_campaign_permission_scope(client, setup, account, settings):
    f = setup()
    made = create(client, f)
    _, _, stranger = account()
    assert client.get(path(f), headers=stranger).status_code == 404
    assert client.get(path(f, made, "/report"), headers=stranger).status_code == 404
    assert client.post(path(f), headers=stranger, json=body(code="NOPE")).status_code == 404
    assert client.get(path(f)).status_code == 401
    scanner = staff(client, settings, account, f, ["scan"])
    assert client.get(path(f), headers=scanner).status_code == 403
    assert client.post(path(f), headers=scanner, json=body(code="NOPE")).status_code == 403
    assert client.get(path(f, made, "/report"), headers=scanner).status_code == 403
    reports = staff(client, settings, account, f, ["reports"])
    assert client.get(path(f), headers=reports).status_code == 200
    assert client.get(path(f, made, "/report"), headers=reports).status_code == 200
    assert client.post(path(f), headers=reports, json=body(code="NOPE")).status_code == 403
    other = setup()
    missing = client.get(
        API + f"/events/{other['event']['id']}/campaigns/{made['id']}", headers=other["headers"]
    )
    assert missing.status_code == 404 and missing.json()["detail"]["code"] == "campaign_not_found"


def test_campaign_qr_is_marked_and_stores_only_a_token_hash(client, setup, factory):
    f = setup()
    made = create(client, f)
    qr = client.get(path(f, made, "/qr.svg"), headers=f["headers"])
    assert qr.status_code == 200 and qr.headers["content-type"].startswith("image/svg+xml")
    assert "Promo link, not an entry ticket" in qr.text and "<circle" in qr.text
    token = made["link_url"].rsplit("/", 1)[1]
    with factory() as db:
        promo = db.scalar(select(PromoCode))
        assert promo.link_token_hash == digest(token) and token not in promo.link_token_hash


def test_scanner_rejects_a_campaign_link(
    client, setup, account, settings, factory, no_entry_confirmation
):
    f = published(client, setup, factory)
    made = create(client, f)
    scanner = staff(client, settings, account, f, ["scan"])
    token = made["link_url"].rsplit("/", 1)[1]
    for payload in (made["link_url"], token, made["code"]):
        r = client.post(
            API + f"/scanner/events/{f['event']['id']}/check-ins",
            headers=scanner,
            json={"qr_payload": payload},
        )
        assert r.status_code == 422, r.text
        assert r.json()["detail"]["code"] == "not_a_ticket_qr"


def redeemed(client, setup, account, **extra):
    f = paid_event(client, setup)
    made = create(client, f, **extra)
    email, _, headers = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={
            "items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}],
            "promo_code": made["code"],
        },
    ).json()
    order = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=headers,
        json={
            "recipients": [
                {"allocation_id": held["allocations"][0]["id"], "name": "Aru", "email": email}
            ]
        },
    ).json()
    pay(client, headers, order["payment"]["id"], "succeeded")
    return f, made, order


def test_campaign_locks_after_first_redemption(client, setup, account):
    f, made, _ = redeemed(client, setup, account)
    assert client.get(path(f, made), headers=f["headers"]).json()["redemptions_used"] == 1
    for change in (
        {"value": 20},
        {"code": "OTHER"},
        {"eligible_ticket_type_ids": [f["paid"]["id"]]},
    ):
        r = client.put(path(f, made), headers=f["headers"], json=body(**change))
        assert r.status_code == 409 and r.json()["detail"]["code"] == "campaign_locked"
    fine = client.put(path(f, made), headers=f["headers"], json=body(name="Still editable"))
    assert fine.status_code == 200 and fine.json()["name"] == "Still editable"


def test_campaign_limit_may_equal_usage_or_become_unlimited(client, setup, account):
    f, made, _ = redeemed(client, setup, account, max_redemptions=5)
    r = client.put(path(f, made), headers=f["headers"], json=body(max_redemptions=1))
    assert r.status_code == 200, r.text
    unlimited = client.put(path(f, made), headers=f["headers"], json=body(max_redemptions=None))
    assert unlimited.json()["max_redemptions"] is None


def test_limit_below_active_reservations_is_refused(client, setup, account):
    f = paid_event(client, setup)
    made = create(client, f, max_redemptions=5)
    for _ in range(2):
        _, _, headers = account()
        r = client.post(
            API + f"/events/{f['event']['id']}/holds",
            headers=headers,
            json={
                "items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}],
                "promo_code": made["code"],
            },
        )
        assert r.status_code == 201, r.text
    r = client.put(path(f, made), headers=f["headers"], json=body(max_redemptions=1))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "promo_limit_below_usage"


def test_campaign_report_reconciles_with_the_order(client, setup, account, factory):
    f, made, order = redeemed(client, setup, account)
    report = client.get(path(f, made, "/report"), headers=f["headers"]).json()
    assert report["redemptions"] == report["orders"] == report["tickets"] == 1
    assert report["tickets_kept"] == 1 and report["tickets_refunded"] == 0
    assert report["gross_minor"] == order["gross_minor"] == 400000
    assert report["discount_minor"] == order["discount_minor"] == 40000
    assert report["collected_minor"] == order["payable_minor"] == 360000
    assert report["fees_minor"] == order["processing_fee_minor"] == 10800
    assert report["net_minor"] == 349200 and report["refunds_minor"] == 0
    with factory() as db:
        assert db.scalar(select(func.count(PromoRedemption.id))) == 1


def test_demo_seed_is_idempotent_and_skips_production(factory, settings):
    seed_catalog(factory)
    seed_demo_campaigns(factory, settings)
    seed_demo_campaigns(factory, settings)
    with factory() as db:
        rows = list(db.scalars(select(Campaign).order_by(Campaign.max_redemptions)))
        assert [row.max_redemptions for row in rows] == [50, 100]
        assert {row.discount_kind for row in rows} == {"fixed", "percentage"}
        assert rows[0].fixed_minor == 100_000 and rows[1].percentage_bps == 1000
        assert isinstance(rows[0].event_id, UUID)
    production = Settings(
        _env_file=None,
        database_url=settings.database_url,
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
        environment="production",
        cookie_secure=True,
        allowed_origins=["https://example.com"],
        frontend_url="https://example.com",
        google_redirect_uri="https://example.com/callback",
    )

    class Untouched:
        def begin(self):
            raise AssertionError("production must not be seeded")

    seed_demo_campaigns(Untouched(), production)
