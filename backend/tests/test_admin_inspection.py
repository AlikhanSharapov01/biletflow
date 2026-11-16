"""BF-21 (#72): admin operational search and read-only detail inspection."""

from uuid import uuid4

from sqlalchemy import func, select

from app.models import AuditLog
from app.support_models import CaseChange, SupportMessage
from tests.test_admin import admin as admin
from tests.test_admin import code
from tests.test_admission import free_ticket, published, scan, staff
from tests.test_campaigns import create as create_campaign
from tests.test_campaigns import redeemed
from tests.test_entry_confirmation import code_of, confirm
from tests.test_offline import attendee, op, prepared, results, upload
from tests.test_paid_orders import paid_event
from tests.test_support import SUPPORT, me, open_case, say

API = "/api/v1"
ADMIN = API + "/admin"

INSPECTION_CALLS = [
    "/support-cases",
    f"/support-cases/{uuid4()}",
    f"/orders/{uuid4()}",
    "/activations",
    "/campaigns",
    f"/campaigns/{uuid4()}",
    "/sync-conflicts",
    f"/sync-conflicts/{uuid4()}",
]


def get(client, headers, path, **params):
    return client.get(ADMIN + path, headers=headers, params=params)


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def test_inspection_is_admin_only(client, setup, account):
    f = setup()  # an organizer owner is not a platform admin
    _, _, attendee_headers = account()
    for path in INSPECTION_CALLS:
        assert client.get(ADMIN + path).status_code == 401, path
        for headers in (f["headers"], attendee_headers):
            r = client.get(ADMIN + path, headers=headers)
            assert r.status_code == 403 and code(r) == "admin_required", path


def support_world(client, setup, account, factory):
    f = published(client, setup, factory)
    ticket, buyer = free_ticket(client, account, f)
    order_id = client.get(API + "/orders", headers=buyer).json()[0]["id"]
    case = open_case(client, buyer, f, order_id=order_id, ticket_id=ticket["id"])
    assert case.status_code == 201, case.text
    other = open_case(client, account()[2], f, subject="Seat question 100%_done")
    assert other.status_code == 201, other.text
    return f, ticket, buyer, order_id, case.json()["case"], other.json()["case"]


def test_support_case_search_by_identifiers_and_fields(client, setup, account, admin, factory):
    headers = admin[2]
    f, ticket, buyer, order_id, case, other = support_world(client, setup, account, factory)
    everything = ok(get(client, headers, "/support-cases"))
    assert everything["total"] == 2 and everything["limit"] == 50
    for params in (
        {"case_id": case["id"]},
        {"order_id": order_id},
        {"ticket_id": ticket["id"]},
        {"requester_user_id": me(client, buyer)},
        {"q": case["id"]},
    ):
        page = ok(get(client, headers, "/support-cases", **params))
        assert [row["id"] for row in page["items"]] == [case["id"]], params
    # Text search matches the subject literally; LIKE wildcards are not patterns.
    assert ok(get(client, headers, "/support-cases", q="100%_done"))["total"] == 1
    assert ok(get(client, headers, "/support-cases", q="%"))["total"] == 0
    scoped = ok(
        get(
            client,
            headers,
            "/support-cases",
            event_id=f["event"]["id"],
            organization_id=f["org"]["id"],
            status="open",
            category="delivery",
            kind="attendee",
            escalated="false",
        )
    )
    assert scoped["total"] == 2
    assert ok(get(client, headers, "/support-cases", escalated="true"))["total"] == 0
    row = everything["items"][0]
    assert set(row) == {
        "id",
        "kind",
        "category",
        "subject",
        "status",
        "requester_user_id",
        "organization_id",
        "event_id",
        "order_id",
        "ticket_id",
        "assigned_to_user_id",
        "escalated_at",
        "resolved_at",
        "last_seq",
        "created_at",
        "updated_at",
        "platform_access",
    }
    assert row["platform_access"] is False
    for bad in ({"case_id": "nope"}, {"status": "closed"}, {"limit": 101}, {"kind": "x"}):
        assert get(client, headers, "/support-cases", **bad).status_code == 422, bad


def test_support_detail_is_read_only_and_grants_no_role(
    client, setup, account, admin, factory, settings
):
    headers = admin[2]
    f, ticket, buyer, order_id, case, _ = support_world(client, setup, account, factory)
    detail = ok(get(client, headers, f"/support-cases/{case['id']}"))
    assert detail["case"]["id"] == case["id"] and detail["viewer_roles"] == []
    assert detail["message_count"] == 1 and detail["history"] == []
    assert detail["order"] == {"id": order_id, "status": "confirmed"}
    assert detail["ticket"] == {"id": ticket["id"], "status": "valid"}
    # Message text is never part of the inspection view.
    assert "I did not get my ticket" not in str(detail)
    # Inspecting a non-escalated attendee case does not let the admin work it.
    assert client.get(SUPPORT + f"/cases/{case['id']}", headers=headers).status_code == 404
    assert say(client, headers, case["id"], "Hello").status_code == 404
    with factory() as db:
        assert db.scalar(select(func.count(SupportMessage.id))) == 2
        assert db.scalar(select(func.count(CaseChange.id))) == 0
    # After escalation the existing platform role applies and history is linked.
    support = staff(client, settings, account, f, ["support"])
    r = client.post(
        SUPPORT + f"/cases/{case['id']}/escalation", headers=support, json={"reason": "Help"}
    )
    assert r.status_code == 200, r.text
    detail = ok(get(client, headers, f"/support-cases/{case['id']}"))
    assert detail["viewer_roles"] == ["platform"]
    assert [h["change_kind"] for h in detail["history"]] == ["escalation"]
    assert ok(get(client, headers, "/support-cases", escalated="true"))["total"] == 1
    missing = get(client, headers, f"/support-cases/{uuid4()}")
    assert missing.status_code == 404 and code(missing) == "case_not_found"


def test_support_queue_identifier_filters_keep_scope(client, setup, account, admin, factory):
    f, ticket, buyer, order_id, case, other = support_world(client, setup, account, factory)
    owner = f["headers"]
    queue = client.get(SUPPORT + "/cases", headers=owner, params={"view": "queue"}).json()
    assert queue["total"] == 2
    for params in (
        {"case_id": case["id"]},
        {"order_id": order_id},
        {"ticket_id": ticket["id"]},
        {"requester_user_id": me(client, buyer)},
    ):
        page = client.get(SUPPORT + "/cases", headers=owner, params={"view": "queue", **params})
        assert [row["id"] for row in page.json()["items"]] == [case["id"]], params
    # A requester filtering their own list never sees someone else's case.
    mine = client.get(SUPPORT + "/cases", headers=buyer, params={"case_id": other["id"]})
    assert mine.json()["total"] == 0
    # The admin's queue is still only platform and escalated cases.
    adm = client.get(SUPPORT + "/cases", headers=admin[2], params={"view": "queue"})
    assert adm.json()["total"] == 0
    bad = client.get(SUPPORT + "/cases", headers=owner, params={"order_id": "x"})
    assert bad.status_code == 422


def test_order_detail_links_records_without_admission_secrets(
    client, setup, account, admin, factory
):
    headers = admin[2]
    f, ticket, buyer, order_id, case, _ = support_world(client, setup, account, factory)
    with factory() as db:
        audits = db.scalar(select(func.count(AuditLog.id)))
    detail = ok(get(client, headers, f"/orders/{order_id}"))
    assert detail["order"]["id"] == order_id and detail["order"]["status"] == "confirmed"
    item = detail["order"]["items"][0]
    assert item["ticket"]["id"] == ticket["id"] and item["ticket"]["qr_payload"] is None
    assert "qr_token_hash" not in str(detail) and ticket["qr_payload"] not in str(detail)
    assert [c["id"] for c in detail["support_cases"]] == [case["id"]]
    assert detail["deliveries"][0]["ticket_id"] == ticket["id"]
    assert detail["deliveries"][0]["status"] in ("pending", "leased", "done", "dead")
    assert any(row["entity_id"] == order_id for row in detail["audit"])
    assert set(detail["audit"][0]) == {
        "id",
        "action",
        "entity_type",
        "entity_id",
        "actor_user_id",
        "service_actor",
        "created_at",
    }
    # The buyer-only order route stays buyer-only; inspection grants nothing there.
    assert client.get(API + f"/orders/{order_id}", headers=headers).status_code == 404
    missing = get(client, headers, f"/orders/{uuid4()}")
    assert missing.status_code == 404 and code(missing) == "order_not_found"
    with factory() as db:  # reading writes nothing
        assert db.scalar(select(func.count(AuditLog.id))) == audits


def test_activation_search(client, setup, admin):
    headers = admin[2]
    f = paid_event(client, setup)
    page = ok(get(client, headers, "/activations", event_id=f["event"]["id"]))
    assert page["total"] == 1
    row = page["items"][0]
    assert row["status"] == "active" and row["organization_id"] == f["org"]["id"]
    assert row["paid_attempt_id"] and row["activation_fee_minor"] > 0
    assert ok(get(client, headers, "/activations", status="suspended"))["total"] == 0
    assert ok(get(client, headers, "/activations", organization_id=str(uuid4())))["total"] == 0
    assert get(client, headers, "/activations", status="bogus").status_code == 422


def test_campaign_activity_search_and_detail(client, setup, account, admin):
    headers = admin[2]
    f, made, order = redeemed(client, setup, account)
    create_campaign(client, f, name="Other sale", code="other5")
    page = ok(get(client, headers, "/campaigns", event_id=f["event"]["id"]))
    assert page["total"] == 2
    found = ok(get(client, headers, "/campaigns", q="spring"))
    assert [row["id"] for row in found["items"]] == [made["id"]]
    row = found["items"][0]
    assert row["redemptions"] == 1 and row["organization_id"] == f["org"]["id"]
    assert ok(get(client, headers, "/campaigns", enabled="false"))["total"] == 0
    detail = ok(get(client, headers, f"/campaigns/{made['id']}"))
    assert detail["campaign"]["id"] == made["id"] and detail["code"] == made["code"]
    assert detail["report"]["redemptions"] == 1
    assert [r["order_id"] for r in detail["redemptions"]] == [order["id"]]
    assert "link_url" not in str(detail) and "link_token" not in str(detail)
    missing = get(client, headers, f"/campaigns/{uuid4()}")
    assert missing.status_code == 404 and code(missing) == "campaign_not_found"


def test_offline_conflict_search_and_detail(client, setup, account, admin, factory, settings):
    headers = admin[2]
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    assert (
        scan(
            client, f, f["headers"], ticket["qr_payload"], entry_confirmation=proof["token"]
        ).status_code
        == 200
    )
    out = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof)]))[0]
    assert out["status"] == "conflict"
    page = ok(get(client, headers, "/sync-conflicts", event_id=f["event"]["id"]))
    assert page["total"] == 1
    row = page["items"][0]
    assert row["id"] == out["conflict_id"] and row["status"] == "open"
    assert row["organization_id"] == f["org"]["id"] and row["ticket_id"] == ticket["id"]
    assert ok(get(client, headers, "/sync-conflicts", ticket_id=ticket["id"]))["total"] == 1
    assert ok(get(client, headers, "/sync-conflicts", status="resolved"))["total"] == 0
    detail = ok(get(client, headers, f"/sync-conflicts/{out['conflict_id']}"))
    assert detail["id"] == out["conflict_id"] and detail["existing_check_in"]["id"]
    assert detail["operation"]["status"] == "conflict"
    # Inspection is read-only: the organizer resolve route is still capability-gated.
    r = client.post(
        API + f"/sync-conflicts/{out['conflict_id']}/resolve",
        headers=headers,
        json={"note": "Checked"},
    )
    assert r.status_code == 404
    missing = get(client, headers, f"/sync-conflicts/{uuid4()}")
    assert missing.status_code == 404 and code(missing) == "sync_conflict_not_found"
