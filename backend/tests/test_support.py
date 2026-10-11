import json
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError
from starlette.websockets import WebSocketDisconnect

from app.admin_models import PlatformAdmin
from app.catalog_models import Organization
from app.models import AuditLog, OutboxJob
from app.support_models import CaseChange, SupportCase, SupportMessage
from app.worker import deliver_once
from tests.test_admission import free_ticket, published, staff

API = "/api/v1"
SUPPORT = API + "/support"


def me(client, headers):
    return client.get(API + "/me", headers=headers).json()["id"]


def make_admin(factory, client, headers):
    with factory.begin() as db:
        db.add(PlatformAdmin(user_id=UUID(me(client, headers))))


def open_case(client, headers, f, **extra):
    body = {
        "kind": "attendee",
        "category": "delivery",
        "subject": "Ticket email missing",
        "body": "I did not get my ticket",
        "client_message_id": str(uuid4()),
        "event_id": f["event"]["id"],
        **extra,
    }
    return client.post(SUPPORT + "/cases", headers=headers, json=body)


def say(client, headers, case_id, text="hello", cmid=None):
    return client.post(
        SUPPORT + f"/cases/{case_id}/messages",
        headers=headers,
        json={"client_message_id": cmid or str(uuid4()), "body": text},
    )


@pytest.fixture
def world(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    ticket, buyer = free_ticket(client, account, f)
    orders = client.get(API + "/orders", headers=buyer).json()
    other = account()[2]
    support = staff(client, settings, account, f, ["support"])
    no_support = staff(client, settings, account, f, ["attendees"])
    return {
        "f": f,
        "owner": f["headers"],
        "buyer": buyer,
        "other": other,
        "support": support,
        "no_support": no_support,
        "ticket": ticket,
        "order_id": orders[0]["id"],
    }


def test_attendee_opens_case_with_validated_context(client, world):
    w = world
    r = open_case(client, w["buyer"], w["f"], order_id=w["order_id"], ticket_id=w["ticket"]["id"])
    assert r.status_code == 201, r.text
    case = r.json()["case"]
    assert case["status"] == "open" and case["viewer_roles"] == ["requester"]
    assert case["order_id"] == w["order_id"] and case["event_id"] == w["f"]["event"]["id"]
    assert case["organization_id"] == w["f"]["org"]["id"] and case["last_seq"] == 1
    assert r.json()["message"]["seq"] == 1 and r.json()["message"]["author_role"] == "requester"

    # Order or ticket belonging to somebody else is never accepted as context.
    r = open_case(client, w["other"], w["f"], order_id=w["order_id"])
    assert r.status_code == 404 and r.json()["detail"]["code"] == "order_not_found"
    r = open_case(client, w["other"], w["f"], ticket_id=w["ticket"]["id"])
    assert r.status_code == 404 and r.json()["detail"]["code"] == "ticket_not_found"
    # Order-only case derives its event and organization.
    r = open_case(client, w["buyer"], w["f"], event_id=None, order_id=w["order_id"])
    assert r.status_code == 201, r.text
    assert r.json()["case"]["event_id"] == w["f"]["event"]["id"]
    # Event-only case on a visible event is allowed for any signed-in account.
    assert open_case(client, w["other"], w["f"]).status_code == 201
    # Unknown / inconsistent context is rejected.
    mismatch = open_case(client, w["buyer"], w["f"], order_id=w["order_id"], event_id=str(uuid4()))
    assert mismatch.status_code == 422 and mismatch.json()["detail"]["code"] == "context_mismatch"
    assert open_case(client, w["buyer"], w["f"], event_id=str(uuid4())).status_code == 404
    assert open_case(client, w["other"], w["f"], event_id=str(uuid4())).status_code == 404
    bad = client.post(
        SUPPORT + "/cases",
        headers=w["buyer"],
        json={
            "kind": "attendee",
            "category": "nope",
            "subject": "x",
            "body": "x",
            "client_message_id": str(uuid4()),
            "event_id": w["f"]["event"]["id"],
        },
    )
    assert bad.status_code == 422
    unauth = client.post(SUPPORT + "/cases", json={})
    assert unauth.status_code == 401


def second_order(client, w):
    held = client.post(
        API + f"/events/{w['f']['event']['id']}/holds",
        headers=w["buyer"],
        json={"items": [{"ticket_type_id": w["f"]["ticket"]["id"], "quantity": 1}]},
    )
    email = client.get(API + "/me", headers=w["buyer"]).json()["email"]
    order = client.post(
        API + f"/holds/{held.json()['id']}/confirm",
        headers=w["buyer"],
        json={
            "recipients": [
                {
                    "allocation_id": held.json()["allocations"][0]["id"],
                    "name": "Second",
                    "email": email,
                }
            ]
        },
    )
    assert order.status_code == 200, order.text
    return order.json()["id"], order.json()["items"][0]["ticket"]["id"]


def test_ticket_must_belong_to_order_and_account(client, world, account):
    w = world
    other_order, other_ticket = second_order(client, w)
    # Both belong to the buyer, but the ticket is not an item of the other order.
    r = open_case(client, w["buyer"], w["f"], order_id=w["order_id"], ticket_id=other_ticket)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "context_mismatch"
    ok = open_case(client, w["buyer"], w["f"], order_id=other_order, ticket_id=other_ticket)
    assert ok.status_code == 201, ok.text
    # Another buyer's ticket is not accepted even together with the caller's own order.
    ticket2, buyer2 = free_ticket(client, account, w["f"])
    r = open_case(client, w["buyer"], w["f"], order_id=w["order_id"], ticket_id=ticket2["id"])
    assert r.status_code == 404
    # A ticket recipient who did not buy it may reference the ticket but not the order.
    email, _, recipient = account()
    t3, buyer3 = free_ticket(client, account, w["f"], recipient=email)
    client.post(API + "/tickets/claim", headers=recipient)
    order3 = client.get(API + "/orders", headers=buyer3).json()[0]["id"]
    assert open_case(client, recipient, w["f"], ticket_id=t3["id"]).status_code == 201
    assert open_case(client, recipient, w["f"], order_id=order3).status_code == 404
    # The buyer of an order whose ticket went to someone else cannot link that ticket.
    assert open_case(client, buyer3, w["f"], ticket_id=t3["id"]).status_code == 404


def test_organizer_platform_case_and_admin_access(client, world, factory, account):
    w = world
    org = w["f"]["org"]["id"]
    body = {
        "kind": "organizer_platform",
        "category": "technical",
        "subject": "Activation question",
        "body": "Why is my account pending?",
        "client_message_id": str(uuid4()),
        "organization_id": org,
    }
    r = client.post(SUPPORT + "/cases", headers=w["owner"], json=body)
    assert r.status_code == 201, r.text
    case_id = r.json()["case"]["id"]
    # Outsiders and staff without manage_profile cannot open org cases; links are limited.
    outsider = client.post(
        SUPPORT + "/cases", headers=w["other"], json={**body, "client_message_id": str(uuid4())}
    )
    assert outsider.status_code == 404
    staffer = client.post(
        SUPPORT + "/cases", headers=w["support"], json={**body, "client_message_id": str(uuid4())}
    )
    assert staffer.status_code == 403
    linked = client.post(
        SUPPORT + "/cases",
        headers=w["owner"],
        json={**body, "client_message_id": str(uuid4()), "order_id": w["order_id"]},
    )
    assert linked.status_code == 422
    foreign = client.post(
        SUPPORT + "/cases",
        headers=w["owner"],
        json={**body, "client_message_id": str(uuid4()), "event_id": str(uuid4())},
    )
    assert foreign.status_code == 404
    # Organizer support staff never see platform cases.
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["support"]).status_code == 404
    admin = account()[2]
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=admin).status_code == 404
    make_admin(factory, client, admin)
    seen = client.get(SUPPORT + f"/cases/{case_id}", headers=admin)
    assert seen.status_code == 200 and seen.json()["viewer_roles"] == ["platform"]
    queue = client.get(SUPPORT + "/cases?view=queue", headers=admin).json()
    assert [c["id"] for c in queue["items"]] == [case_id] and queue["total"] == 1
    # Admin works the case: reply, assign to self, resolve; the requester then reopens it.
    assert say(client, admin, case_id, "We are checking").status_code == 201
    mine = me(client, admin)
    r = client.post(
        SUPPORT + f"/cases/{case_id}/assignment", headers=admin, json={"assignee_user_id": mine}
    )
    assert r.status_code == 200 and r.json()["after_value"] == mine
    # Org case cannot be escalated further.
    r = client.post(
        SUPPORT + f"/cases/{case_id}/escalation", headers=admin, json={"reason": "again"}
    )
    assert r.status_code == 403
    r = client.post(
        SUPPORT + f"/cases/{case_id}/status", headers=admin, json={"status": "resolved"}
    )
    assert r.status_code == 200
    r = say(client, w["owner"], case_id, "Still broken")
    assert r.status_code == 201
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["owner"]).json()["status"] == "open"


def test_staff_visibility_is_relational(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    for headers in (w["owner"], w["support"]):
        r = client.get(SUPPORT + f"/cases/{case_id}", headers=headers)
        assert r.status_code == 200, r.text
        assert "support" in r.json()["viewer_roles"]
        queue = client.get(SUPPORT + "/cases?view=queue", headers=headers).json()
        assert [c["id"] for c in queue["items"]] == [case_id]
    for headers in (w["other"], w["no_support"]):
        assert client.get(SUPPORT + f"/cases/{case_id}", headers=headers).status_code == 404
        assert say(client, headers, case_id).status_code == 404
        assert client.get(SUPPORT + f"/cases/{case_id}/updates", headers=headers).status_code == 404
        assert client.get(SUPPORT + "/cases?view=queue", headers=headers).json()["total"] == 0
    assert client.get(SUPPORT + f"/cases/{uuid4()}", headers=w["buyer"]).status_code == 404
    # Requester lists own cases only; staff "mine" excludes the customer's cases.
    assert client.get(SUPPORT + "/cases", headers=w["buyer"]).json()["total"] == 1
    assert client.get(SUPPORT + "/cases", headers=w["support"]).json()["total"] == 0
    # Requesters cannot work the case.
    for path, body in (
        ("status", {"status": "resolved"}),
        ("assignment", {"assignee_user_id": None}),
        ("escalation", {"reason": "x"}),
    ):
        r = client.post(SUPPORT + f"/cases/{case_id}/{path}", headers=w["buyer"], json=body)
        assert r.status_code == 403, path
    # Revoking the capability removes access at once.
    with factory.begin() as db:
        from app.catalog_models import StaffPermission

        db.execute(
            update(StaffPermission)
            .where(StaffPermission.capability == "support")
            .values(revoked_at=func.now())
        )
    support_after = client.get(SUPPORT + f"/cases/{case_id}", headers=w["support"])
    assert support_after.status_code == 404
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["owner"]).status_code == 200


def test_status_flow_reopen_history_and_audit(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    path = SUPPORT + f"/cases/{case_id}/status"
    r = client.post(path, headers=w["support"], json={"status": "in_progress", "reason": "on it"})
    assert r.status_code == 200 and r.json()["before_value"] == "open"
    assert (
        client.post(path, headers=w["support"], json={"status": "in_progress"}).status_code == 409
    )
    r = client.post(path, headers=w["support"], json={"status": "waiting_for_customer"})
    assert r.status_code == 200
    # The customer's reply moves a waiting case back to in_progress.
    assert say(client, w["buyer"], case_id, "here it is").status_code == 201
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["buyer"]).json()["status"] == (
        "in_progress"
    )
    r = client.post(path, headers=w["support"], json={"status": "resolved"})
    assert r.status_code == 200
    case = client.get(SUPPORT + f"/cases/{case_id}", headers=w["buyer"]).json()
    assert case["status"] == "resolved" and case["resolved_at"]
    # Staff cannot post into, change or assign a resolved case; only the requester reopens it.
    assert say(client, w["support"], case_id).json()["detail"]["code"] == "case_resolved"
    assert client.post(path, headers=w["support"], json={"status": "open"}).status_code == 409
    assert say(client, w["buyer"], case_id, "not fixed").status_code == 201
    case = client.get(SUPPORT + f"/cases/{case_id}", headers=w["buyer"]).json()
    assert case["status"] == "open" and case["resolved_at"] is None
    updates = client.get(SUPPORT + f"/cases/{case_id}/updates", headers=w["buyer"]).json()
    seqs = [i["seq"] for i in updates["items"]]
    assert seqs == sorted(seqs) == list(range(1, len(seqs) + 1)) and not updates["has_more"]
    kinds = [(i["type"], i.get("after_value")) for i in updates["items"]]
    assert ("change", "resolved") in kinds and ("change", "open") in kinds
    with factory() as db:
        actions = set(
            db.scalars(select(AuditLog.action).where(AuditLog.entity_id == UUID(case_id)))
        )
        assert {"support.case_opened", "support.message_sent", "support.status_changed"} <= actions
        assert db.scalar(select(func.count()).select_from(CaseChange)) == 5


def test_assignment_validates_assignee_relationship(client, world, factory, account):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    path = SUPPORT + f"/cases/{case_id}/assignment"
    staff_id = me(client, w["support"])
    for bad in (me(client, w["other"]), me(client, w["no_support"]), me(client, w["buyer"])):
        r = client.post(path, headers=w["owner"], json={"assignee_user_id": bad})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "assignee_not_eligible"
    r = client.post(path, headers=w["owner"], json={"assignee_user_id": staff_id})
    assert r.status_code == 200
    assert (
        client.post(path, headers=w["owner"], json={"assignee_user_id": staff_id}).status_code
        == 409
    )
    assert (
        client.get(SUPPORT + f"/cases/{case_id}", headers=w["buyer"]).json()["assigned_to"]["id"]
        == staff_id
    )
    # Assignment alone is not access: after revocation the assignee sees nothing.
    with factory.begin() as db:
        from app.catalog_models import StaffPermission

        db.execute(update(StaffPermission).values(revoked_at=func.now()))
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["support"]).status_code == 404
    r = client.post(path, headers=w["owner"], json={"assignee_user_id": None})
    assert r.status_code == 200


def test_escalation_grants_platform_access_and_is_audited(client, world, factory, account):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    admin = account()[2]
    make_admin(factory, client, admin)
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=admin).status_code == 404
    assert client.get(SUPPORT + "/cases?view=queue", headers=admin).json()["total"] == 0
    path = SUPPORT + f"/cases/{case_id}/escalation"
    assert client.post(path, headers=admin, json={"reason": "x"}).status_code == 404
    client.post(
        SUPPORT + f"/cases/{case_id}/assignment",
        headers=w["owner"],
        json={"assignee_user_id": me(client, w["support"])},
    )
    r = client.post(path, headers=w["support"], json={"reason": "refund dispute"})
    assert r.status_code == 200 and r.json()["change_kind"] == "escalation"
    assert client.post(path, headers=w["support"], json={"reason": "again"}).status_code == 409
    case = client.get(SUPPORT + f"/cases/{case_id}", headers=admin).json()
    assert case["escalated_at"] and case["assigned_to"] is None
    assert case["viewer_roles"] == ["platform"]
    assert client.get(SUPPORT + "/cases?view=queue", headers=admin).json()["total"] == 1
    assert say(client, admin, case_id, "Platform here").status_code == 201
    # Organizer staff keep access; a revoked admin loses it at once.
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["support"]).status_code == 200
    with factory.begin() as db:
        db.execute(update(PlatformAdmin).values(revoked_at=func.now()))
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=admin).status_code == 404
    with factory() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.action == "support.escalated")
            )
            == 1
        )
    # Requesters cannot escalate themselves.
    other_case = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    assert (
        client.post(
            SUPPORT + f"/cases/{other_case}/escalation", headers=w["buyer"], json={"reason": "x"}
        ).status_code
        == 403
    )


def test_message_idempotency_and_payload_conflict(client, world):
    w = world
    created = open_case(client, w["buyer"], w["f"])
    case_id = created.json()["case"]["id"]
    cmid = str(uuid4())
    first = say(client, w["buyer"], case_id, "one", cmid)
    assert first.status_code == 201
    again = say(client, w["buyer"], case_id, "one", cmid)
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
    assert again.json()["replayed"] is True and again.json()["seq"] == first.json()["seq"]
    conflict = say(client, w["buyer"], case_id, "different", cmid)
    assert conflict.status_code == 409 and conflict.json()["detail"]["code"] == (
        "client_message_conflict"
    )
    # The same id from another author is a separate message.
    assert say(client, w["support"], case_id, "reply", cmid).status_code == 201
    page = client.get(SUPPORT + f"/cases/{case_id}/messages", headers=w["buyer"]).json()
    assert [m["body"] for m in page["items"]] == [
        "I did not get my ticket",
        "one",
        "reply",
    ]
    assert [m["author_role"] for m in page["items"]] == ["requester", "requester", "support"]
    # Creation retry returns the same case; a different payload under the key fails.
    payload = json.loads(created.request.content)
    retry = client.post(SUPPORT + "/cases", headers=w["buyer"], json=payload)
    assert retry.status_code == 200 and retry.json()["case"]["id"] == case_id
    assert retry.json()["message"]["replayed"] is True
    changed = client.post(
        SUPPORT + "/cases", headers=w["buyer"], json={**payload, "category": "payment"}
    )
    assert changed.status_code == 409
    for text in ("", "   ", "x" * 5001):
        assert say(client, w["buyer"], case_id, text).status_code == 422


def test_concurrent_retries_create_one_message_and_one_case(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    cmid = str(uuid4())
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda _: say(client, w["buyer"], case_id, "race", cmid), range(8)))
    assert sorted({r.status_code for r in results}) == [200, 201]
    assert sum(r.status_code == 201 for r in results) == 1
    payload = {
        "kind": "attendee",
        "category": "payment",
        "subject": "Race",
        "body": "body",
        "client_message_id": str(uuid4()),
        "event_id": w["f"]["event"]["id"],
    }
    with ThreadPoolExecutor(8) as pool:
        created = list(
            pool.map(
                lambda _: client.post(SUPPORT + "/cases", headers=w["buyer"], json=payload),
                range(8),
            )
        )
    assert all(r.status_code in (200, 201) for r in created)
    assert len({r.json()["case"]["id"] for r in created}) == 1
    # Concurrent distinct messages receive distinct, gap-free sequence numbers.
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda i: say(client, w["support"], case_id, f"m{i}"), range(8)))
    with factory() as db:
        seqs = sorted(
            db.scalars(select(SupportMessage.seq).where(SupportMessage.case_id == UUID(case_id)))
        )
        assert seqs == list(range(1, len(seqs) + 1))
        assert db.scalar(select(SupportCase.last_seq).where(SupportCase.id == UUID(case_id))) == (
            len(seqs)
        )


def test_polling_cursor_pagination_and_resume(client, world):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    for i in range(5):
        say(client, w["support"], case_id, f"s{i}")
    url = SUPPORT + f"/cases/{case_id}/updates"
    first = client.get(url + "?limit=4", headers=w["buyer"]).json()
    assert [i["seq"] for i in first["items"]] == [1, 2, 3, 4]
    assert first["has_more"] and first["next_after"] == 4
    rest = client.get(url + f"?after={first['next_after']}&limit=4", headers=w["buyer"]).json()
    assert [i["seq"] for i in rest["items"]] == [5, 6] and not rest["has_more"]
    empty = client.get(url + "?after=6", headers=w["buyer"]).json()
    assert empty == {"items": [], "next_after": 6, "has_more": False}
    assert client.get(url + "?after=-1", headers=w["buyer"]).status_code == 422
    assert client.get(url + "?limit=101", headers=w["buyer"]).status_code == 422
    assert client.get(url, headers=w["other"]).status_code == 404
    listing = client.get(SUPPORT + "/cases?limit=1&status=resolved", headers=w["buyer"]).json()
    assert listing["total"] == 0
    assert client.get(SUPPORT + "/cases?status=bogus", headers=w["buyer"]).status_code == 422


def test_history_is_append_only(factory, client, world):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    client.post(
        SUPPORT + f"/cases/{case_id}/status", headers=w["support"], json={"status": "in_progress"}
    )
    with factory() as db:
        with pytest.raises(DBAPIError):
            db.execute(update(SupportMessage).values(body="edited"))
        db.rollback()
    with factory() as db:
        with pytest.raises(DBAPIError):
            db.execute(update(CaseChange).values(reason="edited"))
        db.rollback()
    assert case_id


def test_outbox_notifications_and_worker(client, world, factory, settings):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    say(client, w["support"], case_id, "secret text")
    with factory() as db:
        jobs = db.scalars(select(OutboxJob).where(OutboxJob.kind == "support_email")).all()
        owner = UUID(me(client, w["owner"]))
        buyer = UUID(me(client, w["buyer"]))
        recipients = {(j.payload["reason"], UUID(j.payload["recipient_user_id"])) for j in jobs}
        assert ("case_opened", owner) in recipients and ("message", buyer) in recipients
        assert all("secret" not in str(j.payload) for j in jobs)
        assert not any(j.payload["recipient_user_id"] == str(me(client, w["other"])) for j in jobs)
    messages = []
    while deliver_once(factory, settings, messages.append):
        pass
    support = [m for m in messages if "support" in m["Subject"].lower()]
    assert support and all(case_id in m.get_content() for m in support)
    assert all("secret text" not in m.get_content() for m in messages)
    # An unauthorised recipient (access revoked before delivery) is never emailed.
    with factory.begin() as db:
        db.add(
            OutboxJob(
                kind="support_email",
                deduplication_key="support:test:" + case_id,
                payload={
                    "version": 1,
                    "case_id": case_id,
                    "recipient_user_id": me(client, w["other"]),
                    "reason": "message",
                },
            )
        )
    sent = []
    assert deliver_once(factory, settings, sent.append) and sent == []


def token_of(headers):
    return headers["Authorization"].removeprefix("Bearer ")


def recv_until(ws, kind, limit=20):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == kind:
            return frame
    raise AssertionError(f"no {kind} frame")


def test_websocket_requires_authentication(client):
    with client.websocket_connect(SUPPORT + "/ws") as ws:
        ws.send_json({"type": "auth", "token": "garbage"})
        assert ws.receive_json()["code"] == "unauthorized"
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    with client.websocket_connect(SUPPORT + "/ws") as ws:
        ws.send_json({"type": "subscribe", "case_id": str(uuid4())})
        assert ws.receive_json()["code"] == "unauthorized"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(SUPPORT + "/ws", headers={"origin": "http://evil.example"}):
            pass


def test_websocket_delivers_replays_and_enforces_authorization(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    say(client, w["support"], case_id, "before connect")
    with client.websocket_connect(SUPPORT + "/ws") as ws:
        ws.send_json({"type": "auth", "token": token_of(w["buyer"])})
        assert ws.receive_json() == {"type": "ready"}
        # Replay from a cursor: only what follows seq 1 arrives.
        ws.send_json({"type": "subscribe", "case_id": case_id, "after": 1})
        assert recv_until(ws, "subscribed")["after"] == 1
        frame = recv_until(ws, "event")
        assert frame["item"]["seq"] == 2 and frame["item"]["body"] == "before connect"
        # A live message is pushed after it is persisted.
        r = say(client, w["support"], case_id, "live one")
        assert r.status_code == 201
        frame = recv_until(ws, "event")
        assert frame["item"]["body"] == "live one" and frame["case_id"] == case_id
        # Status changes are delivered as history items.
        client.post(
            SUPPORT + f"/cases/{case_id}/status", headers=w["support"], json={"status": "resolved"}
        )
        frame = recv_until(ws, "event")
        assert frame["item"]["type"] == "change" and frame["item"]["after_value"] == "resolved"
        # No duplicates: ping round trip shows nothing else queued for this cursor.
        ws.send_json({"type": "ping"})
        assert recv_until(ws, "pong")

    # Unrelated users, and staff without the capability, cannot subscribe.
    for headers in (w["other"], w["no_support"]):
        with client.websocket_connect(SUPPORT + "/ws") as ws:
            ws.send_json({"type": "auth", "token": token_of(headers)})
            assert ws.receive_json()["type"] == "ready"
            ws.send_json({"type": "subscribe", "case_id": case_id})
            error = ws.receive_json()
            assert error["code"] == "case_not_found"
            ws.send_json({"type": "subscribe", "case_id": "not-a-uuid"})
            assert ws.receive_json()["code"] == "invalid_frame"


def test_websocket_revoked_staff_lose_live_access(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    with client.websocket_connect(SUPPORT + "/ws") as ws:
        ws.send_json({"type": "auth", "token": token_of(w["support"])})
        assert ws.receive_json()["type"] == "ready"
        ws.send_json({"type": "subscribe", "case_id": case_id, "after": 1})
        assert recv_until(ws, "subscribed")
        from app.catalog_models import StaffPermission

        with factory.begin() as db:
            db.execute(update(StaffPermission).values(revoked_at=func.now()))
        say(client, w["buyer"], case_id, "after revoke")
        error = recv_until(ws, "error")
        assert error["code"] == "case_not_found"


def test_commit_survives_broken_live_delivery(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    with client.websocket_connect(SUPPORT + "/ws") as ws:
        ws.send_json({"type": "auth", "token": token_of(w["support"])})
        assert ws.receive_json()["type"] == "ready"
        ws.send_json({"type": "subscribe", "case_id": case_id, "after": 1})
        recv_until(ws, "subscribed")
    # The socket is gone; business operations still succeed and polling recovers everything.
    assert say(client, w["buyer"], case_id, "after disconnect").status_code == 201
    page = client.get(SUPPORT + f"/cases/{case_id}/updates?after=1", headers=w["support"]).json()
    assert [i["body"] for i in page["items"]] == ["after disconnect"]


def test_suspended_organization_removes_staff_access(client, world, factory):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    with factory.begin() as db:
        db.execute(update(Organization).values(status="suspended"))
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["support"]).status_code == 404
    assert client.get(SUPPORT + f"/cases/{case_id}", headers=w["buyer"]).status_code == 200


def test_case_view_exposes_no_contact_data(client, world):
    w = world
    case_id = open_case(client, w["buyer"], w["f"]).json()["case"]["id"]
    body = client.get(SUPPORT + f"/cases/{case_id}", headers=w["support"]).json()
    assert set(body["requester"]) == {"id", "display_name"}


def test_support_reply_and_status_reach_the_in_app_inbox(client, world, factory, settings):
    from app.notification_service import deliver_notifications_once

    case_id = open_case(client, world["buyer"], world["f"]).json()["case"]["id"]
    assert say(client, world["support"], case_id, "we are on it").status_code in (200, 201)
    r = client.post(
        SUPPORT + f"/cases/{case_id}/status",
        headers=world["support"],
        json={"status": "resolved", "reason": "done"},
    )
    assert r.status_code == 200, r.text
    sent = []
    while deliver_notifications_once(factory, settings, sent.append):
        pass
    items = client.get(API + "/notifications", headers=world["buyer"]).json()
    kinds = {n["kind"] for n in items}
    assert {"support_reply", "support_status"} <= kinds
    support_items = [n for n in items if n["kind"].startswith("support_")]
    assert all(n["target"] == {"type": "support_case", "id": case_id} for n in support_items)
    assert sent == []  # in-app only: the support worker emails the link
    # The requester's own actions never notify the requester.
    staff_items = client.get(API + "/notifications", headers=world["support"]).json()
    assert "support_reply" not in {n["kind"] for n in staff_items}
