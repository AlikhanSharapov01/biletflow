import csv
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError

from app.admin_cli import set_admin
from app.admin_models import EventReport, ModerationAction, SettingVersion
from app.admin_service import csv_cell, effective_setting
from app.catalog_models import Event
from app.checkout_models import TicketOrder
from app.models import AuditLog, AuthSession, User
from app.security import now
from tests.test_admission import free_ticket, published, scan, staff

API = "/api/v1"
ADMIN = API + "/admin"


@pytest.fixture
def admin(account, factory):
    email, tokens, headers = account()
    assert set_admin(factory, email, True) == "granted"
    return email, tokens, headers


def reason(text_="Policy review"):
    return {"reason": text_}


def code(response):
    return response.json()["detail"]["code"]


def audit_actions(factory, **where):
    with factory() as db:
        query = select(AuditLog.action)
        for key, value in where.items():
            query = query.where(getattr(AuditLog, key) == value)
        return list(db.scalars(query.order_by(AuditLog.created_at)))


# ------------------------------------------------------------------ authorization


ADMIN_CALLS = [
    ("get", "/me", None),
    ("get", "/users", None),
    ("get", "/events", None),
    ("get", "/orders", None),
    ("get", "/tickets", None),
    ("get", "/reports", None),
    ("get", "/settings", None),
    ("get", "/moderation-actions", None),
    ("get", "/exports/users.csv", None),
    ("post", f"/users/{uuid4()}/suspend", reason()),
    ("post", f"/events/{uuid4()}/suspend", reason()),
    ("post", f"/reports/{uuid4()}/review", None),
    ("put", "/settings/hold_minutes", {"value": 5, "expected_version": 0}),
]


def test_only_platform_admins_reach_admin_functions(client, account, setup, factory):
    f = setup()  # an ordinary organizer owner
    _, _, attendee = account()
    for method, path, body in ADMIN_CALLS:
        anonymous = getattr(client, method)(ADMIN + path, **({"json": body} if body else {}))
        assert anonymous.status_code == 401, (method, path)
        for headers in (f["headers"], attendee):
            r = getattr(client, method)(
                ADMIN + path, headers=headers, **({"json": body} if body else {})
            )
            assert r.status_code == 403 and code(r) == "admin_required", (method, path)
    with factory() as db:
        assert db.scalar(select(func.count(SettingVersion.id))) == 0
        assert db.scalar(select(func.count(ModerationAction.id))) == 0


def test_admin_grant_is_revocable_and_cli_only(client, admin, account, factory):
    email, _, headers = admin
    assert client.get(ADMIN + "/me", headers=headers).json()["is_platform_admin"] is True
    assert set_admin(factory, email, True) == "already_admin"
    assert set_admin(factory, email, False) == "revoked"
    assert set_admin(factory, email, False) == "not_admin"
    assert client.get(ADMIN + "/me", headers=headers).status_code == 403  # same token, next request
    assert set_admin(factory, email, True) == "granted"
    assert client.get(ADMIN + "/me", headers=headers).status_code == 200
    with pytest.raises(LookupError):
        set_admin(factory, "nobody@example.com", True)
    # An unverified account cannot be granted access.
    client.post(
        API + "/auth/register",
        json={
            "email": "new@example.com",
            "password": "correct horse battery staple",
            "display_name": "New",
        },
    )
    with pytest.raises(ValueError):
        set_admin(factory, "new@example.com", True)
    assert "admin.granted" in audit_actions(factory, service_actor="admin_cli")
    with factory() as db:  # grant audit has a service actor, never a user
        assert db.scalar(select(func.count(AuditLog.id)).where(AuditLog.action == "admin.revoked"))


# ------------------------------------------------------------------ search


def test_search_users_events_orders_tickets_paginated(client, admin, setup, account, factory):
    _, _, headers = admin
    f = published(client, setup, factory)
    ticket, buyer = free_ticket(client, account, f, recipient="guest-user@example.com")
    free_ticket(client, account, f)

    users = client.get(ADMIN + "/users?limit=2", headers=headers).json()
    assert users["limit"] == 2 and users["total"] >= 4 and len(users["items"]) == 2
    assert "password_hash" not in users["items"][0]
    page2 = client.get(ADMIN + "/users?limit=2&offset=2", headers=headers).json()
    assert not {u["id"] for u in users["items"]} & {u["id"] for u in page2["items"]}
    admins = [u for u in client.get(ADMIN + "/users?limit=100", headers=headers).json()["items"]]
    assert sum(u["is_platform_admin"] for u in admins) == 1

    # LIKE wildcards in the search term are literal characters, not patterns.
    assert client.get(ADMIN + "/users?q=%25", headers=headers).json()["total"] == 0
    assert client.get(ADMIN + "/users?q=_", headers=headers).json()["total"] == 0

    found = client.get(ADMIN + "/events?q=campus", headers=headers).json()
    assert [e["id"] for e in found["items"]] == [f["event"]["id"]]
    assert (
        client.get(ADMIN + "/events?moderation_state=suspended", headers=headers).json()["total"]
        == 0
    )
    by_id = client.get(ADMIN + f"/events?q={f['event']['id']}", headers=headers).json()
    assert by_id["total"] == 1

    orders = client.get(ADMIN + f"/orders?event_id={f['event']['id']}", headers=headers).json()
    assert orders["total"] == 2 and orders["items"][0]["status"] == "confirmed"
    assert client.get(ADMIN + "/orders?q=guest-user", headers=headers).json()["total"] == 0
    tickets = client.get(ADMIN + "/tickets?q=guest-user", headers=headers).json()
    assert tickets["total"] == 1 and tickets["items"][0]["id"] == ticket["id"]
    assert client.get(ADMIN + "/tickets?status=refunded", headers=headers).json()["total"] == 0
    assert client.get(ADMIN + "/tickets?status=bogus", headers=headers).status_code == 422
    assert client.get(ADMIN + "/users?limit=101", headers=headers).status_code == 422


# ------------------------------------------------------------------ moderation


def test_suspend_user_revokes_sessions_and_reinstates(client, admin, account, factory):
    _, _, headers = admin
    email, tokens, victim = account()
    with factory() as db:
        user_id = db.scalar(select(User.id).where(User.email == email))
    assert client.get(API + "/me", headers=victim).status_code == 200

    assert (
        client.post(ADMIN + f"/users/{user_id}/suspend", headers=headers, json={}).status_code
        == 422
    )
    r = client.post(ADMIN + f"/users/{user_id}/suspend", headers=headers, json=reason("Abuse"))
    assert r.status_code == 200 and r.json()["action"] == "suspend"
    assert client.get(API + "/me", headers=victim).status_code == 401
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(AuthSession.id)).where(
                    AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
                )
            )
            == 0
        )
    login = client.post(
        API + "/auth/login",
        json={"email": email, "password": "correct horse battery staple", "client_kind": "web"},
    )
    assert login.status_code == 401

    again = client.post(ADMIN + f"/users/{user_id}/suspend", headers=headers, json=reason())
    assert again.status_code == 409 and code(again) == "user_already_suspended"
    r = client.post(ADMIN + f"/users/{user_id}/reinstate", headers=headers, json=reason("Appeal"))
    assert r.status_code == 200
    assert (
        client.post(
            ADMIN + f"/users/{user_id}/reinstate", headers=headers, json=reason()
        ).status_code
        == 409
    )
    assert (
        client.post(
            API + "/auth/login",
            json={"email": email, "password": "correct horse battery staple", "client_kind": "web"},
        ).status_code
        == 200
    )
    # The old (revoked) session stays dead.
    assert client.get(API + "/me", headers=victim).status_code == 401

    history = client.get(ADMIN + f"/moderation-actions?user_id={user_id}", headers=headers).json()
    assert [h["action"] for h in history] == ["reinstate", "suspend"]
    actions = audit_actions(factory, entity_id=user_id)
    assert "admin.user_suspended" in actions and "admin.user_reinstated" in actions
    missing = client.post(ADMIN + f"/users/{uuid4()}/suspend", headers=headers, json=reason())
    assert missing.status_code == 404


def test_admins_cannot_be_suspended_and_suspended_admin_loses_access(
    client, admin, account, factory
):
    email, _, headers = admin
    other_email, _, other = account()
    set_admin(factory, other_email, True)
    with factory() as db:
        other_id = db.scalar(select(User.id).where(User.email == other_email))
        own_id = db.scalar(select(User.id).where(User.email == email))
    r = client.post(ADMIN + f"/users/{other_id}/suspend", headers=headers, json=reason())
    assert r.status_code == 409 and code(r) == "admin_cannot_be_suspended"
    r = client.post(ADMIN + f"/users/{own_id}/suspend", headers=headers, json=reason())
    assert r.status_code == 409
    set_admin(factory, other_email, False)
    assert (
        client.post(
            ADMIN + f"/users/{other_id}/suspend", headers=headers, json=reason()
        ).status_code
        == 200
    )
    assert client.get(ADMIN + "/me", headers=other).status_code == 401


@pytest.mark.usefixtures("no_entry_confirmation")
def test_suspended_event_blocks_holds_checkout_admission_but_stays_readable(
    client, admin, setup, account, factory, settings
):
    _, _, headers = admin
    f = published(client, setup, factory)
    event_id = f["event"]["id"]
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    _, _, other_buyer = account()
    pending = client.post(
        API + f"/events/{event_id}/holds",
        headers=other_buyer,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
    )
    assert pending.status_code == 201

    assert (
        client.post(
            ADMIN + f"/events/{event_id}/suspend", headers=f["headers"], json=reason()
        ).status_code
        == 403
    )
    r = client.post(ADMIN + f"/events/{event_id}/suspend", headers=headers, json=reason("Fraud"))
    assert r.status_code == 200 and r.json()["target_event_id"] == event_id
    assert (
        client.post(
            ADMIN + f"/events/{event_id}/suspend", headers=headers, json=reason()
        ).status_code
        == 409
    )

    # No new holds, no fulfilment of an existing hold, no admission.
    new_hold = client.post(
        API + f"/events/{event_id}/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
    )
    assert new_hold.status_code in (404, 409)
    held = pending.json()
    confirm = client.post(
        API + f"/holds/{held['id']}/confirm",
        headers=other_buyer,
        json={
            "recipients": [
                {
                    "allocation_id": held["allocations"][0]["id"],
                    "name": "A",
                    "email": "a@example.com",
                }
            ]
        },
    )
    assert confirm.status_code in (404, 409)  # hidden from buyers, never fulfilled
    assert code(confirm) in ("event_not_found", "event_not_on_sale")
    admitted = scan(client, f, scanner, ticket["qr_payload"])
    assert admitted.status_code == 409 and code(admitted) == "admission_closed"

    # Records stay readable for the buyer, the organizer and the admin.
    assert client.get(API + "/orders", headers=buyer).json()
    assert (
        client.get(API + f"/events/{event_id}/attendees", headers=f["headers"]).status_code == 200
    )
    assert client.get(API + f"/events/{event_id}", headers=f["headers"]).status_code == 200
    suspended = client.get(ADMIN + "/events?moderation_state=suspended", headers=headers).json()
    assert [e["id"] for e in suspended["items"]] == [event_id]
    assert client.get(ADMIN + f"/orders?event_id={event_id}", headers=headers).json()["total"] == 1
    # Suspension is not a refund or cancellation.
    with factory() as db:
        assert (
            db.scalar(select(Event.publication_state).where(Event.id == UUID(event_id)))
            == "published"
        )
        assert db.scalar(select(TicketOrder.status)) == "confirmed"

    r = client.post(
        ADMIN + f"/events/{event_id}/reinstate", headers=headers, json=reason("Cleared")
    )
    assert r.status_code == 200
    assert (
        client.post(
            ADMIN + f"/events/{event_id}/reinstate", headers=headers, json=reason()
        ).status_code
        == 409
    )
    assert scan(client, f, scanner, ticket["qr_payload"]).status_code == 200
    ok = client.post(
        API + f"/holds/{held['id']}/confirm",
        headers=other_buyer,
        json={
            "recipients": [
                {
                    "allocation_id": held["allocations"][0]["id"],
                    "name": "A",
                    "email": "a@example.com",
                }
            ]
        },
    )
    assert ok.status_code == 200, ok.text
    scoped = audit_actions(factory, event_id=UUID(event_id))
    assert "admin.event_suspended" in scoped and "admin.event_reinstated" in scoped


# ------------------------------------------------------------------ reports


def report(client, headers, event_id, category="spam", description="Looks wrong"):
    return client.post(
        API + f"/events/{event_id}/reports",
        headers=headers,
        json={"category": category, "description": description},
    )


def test_reports_deduplicate_visibility_and_review_queue(client, admin, setup, account, factory):
    _, _, headers = admin
    f = published(client, setup, factory)
    event_id = f["event"]["id"]
    _, _, reporter = account()

    assert client.post(API + f"/events/{event_id}/reports", json={}).status_code == 401
    assert report(client, reporter, event_id, category="nope").status_code == 422
    first = report(client, reporter, event_id)
    assert first.status_code == 201 and first.json()["duplicate"] is False
    again = report(client, reporter, event_id, description="Another text")
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
    assert again.json()["duplicate"] is True
    assert report(client, reporter, event_id, category="fraud").status_code == 201

    # Draft events are not accessible to strangers, so cannot be reported.
    draft = setup()
    assert report(client, reporter, draft["event"]["id"]).status_code == 404
    assert report(client, reporter, str(uuid4())).status_code == 404

    assert client.get(ADMIN + "/reports", headers=reporter).status_code == 403
    queue = client.get(ADMIN + "/reports?status=open", headers=headers).json()
    assert queue["total"] == 2 and queue["items"][0]["id"] == first.json()["id"]
    assert (
        client.get(ADMIN + "/reports?limit=1&offset=1", headers=headers).json()["items"][0][
            "category"
        ]
        == "fraud"
    )

    rid = first.json()["id"]
    assert client.post(ADMIN + f"/reports/{rid}/review", headers=reporter).status_code == 403
    assert (
        client.post(ADMIN + f"/reports/{rid}/review", headers=headers).json()["status"]
        == "reviewing"
    )
    assert client.post(ADMIN + f"/reports/{rid}/review", headers=headers).status_code == 409
    # Still a live report while reviewing: still a duplicate.
    assert report(client, reporter, event_id).json()["duplicate"] is True
    assert (
        client.post(
            ADMIN + f"/reports/{rid}/resolve", headers=headers, json={"resolution": ""}
        ).status_code
        == 422
    )
    done = client.post(
        ADMIN + f"/reports/{rid}/resolve", headers=headers, json={"resolution": "No issue"}
    )
    assert done.status_code == 200 and done.json()["status"] == "resolved"
    assert done.json()["resolved_at"] and done.json()["resolution"] == "No issue"
    again = client.post(
        ADMIN + f"/reports/{rid}/resolve", headers=headers, json={"resolution": "x"}
    )
    assert again.status_code == 409 and code(again) == "report_already_resolved"
    assert client.get(ADMIN + f"/reports/{rid}", headers=headers).json()["status"] == "resolved"
    assert client.get(ADMIN + f"/reports/{uuid4()}", headers=headers).status_code == 404
    # After resolution the same reporter may report the event again.
    renewed = report(client, reporter, event_id)
    assert renewed.status_code == 201 and renewed.json()["id"] != rid

    actions = audit_actions(factory, event_id=UUID(event_id))
    assert {"report.created", "admin.report_reviewing", "admin.report_resolved"} <= set(actions)


def test_report_rate_limit_per_account(client, setup, account, factory):
    f = published(client, setup, factory)
    _, _, reporter = account()
    for category in ("spam", "fraud", "inappropriate", "misleading", "safety"):
        assert report(client, reporter, f["event"]["id"], category).status_code == 201
    limited = report(client, reporter, f["event"]["id"], "other")
    assert limited.status_code == 429 and code(limited) == "report_rate_limited"
    assert "Retry-After" in limited.headers
    # Duplicates are answered without consuming the allowance, and others are unaffected.
    assert report(client, reporter, f["event"]["id"], "spam").status_code == 200
    _, _, other = account()
    assert report(client, other, f["event"]["id"], "other").status_code == 201
    with factory.begin() as db:  # the window slides
        db.execute(
            text("UPDATE biletflow.event_report SET created_at = created_at - interval '2 hours'")
        )
    assert report(client, reporter, f["event"]["id"], "other").status_code == 201


def test_concurrent_identical_reports_create_one_row(client, setup, account, factory, app):
    from fastapi.testclient import TestClient

    f = published(client, setup, factory)
    _, _, reporter = account()

    def send(_):
        with TestClient(app) as local:
            return report(local, reporter, f["event"]["id"]).status_code

    with ThreadPoolExecutor(6) as pool:
        statuses = list(pool.map(send, range(6)))
    assert sorted(statuses) == [200] * 5 + [201]
    with factory() as db:
        assert db.scalar(select(func.count(EventReport.id))) == 1


# ------------------------------------------------------------------ settings


def test_settings_validation_versions_and_prospective_effect(client, admin, factory):
    _, _, headers = admin
    listing = {row["key"]: row for row in client.get(ADMIN + "/settings", headers=headers).json()}
    assert listing["hold_minutes"]["value"] == 10 and listing["hold_minutes"]["version"] == 0
    assert set(listing) == {
        "hold_minutes",
        "activation_fee_minor",
        "processing_rate_bps",
        "upload_max_mb",
    }

    url = ADMIN + "/settings/hold_minutes"
    for body, status in (
        ({"value": 0, "expected_version": 0}, 422),
        ({"value": 61, "expected_version": 0}, 422),
        ({"value": "5", "expected_version": 0}, 422),
        ({"value": 5}, 422),
        ({"value": 5, "expected_version": 0, "extra": 1}, 422),
        (
            {
                "value": 5,
                "expected_version": 0,
                "effective_at": (now() - timedelta(days=1)).isoformat(),
            },
            422,
        ),
        ({"value": 5, "expected_version": 0, "effective_at": "2030-01-01T00:00:00"}, 422),
        (
            {
                "value": 5,
                "expected_version": 0,
                "effective_at": (now() + timedelta(days=400)).isoformat(),
            },
            422,
        ),
        ({"value": 5, "expected_version": 3}, 409),
    ):
        assert client.put(url, headers=headers, json=body).status_code == status, body
    assert client.put(ADMIN + "/settings/unknown", headers=headers, json={}).status_code == 422

    changed = client.put(
        url, headers=headers, json={"value": 15, "expected_version": 0, "reason": "Peak load"}
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["value"] == 15 and changed.json()["version"] == 1
    # A stale or replayed update cannot silently overwrite.
    stale = client.put(url, headers=headers, json={"value": 20, "expected_version": 0})
    assert stale.status_code == 409 and code(stale) == "setting_version_conflict"

    future = (now() + timedelta(days=2)).isoformat()
    scheduled = client.put(
        url, headers=headers, json={"value": 30, "expected_version": 1, "effective_at": future}
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["value"] == 15 and scheduled.json()["pending"]["value"] == 30
    with factory() as db:
        assert effective_setting(db, "hold_minutes") == 15
        assert effective_setting(db, "hold_minutes", now() + timedelta(days=3)) == 30
        assert effective_setting(db, "processing_rate_bps") == 300

    history = client.get(url + "/history", headers=headers).json()
    assert [h["version"] for h in history] == [2, 1] and history[1]["reason"] == "Peak load"
    assert audit_actions(factory, action="admin.setting_changed") == ["admin.setting_changed"] * 2


def test_settings_do_not_rewrite_saved_orders_and_history_is_immutable(
    client, admin, setup, account, factory
):
    _, _, headers = admin
    f = published(client, setup, factory)
    free_ticket(client, account, f)

    def snapshot():
        with factory() as db:
            row = db.scalars(select(TicketOrder)).one()
            return (
                row.processing_rate_bps,
                row.payable_minor,
                row.processing_fee_minor,
                row.policy_snapshot,
            )

    before = snapshot()
    for key, value in (
        ("processing_rate_bps", 900),
        ("hold_minutes", 3),
        ("activation_fee_minor", 1),
    ):
        r = client.put(
            ADMIN + f"/settings/{key}",
            headers=headers,
            json={"value": value, "expected_version": 0},
        )
        assert r.status_code == 200
    assert snapshot() == before

    with factory() as db, pytest.raises(DBAPIError):
        db.execute(update(SettingVersion).values(value=1))
        db.commit()
    with factory() as db, pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM biletflow.platform_setting_version"))
        db.commit()


def test_concurrent_setting_changes_assign_one_winner(client, admin, factory, app):
    from fastapi.testclient import TestClient

    _, _, headers = admin

    def send(value):
        with TestClient(app) as local:
            return local.put(
                ADMIN + "/settings/upload_max_mb",
                headers=headers,
                json={"value": value, "expected_version": 0},
            ).status_code

    with ThreadPoolExecutor(5) as pool:
        statuses = list(pool.map(send, [1, 2, 3, 4, 5]))
    assert sorted(statuses) == [200, 409, 409, 409, 409]
    with factory() as db:
        assert db.scalar(select(func.count(SettingVersion.id))) == 1


# ------------------------------------------------------------------ CSV export


def test_csv_cells_neutralize_formulas():
    for risky in ("=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tTAB", "\rCR"):
        assert csv_cell(risky) == "'" + risky
    assert csv_cell("plain") == "plain" and csv_cell(None) == "" and csv_cell(5) == "5"
    assert csv_cell("a=b") == "a=b"


def test_csv_export_is_escaped_audited_and_scoped(client, admin, account, factory):
    _, _, headers = admin
    _, _, victim = account()
    evil = '=HYPERLINK("http://evil.example","x")'
    assert client.patch(API + "/me", headers=victim, json={"display_name": evil}).status_code == 200

    r = client.get(ADMIN + "/exports/users.csv", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0][:3] == ["id", "email", "display_name"]
    assert "password_hash" not in rows[0]
    names = [row[2] for row in rows[1:]]
    assert "'" + evil in names and evil not in names

    filtered = client.get(ADMIN + "/exports/users.csv?q=nonexistent-zzz", headers=headers)
    assert len(list(csv.reader(io.StringIO(filtered.text)))) == 1
    assert client.get(ADMIN + "/exports/users.csv?limit=1", headers=headers).text.count("\r\n") == 2
    assert client.get(ADMIN + "/exports/users.csv?limit=5001", headers=headers).status_code == 422
    assert client.get(ADMIN + "/exports/users.csv?status=bogus", headers=headers).status_code == 422
    assert client.get(ADMIN + "/exports/secrets.csv", headers=headers).status_code == 422
    assert client.get(ADMIN + "/exports/users.csv", headers=victim).status_code == 403
    assert client.get(ADMIN + "/exports/users.csv").status_code == 401
    for kind in ("events", "orders", "tickets"):
        assert client.get(ADMIN + f"/exports/{kind}.csv", headers=headers).status_code == 200
    assert audit_actions(factory, action="admin.export").count("admin.export") == 6


def test_event_and_ticket_export_columns_exclude_secrets(client, admin, setup, account, factory):
    _, _, headers = admin
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    body = client.get(ADMIN + "/exports/tickets.csv", headers=headers).text
    assert ticket["id"] in body
    assert "qr" not in body.lower().split("\r\n")[0] and "token" not in body.split("\r\n")[0]
    assert ticket["qr_payload"] not in body


def test_admin_cli_runs_in_a_fresh_interpreter(settings, account, factory):
    """Operator entry point must register every model itself (no create_app import)."""
    import os
    import subprocess
    import sys

    email, _, _ = account()
    env = {
        **os.environ,
        "DATABASE_URL": settings.database_url.get_secret_value(),
        "JWT_SECRET": settings.jwt_secret.get_secret_value(),
        "CHALLENGE_SECRET": settings.challenge_secret.get_secret_value(),
    }
    done = subprocess.run(
        [sys.executable, "-m", "app.admin_cli", "grant", email],
        capture_output=True,
        text=True,
        env=env,
        cwd=os.path.dirname(os.path.dirname(__file__)),
    )
    assert done.returncode == 0, done.stderr
