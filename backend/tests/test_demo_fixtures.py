"""Issue #79 / BF-22: reproducible lifecycle demo fixtures and the safe demo reset."""

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.catalog_models import Event, Hold
from app.checkout_models import TicketOrder
from app.config import Settings
from app.models import AuditLog, Base, User
from app.security import now
from app.seed import (
    DEMO_PASSWORD,
    DEMO_USERS,
    DemoRefused,
    demo_fixtures,
    demo_status,
    main,
    reset_demo,
    seed_catalog,
    seed_demo_fixtures,
    seed_id,
)

API = "/api/v1"


@pytest.fixture
def demo(factory, settings):
    seed_catalog(factory)
    assert seed_demo_fixtures(factory, settings) == "built"
    return demo_fixtures(factory)


def login(client, key, kind="web"):
    """Sign in with the documented demo credentials."""
    r = client.post(
        API + "/auth/login",
        json={"email": DEMO_USERS[key][1], "password": DEMO_PASSWORD, "client_kind": kind},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def get(client, path, headers=None, status=200):
    r = client.get(API + path, headers=headers or {})
    assert r.status_code == status, r.text
    return r.json()


def snapshot(factory):
    """Every row of every application table, as JSON, keyed by (table, id)."""
    rows = {}
    with factory() as db:
        for table in Base.metadata.sorted_tables:
            for identifier, data in db.execute(
                text(f'SELECT id, to_jsonb(t) FROM biletflow."{table.name}" t')
            ):
                rows[(table.name, identifier)] = data
    return rows


def production_settings(settings):
    return Settings(
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
        raise AssertionError("the database must not be touched")

    __call__ = begin


def test_every_lifecycle_example_exists(client, factory, demo):
    events, orders = demo["events"], demo["orders"]
    with factory() as db:
        status = {key: db.get(TicketOrder, UUID(value)).status for key, value in orders.items()}
        rows = {key: db.get(Event, UUID(value)) for key, value in events.items()}
        expired_hold = db.get(Hold, db.get(TicketOrder, UUID(orders["concert_expired"])).hold_id)
        assert expired_hold.status == "expired"
    assert status == {
        "concert_discounted": "confirmed",
        "concert_mixed": "confirmed",
        "concert_free": "confirmed",
        "concert_exhausted_campaign": "confirmed",
        "concert_refunded": "refunded",
        "concert_refund_pending": "refund_pending",
        "concert_expired": "expired",
        "theatre_attendee": "confirmed",
        "theatre_guest": "confirmed",
        "gala_attendee": "confirmed",
        "gala_guest": "confirmed",
        "meetup_checked_in": "confirmed",
        "meetup_not_checked_in": "confirmed",
        "private_attendee": "confirmed",
        "festival_cancelled": "cancelled",
    }
    assert rows["festival"].publication_state == "cancelled"
    assert rows["private"].visibility == "private"
    assert rows["gala"].seating_mode == "assigned"
    current = now()
    assert rows["meetup"].starts_at < current < rows["meetup"].ends_at
    assert rows["meetup"].admission_opens_at < current < rows["meetup"].admission_closes_at
    for key in ("concert", "theatre", "gala", "private", "festival"):
        assert rows[key].starts_at > current + timedelta(days=9)
    # Fixed-ID accounts exist with the documented roles.
    with factory() as db:
        for key, (seed_key, email, _) in DEMO_USERS.items():
            user = db.get(User, seed_id(seed_key))
            assert user.email == email and user.email_verified_at and user.status == "active"
            assert demo["users"][key] == str(user.id)


def test_attendee_and_guest_see_their_records(client, demo):
    events, orders = demo["events"], demo["orders"]
    attendee = login(client, "attendee")
    mine = {row["id"]: row for row in get(client, "/orders", attendee)}
    expected = {
        orders[key]
        for key in (
            "concert_discounted",
            "concert_mixed",
            "concert_refund_pending",
            "theatre_attendee",
            "gala_attendee",
            "meetup_checked_in",
            "private_attendee",
            "festival_cancelled",
        )
    }
    assert set(mine) == expected
    discounted = mine[orders["concert_discounted"]]
    assert discounted["promo"]["code"] == "DEMO10"
    assert discounted["gross_minor"] == 2 * 1_000_000
    assert discounted["discount_minor"] == 200_000 and discounted["payable_minor"] == 1_800_000
    mixed = mine[orders["concert_mixed"]]
    assert sorted(item["face_value_minor"] for item in mixed["items"]) == [0, 3_000_000]
    statuses = {row["event_id"]: row["status"] for row in get(client, "/tickets", attendee)}
    assert statuses[events["meetup"]] == "checked_in"
    assert statuses[events["festival"]] == "cancelled"
    assert statuses[events["private"]] == "valid"

    guest = login(client, "guest")
    theirs = {row["id"]: row["status"] for row in get(client, "/orders", guest)}
    assert theirs[orders["concert_refunded"]] == "refunded"
    assert theirs[orders["concert_expired"]] == "expired"
    assert orders["concert_discounted"] not in theirs
    get(client, f"/orders/{orders['concert_discounted']}", guest, 404)


def test_private_event_is_hidden_from_the_public_catalog(client, demo):
    events = demo["events"]
    public = {row["id"] for row in get(client, "/events")}
    assert {events["concert"], events["theatre"], events["gala"], events["meetup"]} <= public
    assert events["private"] not in public and events["festival"] not in public
    get(client, f"/events/{events['private']}", status=404)
    get(client, f"/events/{events['private']}", login(client, "guest"), 404)
    invited = get(client, f"/events/{events['private']}", login(client, "attendee"))
    assert invited["id"] == events["private"]


def test_sold_out_seats_and_exhausted_campaign(client, demo):
    events = demo["events"]
    organizer, attendee = login(client, "organizer"), login(client, "attendee")
    theatre = get(client, f"/events/{events['theatre']}/analytics", organizer)["inventory"]
    assert theatre["capacity"] == theatre["sold"] == 4 and theatre["available"] == 0
    (seat_type,) = get(client, f"/events/{events['theatre']}/ticket-types", organizer)
    assert seat_type["sold"] == seat_type["quantity_limit"] == 4
    r = client.post(
        API + f"/events/{events['theatre']}/holds",
        headers=attendee,
        json={"items": [{"ticket_type_id": seat_type["id"], "quantity": 1}]},
    )
    assert r.status_code == 409, r.text

    seats = get(client, f"/events/{events['gala']}/seats")["items"]
    sold = sorted(row["row_label"] + row["seat_label"] for row in seats if row["status"] == "sold")
    assert sold == ["A3", "A4", "B1"] and len(seats) == 12

    path = f"/events/{events['concert']}/promo-codes"
    assert get(client, f"{path}/DEMO10/preview", attendee)["code"] == "DEMO10"
    r = client.get(API + f"{path}/DEMOLAST/preview", headers=attendee)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "promo_exhausted"


def test_organizer_finance_and_analytics_reconcile_with_orders(client, demo):
    events, orders = demo["events"], demo["orders"]
    organizer = login(client, "organizer")
    concert = [
        get(client, f"/orders/{orders[key]}", login(client, who))
        for key, who in (
            ("concert_discounted", "attendee"),
            ("concert_mixed", "attendee"),
            ("concert_refund_pending", "attendee"),
            ("concert_free", "guest"),
            ("concert_exhausted_campaign", "guest"),
            ("concert_refunded", "guest"),
        )
    ]
    fulfilled = [row for row in concert if row["status"] != "expired"]
    finance = get(client, f"/events/{events['concert']}/finance", organizer)
    analytics = get(client, f"/events/{events['concert']}/analytics", organizer)
    gross = sum(row["gross_minor"] for row in fulfilled)
    discount = sum(row["discount_minor"] for row in fulfilled)
    refunded = sum(row["payable_minor"] for row in fulfilled if row["status"] == "refunded")
    pending = sum(row["payable_minor"] for row in fulfilled if row["status"] == "refund_pending")
    assert finance["gross_minor"] == analytics["revenue"]["gross_minor"] == gross
    assert finance["discount_minor"] == discount == 200_000 + 600_000
    assert finance["collected_minor"] == gross - discount
    assert finance["refunds_minor"] == refunded == 1_000_000
    assert finance["pending_refunds_minor"] == pending == 1_000_000
    assert finance["activation_charges_minor"] == 500_000 and finance["simulated"] is True
    assert analytics["revenue"]["net_minor"] == finance["net_minor"] + 500_000
    inventory = analytics["inventory"]
    # Two discounted, one premium + one free, one free, one premium, one in refund quarantine.
    assert inventory["sold"] == 7 and inventory["refund_pending"] == 1
    # Saleable capacity is the sum of the three ticket types (50 + 100 + 20).
    assert inventory["held"] == 0 and inventory["capacity"] == 170
    campaigns = {row["name"]: row["redemptions"] for row in analytics["by_campaign"]}
    assert campaigns["Demo 10% off"] == campaigns["Demo last-minute (exhausted)"] == 1
    assert campaigns.get("Demo KZT 1,000 off", 0) == 0


def test_scanner_is_assigned_and_attendance_counts(client, demo):
    events = demo["events"]
    scanner = login(client, "scanner", "scanner")
    assigned = {row["id"] for row in get(client, "/scanner/events", scanner)}
    assert assigned == {events["concert"], events["meetup"]}
    counts = get(client, f"/scanner/events/{events['meetup']}/counts", scanner)
    assert counts == {"event_id": events["meetup"], "registered": 2, "admitted": 1}
    get(client, f"/scanner/events/{events['theatre']}/counts", scanner, 404)
    attendance = get(client, f"/events/{events['meetup']}/analytics", login(client, "organizer"))
    assert attendance["attendance"]["checked_in"] == 1
    assert attendance["attendance"]["not_checked_in_label"] == "not_yet_checked_in"


def test_seed_is_idempotent_and_reset_rebuilds_fresh_dates(client, factory, settings, demo):
    before = snapshot(factory)
    assert seed_demo_fixtures(factory, settings) == "present"
    assert snapshot(factory) == before

    removed = reset_demo(factory, settings, confirm=True)
    assert removed["event"] == 6 and removed["organization"] == 1 and removed["audit_log"] > 0
    assert demo_status(factory) == "absent"
    with factory() as db:
        assert db.scalar(select(User.id).where(User.email == DEMO_USERS["attendee"][1]))
        # The append-only guard is back on after the reset transaction.
        with pytest.raises(DBAPIError):
            db.execute(text("DELETE FROM biletflow.audit_log"))
        db.rollback()

    assert seed_demo_fixtures(factory, settings) == "built"
    again = demo_fixtures(factory)
    assert datetime.fromisoformat(again["built_at"]) > datetime.fromisoformat(demo["built_at"])
    assert again["orders"].keys() == demo["orders"].keys()
    assert set(again["events"].values()).isdisjoint(demo["events"].values())
    with factory() as db:
        concert = db.get(Event, UUID(again["events"]["concert"]))
        built = datetime.fromisoformat(again["built_at"])
        assert abs(concert.starts_at - (built + timedelta(days=30))) < timedelta(seconds=1)
    # Rebuilt fixtures have the same shape as the first build.
    assert shape(snapshot(factory)) == shape(before)


def shape(rows):
    """Row counts per table, leaving out sign-in history that grows with every build."""
    counts = {}
    for table, _ in rows:
        if table not in ("auth_session", "refresh_token", "audit_log", "auth_rate_bucket"):
            counts[table] = counts.get(table, 0) + 1
    return counts


def test_reset_keeps_unrelated_rows(client, setup, account, factory, settings, demo):
    # Unrelated data, including the demo attendee's order for someone else's event.
    f = setup()
    eid = f["event"]["id"]
    assert client.post(API + f"/events/{eid}/publish", headers=f["headers"]).status_code == 200
    outsiders = [account()[2], login(client, "attendee")]
    for headers in outsiders:
        held = client.post(
            API + f"/events/{eid}/holds",
            headers=headers,
            json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
        ).json()
        body = {
            "recipients": [
                {
                    "allocation_id": held["allocations"][0]["id"],
                    "name": "Outside Guest",
                    "email": "outside@example.com",
                }
            ]
        }
        assert (
            client.post(API + f"/holds/{held['id']}/confirm", headers=headers, json=body)
        ).status_code == 200
    before = snapshot(factory)
    removed = reset_demo(factory, settings, confirm=True)
    after = snapshot(factory)

    gone = set(before) - set(after)
    assert len(gone) == sum(removed.values()) and not set(after) - set(before)
    # Nothing that survived was modified, and nothing outside the demo scope was removed.
    assert all(after[key] == before[key] for key in after)
    demo_events = set(demo["events"].values())
    for key in gone:
        event_id = before[key].get("event_id")
        assert event_id is None or event_id in demo_events, key
        assert before[key].get("organization_id") in (None, demo["organization_id"]), key
    with factory() as db:
        assert db.get(Event, UUID(eid)).publication_state == "published"
        buyers = set(db.scalars(select(TicketOrder.buyer_user_id)))
        assert seed_id("demo-attendee") in buyers and len(buyers) == 2
        assert db.scalar(select(AuditLog.id).where(AuditLog.event_id == UUID(eid)).limit(1))


def test_reset_refuses_production_and_unconfirmed_runs(factory, settings, demo):
    production = production_settings(settings)
    with pytest.raises(DemoRefused):
        reset_demo(Untouched(), production, confirm=True)
    assert seed_demo_fixtures(Untouched(), production) == "skipped"
    with pytest.raises(DemoRefused):
        reset_demo(factory, settings)
    assert main(["--reset"]) == 2
    assert demo_status(factory) == "ready"


def test_incomplete_or_older_seed_is_left_for_an_explicit_reset(factory, settings):
    seed_catalog(factory)
    with factory.begin() as db:
        # The shape of the earlier insert-only seed: an organizer and organization only.
        db.add(
            User(
                id=seed_id("demo-organizer"),
                email=DEMO_USERS["organizer"][1],
                display_name="Demo Organizer",
            )
        )
        db.flush()
        db.execute(
            text(
                "INSERT INTO biletflow.organization (owner_user_id, name, contact_email) "
                "VALUES (:owner, 'Old demo', 'demo-organizer@example.com')"
            ),
            {"owner": seed_id("demo-organizer")},
        )
    assert seed_demo_fixtures(factory, settings) == "incomplete"
    assert demo_status(factory) == "incomplete"
    assert reset_demo(factory, settings, confirm=True) == {"organization": 1}
    assert seed_demo_fixtures(factory, settings) == "built"
