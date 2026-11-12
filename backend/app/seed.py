"""Catalog seed and reproducible lifecycle demo fixtures.

    python -m app.seed                                   # catalog, plus demo fixtures if absent
    python -m app.seed --reset --yes-reset-demo          # rebuild demo fixtures with fresh dates
    python -m app.seed --reset --yes-reset-demo --empty  # remove demo fixtures only

The catalog (categories, the demo venue and its 12-seat layout) is insert-only reference data.

The demo fixtures are fictional people and events built through the public API in-process,
so inventory, orders, payments, refunds, campaigns, check-ins, audit and outbox rows obey the
same invariants as real traffic. Every date is relative to the moment of the build. Demo
fixtures never run in production and need the payment simulator (development or test).

The demo scope is the set of organizations owned by the fixed-ID demo accounts and every row
that references them through a foreign key (their events, orders, tickets, refunds, audit and
so on). A reset deletes exactly that scope, including append-only history that is otherwise
immutable, and keeps the demo accounts themselves. It needs the database owner role.
"""

import argparse
import re
import sys
import warnings
from datetime import timedelta
from graphlib import TopologicalSorter
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert

from .catalog_models import (
    Category,
    Layout,
    Organization,
    Seat,
    Section,
    Venue,
    VenueRow,
)
from .config import Settings
from .db import database
from .models import AuditLog, AuthSession, OutboxJob, User
from .security import now, passwords


def seed_id(name):
    return uuid5(NAMESPACE_URL, "https://biletflow.example/seed/" + name)


def seed_catalog(factory):
    def add(db, model, seed_key, **values):
        identifier = seed_id(seed_key)
        db.execute(
            insert(model)
            .values(id=identifier, **values)
            .on_conflict_do_nothing(index_elements=[model.id])
        )
        return identifier

    with factory.begin() as db:
        add(
            db,
            Category,
            "category-community",
            code="community",
            name_en="Community",
            name_ru="Сообщество",
            name_kk="Қауымдастық",
        )
        add(
            db,
            Category,
            "category-concert",
            code="concert",
            name_en="Concert",
            name_ru="Концерт",
            name_kk="Концерт",
        )
        venue = add(
            db,
            Venue,
            "venue-campus",
            name="BiletFlow Demo Hall",
            city="Almaty",
            address="Fictional campus venue — demonstration only",
        )
        layout = add(
            db,
            Layout,
            "layout-campus",
            venue_id=venue,
            name="Demo 12 seats",
            version=1,
            canvas_width=800,
            canvas_height=400,
        )
        section = add(db, Section, "section-main", layout_id=layout, label="Main")
        for number, label in enumerate(["A", "B"]):
            row = add(
                db, VenueRow, "row-" + label, layout_id=layout, section_id=section, label=label
            )
            for seat in range(1, 7):
                add(
                    db,
                    Seat,
                    f"seat-{label}-{seat}",
                    layout_id=layout,
                    row_id=row,
                    label=str(seat),
                    price_category="premium" if label == "A" else "standard",
                    is_accessible=seat == 1,
                    x=100 * seat,
                    y=100 + 100 * number,
                )


# --- Demo fixtures ---------------------------------------------------------------------------

API = "/api/v1"
FIXTURE_VERSION = 1
MARKER_ACTION = "demo.fixtures_built"
SERVICE_ACTOR = "demo_seed"
# Fictional, documented demo password. Demo accounts never exist in production.
DEMO_PASSWORD = "BiletFlow-demo-2026"
DEMO_ORGANIZATION = "BiletFlow Demo Productions"
# key -> (seed key, email, display name). The organizer keeps the earlier seed's identifier.
DEMO_USERS = {
    "organizer": ("demo-organizer", "demo-organizer@example.com", "Demo Organizer"),
    "scanner": ("demo-scanner", "demo-scanner@example.com", "Demo Scanner"),
    "attendee": ("demo-attendee", "demo-attendee@example.com", "Aru Demo Attendee"),
    "guest": ("demo-guest", "demo-guest@example.com", "Dana Demo Guest"),
    "admin": ("demo-admin", "demo-admin@example.com", "Demo Platform Admin"),
}
FRIEND = ("Demo Friend", "demo-friend@example.com")
KZT = 100  # minor units per tenge


class DemoRefused(RuntimeError):
    """The demo fixtures cannot be built or reset in this environment or state."""


class DemoBuildError(RuntimeError):
    """A public API call made while building fixtures did not behave as documented."""


def demo_user_ids():
    return [seed_id(key) for key, _, _ in DEMO_USERS.values()]


def ensure_demo_environment(settings):
    if settings.environment == "production":
        raise DemoRefused("Demo fixtures are never built or reset in production")


def demo_organization_ids(db):
    return list(
        db.scalars(
            select(Organization.id)
            .where(Organization.owner_user_id.in_(demo_user_ids()))
            .order_by(Organization.id)
        )
    )


def demo_marker(db):
    """The audit row written as the last step of a complete build, or None."""
    orgs = demo_organization_ids(db)
    if not orgs:
        return None
    return db.scalar(
        select(AuditLog)
        .where(
            AuditLog.action == MARKER_ACTION,
            AuditLog.service_actor == SERVICE_ACTOR,
            AuditLog.organization_id.in_(orgs),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )


def demo_status(factory):
    """'absent', 'ready' (complete build) or 'incomplete' (partial or older-seed rows)."""
    with factory() as db:
        if demo_marker(db):
            return "ready"
        return "incomplete" if demo_organization_ids(db) else "absent"


def demo_fixtures(factory):
    """Identifiers of the current build (events, orders and accounts), or None."""
    with factory() as db:
        marker = demo_marker(db)
        return dict(marker.safe_change) if marker else None


# --- Reset -----------------------------------------------------------------------------------

NAME = re.compile(r"^[a-z_][a-z0-9_]*$")
FOREIGN_KEYS = """
SELECT child.relname AS child, parent.relname AS parent,
  array(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS child_columns,
  array(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS parent_columns
FROM pg_constraint c
JOIN pg_class child ON child.oid = c.conrelid
JOIN pg_class parent ON parent.oid = c.confrelid
WHERE c.contype = 'f' AND c.connamespace = 'biletflow'::regnamespace
ORDER BY child.relname, c.conname
"""


def quoted(name):
    if not NAME.fullmatch(name):
        raise DemoRefused(f"Unexpected table or column name: {name!r}")
    return f'"{name}"'


def collect_scope(db):
    """Fill a temporary table with every row in the demo scope, found through the live FKs."""
    keys = [row for row in db.execute(text(FOREIGN_KEYS)).mappings() if row["parent"] != "app_user"]
    db.execute(
        text(
            "CREATE TEMP TABLE demo_scope (tbl text NOT NULL, id uuid NOT NULL, "
            "PRIMARY KEY (tbl, id)) ON COMMIT DROP"
        )
    )
    db.execute(
        text(
            "INSERT INTO demo_scope SELECT 'organization', id FROM biletflow.organization "
            "WHERE owner_user_id = ANY(:users)"
        ),
        {"users": demo_user_ids()},
    )
    statements = []
    for key in keys:
        join = " AND ".join(
            f"c.{quoted(a)} = p.{quoted(b)}"
            for a, b in zip(key["child_columns"], key["parent_columns"], strict=True)
        )
        statements.append(
            text(
                f"INSERT INTO demo_scope SELECT DISTINCT '{key['child']}', c.id "
                f"FROM biletflow.{quoted(key['child'])} c "
                f"JOIN biletflow.{quoted(key['parent'])} p ON {join} "
                f"JOIN demo_scope s ON s.tbl = '{key['parent']}' AND s.id = p.id "
                "ON CONFLICT DO NOTHING"
            )
        )
    # Repeat until a full pass adds nothing: the scope is closed under "references".
    while sum(db.execute(statement).rowcount for statement in statements):
        pass
    # Jobs without an event column (staff invitations) name their subject in the payload.
    db.execute(
        text(
            "INSERT INTO demo_scope SELECT DISTINCT 'outbox_job', j.id FROM biletflow.outbox_job j "
            "CROSS JOIN LATERAL jsonb_each_text(j.payload) kv "
            "JOIN demo_scope s ON s.id::text = kv.value ON CONFLICT DO NOTHING"
        )
    )
    return keys


def deletion_groups(tables, edges):
    """Tables grouped into foreign-key cycles, ordered so referencing groups go first.

    ``edges`` holds (child, parent) pairs: child rows reference parent rows.
    """
    tables = sorted(tables)
    parents = {table: set() for table in tables}
    for child, parent in edges:
        if child != parent:
            parents[child].add(parent)

    def reachable(start):
        seen, stack = set(), [start]
        while stack:
            for parent in parents[stack.pop()]:
                if parent not in seen:
                    seen.add(parent)
                    stack.append(parent)
        return seen

    reach = {table: reachable(table) for table in tables}
    group_of = {}
    for table in tables:
        if table not in group_of:
            members = tuple(
                t for t in tables if t == table or (t in reach[table] and table in reach[t])
            )
            for member in members:
                group_of[member] = members
    order = TopologicalSorter()
    for table in tables:
        order.add(group_of[table])
        for parent in parents[table]:
            if group_of[parent] != group_of[table]:
                # The parent group goes after the child group that references it.
                order.add(group_of[parent], group_of[table])
    return list(order.static_order())


def reset_demo(factory, settings, *, confirm=False):
    """Delete the demo scope in one transaction; return removed row counts by table.

    Refuses in production and without explicit confirmation. Rows outside the scope,
    including the demo accounts and anything they did in other organizations, are kept.
    """
    ensure_demo_environment(settings)
    if not confirm:
        raise DemoRefused("Resetting demo data needs explicit confirmation (--yes-reset-demo)")
    with factory.begin() as db:
        keys = collect_scope(db)
        counts = dict(
            db.execute(text("SELECT tbl, count(*) FROM demo_scope GROUP BY tbl")).tuples().all()
        )
        if not counts:
            return {}
        edges = {
            (key["child"], key["parent"])
            for key in keys
            if key["child"] in counts and key["parent"] in counts
        }
        groups = deletion_groups(counts, edges)
        triggered = set(
            db.scalars(
                text(
                    "SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
                    "WHERE NOT t.tgisinternal AND c.relnamespace = 'biletflow'::regnamespace"
                )
            )
        )
        guarded = sorted(triggered & set(counts))
        # Append-only guards (audit, finance, redemptions, support history) are lifted for
        # this transaction only; ALTER TABLE is transactional and needs the owner role.
        for table in guarded:
            db.execute(text(f"ALTER TABLE biletflow.{quoted(table)} DISABLE TRIGGER USER"))
        for group in groups:
            # Tables that reference each other in a cycle are deleted by one statement, so
            # the (non-deferrable) foreign-key checks run once all of them are gone.
            deletes = [
                f"DELETE FROM biletflow.{quoted(table)} WHERE id IN "
                f"(SELECT id FROM demo_scope WHERE tbl = '{table}')"
                for table in group
            ]
            ctes = ", ".join(f"d{i} AS ({sql})" for i, sql in enumerate(deletes[1:]))
            db.execute(text((f"WITH {ctes} " if ctes else "") + deletes[0]))
        for table in guarded:
            db.execute(text(f"ALTER TABLE biletflow.{quoted(table)} ENABLE TRIGGER USER"))
    return dict(sorted(counts.items()))


# --- Build -----------------------------------------------------------------------------------


def upsert_demo_users(factory):
    password_hash = passwords.hash(DEMO_PASSWORD)
    current = now()
    with factory.begin() as db:
        for key, email, name in DEMO_USERS.values():
            identifier = seed_id(key)
            owner = db.scalar(select(User.id).where(User.email == email))
            if owner and owner != identifier:
                raise DemoRefused(f"{email} already belongs to a non-demo account")
            values = {
                "email": email,
                "display_name": name,
                "password_hash": password_hash,
                "email_verified_at": current,
                "status": "active",
                "locale": "en",
            }
            db.execute(
                insert(User)
                .values(id=identifier, **values)
                .on_conflict_do_update(index_elements=[User.id], set_=values)
            )


class DemoClient:
    """Calls the public API in-process as the fixed demo accounts."""

    def __init__(self, client, factory, settings):
        self.client, self.factory, self.settings = client, factory, settings
        self.sessions, self.headers = [], {}

    def sign_in(self, key, client_kind="web"):
        from .security import access_token
        from .service import new_session

        with self.factory.begin() as db:
            user = db.get(User, seed_id(DEMO_USERS[key][0]))
            session, _ = new_session(db, self.settings, user, client_kind)
            token = access_token(self.settings, session)
            self.sessions.append(session.id)
        self.headers[key] = {"Authorization": "Bearer " + token}

    def call(self, method, path, who=None, body=None, expect=(200, 201)):
        response = self.client.request(
            method, API + path, headers=self.headers.get(who, {}), json=body
        )
        if response.status_code not in expect:
            raise DemoBuildError(
                f"{method} {path} as {who}: {response.status_code} {response.text[:500]}"
            )
        return response.json()


def build_demo(factory, settings):
    """Create every lifecycle example through the public API; return its identifiers."""
    with warnings.catch_warnings():
        # The in-process transport is used deliberately; its deprecation notice is noise.
        warnings.simplefilter("ignore")
        from fastapi.testclient import TestClient

    from .activation_service import TERMS_VERSION
    from .checkout_expiry import sweep_event
    from .commerce_models import RefundAttempt
    from .main import create_app
    from .payments_service import dispatch_refund_once, simulation_enabled
    from .security import challenge_value

    ensure_demo_environment(settings)
    if not simulation_enabled(settings):
        raise DemoRefused("Demo fixtures need the payment simulator (development or test)")
    from .admin_cli import set_admin

    upsert_demo_users(factory)
    set_admin(factory, DEMO_USERS["admin"][1], True)
    # The operator's own build is not abusive traffic: lift per-caller limits for this
    # private in-process app only. Everything else uses the given settings unchanged.
    local = settings.model_copy(
        deep=True, update={"rate_ip_limit": 10**6, "rate_identity_limit": 10**6}
    )
    app = create_app(local)
    with TestClient(app) as client:
        api = DemoClient(client, factory, settings)
        for key in ("organizer", "attendee", "guest"):
            api.sign_in(key)
        api.sign_in("scanner", "scanner")
        current = now()
        hour, day = timedelta(hours=1), timedelta(days=1)
        venue, layout = seed_id("venue-campus"), seed_id("layout-campus")
        ids = {"version": FIXTURE_VERSION, "built_at": current.isoformat()}
        events, orders = {}, {}

        org = api.call(
            "POST",
            "/organizations",
            "organizer",
            {"name": DEMO_ORGANIZATION, "contact_email": DEMO_USERS["organizer"][1]},
        )["id"]
        for step in ("payout-profile", "identity-verification"):
            api.call("POST", f"/organizations/{org}/paid-sales/{step}", "organizer")

        def event(key, title, description, starts, capacity, *, hours=3, category="concert",
                  visibility="public", assigned=False, refunds=True, live=False):  # fmt: skip
            ends = starts + timedelta(hours=hours)
            closes = ends - timedelta(minutes=30) if live else starts - hour
            body = {
                "category_id": str(seed_id("category-" + category)),
                "venue_id": str(venue),
                "title": title,
                "description": description + " Fictional demonstration event.",
                "capacity": capacity,
                "visibility": visibility,
                "starts_at": starts.isoformat(),
                "ends_at": ends.isoformat(),
                "registration_opens_at": (current - 2 * day).isoformat(),
                "registration_closes_at": closes.isoformat(),
                "admission_opens_at": (starts - hour).isoformat(),
                "admission_closes_at": ends.isoformat(),
                "refund_allowed": refunds,
                "refund_cutoff_at": (starts - day).isoformat() if refunds else None,
            }
            if assigned:
                body |= {"seating_mode": "assigned", "venue_layout_id": str(layout)}
            made = api.call("POST", f"/organizations/{org}/events", "organizer", body)
            events[key] = made["id"]
            return made["id"], body

        def ticket_type(event_id, body, name, price, quantity, per_order=5):
            data = {
                "name": name,
                "description": "Demonstration ticket; no real money moves.",
                "kind": "paid" if price else "free",
                "price_minor": price,
                "quantity_limit": quantity,
                "per_order_limit": per_order,
                "sales_open_at": body["registration_opens_at"],
                "sales_close_at": body["registration_closes_at"],
            }
            return api.call("POST", f"/events/{event_id}/ticket-types", "organizer", data)["id"]

        def publish(event_id, paid=False):
            api.call("POST", f"/events/{event_id}/publish", "organizer")
            if paid:
                api.call(
                    "POST",
                    f"/events/{event_id}/paid-sales/terms",
                    "organizer",
                    {"terms_version": TERMS_VERSION},
                )
                fee = api.call("POST", f"/events/{event_id}/paid-sales/activation", "organizer")
                pay(fee["payment"]["id"], "organizer")

        def pay(attempt_id, who):
            api.call(
                "POST", f"/simulator/payments/{attempt_id}/events", who, {"outcome": "succeeded"}
            )

        def buy(key, event_id, who, lines, promo=None, paid=True, settle=True):
            body = {"items": []}
            for type_id, quantity, *seats in lines:
                line = {"ticket_type_id": type_id, "quantity": quantity}
                if seats:
                    line["seat_ids"] = seats[0]
                body["items"].append(line)
            if promo:
                body["promo_code"] = promo
            held = api.call("POST", f"/events/{event_id}/holds", who, body)
            _, email, name = DEMO_USERS[who]
            people = [(name, email)] + [FRIEND] * (len(held["allocations"]) - 1)
            recipients = {
                "recipients": [
                    {"allocation_id": row["id"], "name": person, "email": address}
                    for row, (person, address) in zip(held["allocations"], people, strict=True)
                ]
            }
            step = "checkout" if paid else "confirm"
            order = api.call("POST", f"/holds/{held['id']}/{step}", who, recipients)
            if paid and settle:
                pay(order["payment"]["id"], who)
                order = api.call("GET", f"/orders/{order['id']}", who)
            orders[key] = order["id"]
            return order, held

        def campaign(event_id, name, kind, value, limit, code, closes):
            api.call(
                "POST",
                f"/events/{event_id}/campaigns",
                "organizer",
                {
                    "name": name,
                    "discount_kind": kind,
                    "value": value,
                    "starts_at": (current - day).isoformat(),
                    "ends_at": closes,
                    "max_redemptions": limit,
                    "eligible_ticket_type_ids": [],
                    "code": code,
                },
            )

        # The scanner joins the organization as an ordinary member.
        invitation = api.call(
            "POST",
            f"/organizations/{org}/invitations",
            "organizer",
            {"email": DEMO_USERS["scanner"][1]},
        )
        token = challenge_value(settings, "staff_invite", invitation["id"])
        member = api.call("POST", "/staff-invitations/accept", "scanner", {"token": token})["id"]

        def assign_scanner(event_id):
            api.call(
                "PUT",
                f"/events/{event_id}/staff",
                "organizer",
                {"member_id": member, "capabilities": ["scan", "reverse_checkin"]},
            )

        # 1. Upcoming concert: free + paid types, campaigns, refunds and an expired hold.
        concert, body = event(
            "concert",
            "BiletFlow Demo Concert",
            "Mixed free and paid tickets with promo campaigns.",
            current + 30 * day,
            200,
        )
        community = ticket_type(concert, body, "Community pass", 0, 50)
        standard = ticket_type(concert, body, "Standard", 10_000 * KZT, 100)
        premium = ticket_type(concert, body, "Premium", 30_000 * KZT, 20)
        publish(concert, paid=True)
        assign_scanner(concert)
        closes = body["registration_closes_at"]
        campaign(concert, "Demo 10% off", "percent", 10, 100, "DEMO10", closes)
        campaign(concert, "Demo KZT 1,000 off", "fixed", 1_000 * KZT, 50, "DEMO1000", closes)
        campaign(concert, "Demo last-minute (exhausted)", "percent", 20, 1, "DEMOLAST", closes)
        buy("concert_discounted", concert, "attendee", [(standard, 2)], promo="DEMO10")
        buy("concert_mixed", concert, "attendee", [(community, 1), (premium, 1)])
        buy("concert_free", concert, "guest", [(community, 1)], paid=False)
        buy("concert_exhausted_campaign", concert, "guest", [(premium, 1)], promo="DEMOLAST")

        refunded, _ = buy("concert_refunded", concert, "guest", [(standard, 1)])
        started = api.call(
            "POST",
            f"/orders/{refunded['id']}/refunds",
            "organizer",
            {"reason": "Demo: attendee could not attend"},
        )
        refund_id = started["refund"]["id"]
        with factory.begin() as db:
            # Put this refund first in the worker queue, then run the worker step on it.
            db.execute(
                update(OutboxJob)
                .where(OutboxJob.deduplication_key == f"refund-dispatch:{refund_id}:1")
                .values(available_at=current - 365 * day)
            )
        attempt = None
        for _ in range(20):
            with factory() as db:
                attempt = db.scalar(
                    select(RefundAttempt.id).where(RefundAttempt.refund_id == refund_id)
                )
            if attempt or not dispatch_refund_once(factory):
                break
        if not attempt:
            raise DemoBuildError("The demo refund was not dispatched")
        api.call("POST", f"/simulator/refunds/{attempt}/events", "guest", {"outcome": "succeeded"})

        pending, _ = buy("concert_refund_pending", concert, "attendee", [(standard, 1)])
        api.call(
            "POST",
            f"/orders/{pending['id']}/refunds",
            "organizer",
            {"reason": "Demo: refund awaiting the provider"},
        )

        _, held = buy("concert_expired", concert, "guest", [(standard, 1)], settle=False)
        with factory.begin() as db:
            # Simulate the ten-minute hold running out, then run the real expiry sweep.
            db.execute(
                text(
                    "UPDATE biletflow.checkout_hold SET created_at = :created, expires_at = :expires "
                    "WHERE id = :hold"
                ),
                {"created": current - 2 * hour, "expires": current - hour, "hold": held["id"]},
            )
        sweep_event(factory, concert)

        # 2. Sold-out theatre: every unit of the only ticket type is sold.
        theatre, body = event(
            "theatre",
            "BiletFlow Demo Theatre: Sold Out",
            "Small paid performance with no seats left.",
            current + 14 * day,
            4,
            hours=2,
            category="community",
        )
        seat = ticket_type(theatre, body, "Theatre seat", 2_500 * KZT, 4, per_order=2)
        publish(theatre, paid=True)
        buy("theatre_attendee", theatre, "attendee", [(seat, 2)])
        buy("theatre_guest", theatre, "guest", [(seat, 2)])

        # 3. Assigned-seat gala on the 12-seat demo layout.
        gala, body = event(
            "gala",
            "BiletFlow Demo Seated Gala",
            "Assigned seating: row A premium, row B standard.",
            current + 21 * day,
            12,
            assigned=True,
        )
        gala_premium = ticket_type(gala, body, "Premium seat", 30_000 * KZT, 6)
        gala_standard = ticket_type(gala, body, "Standard seat", 3_000 * KZT, 6)
        api.call(
            "POST",
            f"/events/{gala}/seats/configure",
            "organizer",
            {"ticket_types": {"premium": gala_premium, "standard": gala_standard}},
        )
        publish(gala, paid=True)
        seats = {
            row["row_label"] + row["seat_label"]: row["id"]
            for row in api.call("GET", f"/events/{gala}/seats", "organizer")["items"]
        }
        buy("gala_attendee", gala, "attendee", [(gala_premium, 2, [seats["A3"], seats["A4"]])])
        buy("gala_guest", gala, "guest", [(gala_standard, 1, [seats["B1"]])])

        # 4. Free meetup happening now: one admitted ticket and one not yet checked in.
        meetup, body = event(
            "meetup",
            "BiletFlow Demo Meetup (live now)",
            "Admission is open; the demo scanner is assigned.",
            current - timedelta(minutes=30),
            50,
            hours=4,
            category="community",
            refunds=False,
            live=True,
        )
        entry = ticket_type(meetup, body, "Free entry", 0, 50)
        publish(meetup)
        assign_scanner(meetup)
        admitted, _ = buy("meetup_checked_in", meetup, "attendee", [(entry, 1)], paid=False)
        buy("meetup_not_checked_in", meetup, "guest", [(entry, 1)], paid=False)
        ticket = admitted["items"][0]["ticket"]
        scan = {"qr_payload": ticket["qr_payload"], "operation_id": str(uuid4())}
        if settings.admission_require_entry_confirmation:
            confirmation = api.call(
                "POST", f"/tickets/{ticket['id']}/entry-confirmations", "attendee"
            )
            scan["entry_confirmation"] = confirmation["token"]
        api.call("POST", f"/scanner/events/{meetup}/check-ins", "scanner", scan)

        # 5. Private workshop: hidden from the catalog, visible to the invited attendee.
        private, body = event(
            "private",
            "BiletFlow Demo Private Workshop",
            "Private event; only invited accounts can see it.",
            current + 10 * day,
            20,
            category="community",
            visibility="private",
        )
        invite = ticket_type(private, body, "Invited guest", 0, 20)
        publish(private)
        api.call(
            "PUT",
            f"/events/{private}/access",
            "organizer",
            {"user_id": str(seed_id(DEMO_USERS["attendee"][0]))},
        )
        buy("private_attendee", private, "attendee", [(invite, 1)], paid=False)

        # 6. Cancelled festival: the registration is cancelled with the event.
        festival, body = event(
            "festival",
            "BiletFlow Demo Festival (cancelled)",
            "Cancelled by the organizer after registrations opened.",
            current + 45 * day,
            100,
            category="community",
        )
        festival_pass = ticket_type(festival, body, "Festival pass", 0, 100)
        publish(festival)
        buy("festival_cancelled", festival, "attendee", [(festival_pass, 1)], paid=False)
        api.call("POST", f"/events/{festival}/cancel", "organizer")

        ids |= {
            "organization_id": org,
            "events": events,
            "orders": orders,
            "users": {key: str(seed_id(value[0])) for key, value in DEMO_USERS.items()},
        }
        with factory.begin() as db:
            # Seed sessions were only for building; nobody can reuse their tokens.
            db.execute(
                update(AuthSession)
                .where(AuthSession.id.in_(api.sessions), AuthSession.revoked_at.is_(None))
                .values(revoked_at=now())
            )
            db.add(
                AuditLog(
                    service_actor=SERVICE_ACTOR,
                    organization_id=org,
                    action=MARKER_ACTION,
                    entity_type="organization",
                    entity_id=org,
                    description=MARKER_ACTION,
                    safe_change=ids,
                    correlation_id=uuid4(),
                )
            )
    return ids


def seed_demo_fixtures(factory, settings):
    """Build the demo fixtures when absent; never deletes. Returns the resulting status.

    'skipped' in production, 'built' after a build, 'present' when a complete build exists,
    and 'incomplete' when demo-owned rows exist without a complete build (an interrupted run
    or an older seed): those need an explicit reset.
    """
    if settings.environment == "production":
        return "skipped"
    status = demo_status(factory)
    if status == "absent":
        build_demo(factory, settings)
        return "built"
    return "present" if status == "ready" else "incomplete"


MESSAGES = {
    "skipped": "Demo fixtures skipped: production environment.",
    "built": "Demo fixtures built.",
    "present": "Demo fixtures already present; reset to refresh their dates.",
    "incomplete": (
        "Demo fixtures are incomplete or from an older seed; run "
        "'python -m app.seed --reset --yes-reset-demo' to rebuild them."
    ),
}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Seed the catalog and demo fixtures")
    parser.add_argument(
        "--reset", action="store_true", help="delete the demo scope, then rebuild it"
    )
    parser.add_argument(
        "--yes-reset-demo", action="store_true", help="confirm the destructive demo reset"
    )
    parser.add_argument(
        "--empty", action="store_true", help="with --reset: remove demo data without rebuilding"
    )
    args = parser.parse_args(argv)
    if args.empty and not args.reset:
        parser.error("--empty needs --reset")
    if args.reset and not args.yes_reset_demo:
        # Checked before any configuration is read or any connection is opened.
        print("Refused: add --yes-reset-demo to confirm the demo reset.", file=sys.stderr)
        return 2
    settings = Settings()
    if args.reset and settings.environment == "production":
        print("Refused: demo data is never reset in production.", file=sys.stderr)
        return 2
    engine, factory = database(settings.database_url.get_secret_value())
    try:
        seed_catalog(factory)
        if args.reset:
            removed = reset_demo(factory, settings, confirm=args.yes_reset_demo)
            print(f"Demo reset removed {sum(removed.values())} rows in {len(removed)} tables.")
            if args.empty:
                return 0
        print(MESSAGES[seed_demo_fixtures(factory, settings)])
    except DemoRefused as error:
        print(f"Refused: {error}", file=sys.stderr)
        return 2
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
