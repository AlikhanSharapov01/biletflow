from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.admission_models import CheckIn, CheckInReversal
from app.catalog_models import Event
from app.checkout_models import Ticket
from app.checkout_service import qr_payload
from app.models import AuditLog
from app.security import challenge_value, now

API = "/api/v1"


def published(client, setup, factory, open_now=True):
    f = setup()
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text
    if open_now:
        with factory.begin() as db:
            db.execute(
                update(Event)
                .where(Event.id == UUID(f["event"]["id"]))
                .values(
                    admission_opens_at=now() - timedelta(hours=1),
                    admission_closes_at=now() + timedelta(hours=1),
                )
            )
    return f


def staff(client, settings, account, f, capabilities):
    email, _, headers = account()
    r = client.post(
        API + f"/organizations/{f['org']['id']}/invitations",
        headers=f["headers"],
        json={"email": email},
    )
    assert r.status_code == 201, r.text
    token = challenge_value(settings, "staff_invite", r.json()["id"])
    member = client.post(API + "/staff-invitations/accept", headers=headers, json={"token": token})
    assert member.status_code == 200, member.text
    r = client.put(
        API + f"/events/{f['event']['id']}/staff",
        headers=f["headers"],
        json={"member_id": member.json()["id"], "capabilities": capabilities},
    )
    assert r.status_code == 200, r.text
    return headers


def free_ticket(client, account, f, recipient=None):
    email, _, headers = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
    )
    assert held.status_code == 201, held.text
    body = {
        "recipients": [
            {
                "allocation_id": held.json()["allocations"][0]["id"],
                "name": "Aru Attendee",
                "email": recipient or email,
            }
        ]
    }
    order = client.post(API + f"/holds/{held.json()['id']}/confirm", headers=headers, json=body)
    assert order.status_code == 200, order.text
    return order.json()["items"][0]["ticket"], headers


def scan(client, f, headers, payload, **extra):
    return client.post(
        API + f"/scanner/events/{f['event']['id']}/check-ins",
        headers=headers,
        json={"qr_payload": payload, **extra},
    )


def test_issued_ticket_qr_admits_once_and_counts(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    payload = ticket["qr_payload"]
    assert payload.startswith("biletflow:ticket:")

    events = client.get(API + "/scanner/events", headers=scanner)
    assert events.status_code == 200, events.text
    assert [e["id"] for e in events.json()] == [f["event"]["id"]]
    assert events.json()[0]["venue"]["city"] and events.json()[0]["time_status"] == "upcoming"
    assert client.get(API + "/scanner/events", headers=buyer).json() == []
    counts = client.get(API + f"/scanner/events/{f['event']['id']}/counts", headers=scanner)
    assert counts.json() == {"event_id": f["event"]["id"], "registered": 1, "admitted": 0}

    operation = str(uuid4())
    r = scan(client, f, scanner, payload, operation_id=operation)
    assert r.status_code == 200, r.text
    admitted = r.json()
    assert admitted["result"] == "admitted" and admitted["attendee_name"] == "Aru Attendee"
    assert admitted["ticket_type_name"] == "General admission" and admitted["replayed"] is False

    # A retried request with the same operation id returns the original admission.
    again = scan(client, f, scanner, payload, operation_id=operation)
    assert again.status_code == 200 and again.json()["replayed"] is True
    assert again.json()["check_in_id"] == admitted["check_in_id"]

    duplicate = scan(client, f, scanner, payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "already_checked_in"
    assert duplicate.json()["detail"]["checked_in_at"]

    counts = client.get(API + f"/scanner/events/{f['event']['id']}/counts", headers=scanner)
    assert counts.json()["admitted"] == 1
    assert client.get(API + f"/tickets/{ticket['id']}", headers=buyer).json()["status"] == (
        "checked_in"
    )
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
        assert db.scalar(select(AuditLog.id).where(AuditLog.action == "admission.checked_in"))


def test_only_assigned_scanners_admit(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    ticket, buyer = free_ticket(client, account, f)
    payload = ticket["qr_payload"]
    _, _, stranger = account()
    attendee_staff = staff(client, settings, account, f, ["attendees"])

    assert scan(client, f, {}, payload).status_code == 401
    r = scan(client, f, stranger, payload)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "event_not_found"
    r = scan(client, f, attendee_staff, payload)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "permission_denied"
    assert scan(client, f, buyer, payload).status_code == 404
    assert client.get(
        API + f"/scanner/events/{f['event']['id']}", headers=stranger
    ).status_code == (404)
    other = published(client, setup, factory)
    assert (
        client.get(API + "/scanner/events", headers=f["headers"]).json()[0]["id"]
        == (f["event"]["id"])
    )
    r = scan(client, other, other["headers"], payload)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "wrong_event"
    with factory() as db:
        assert db.get(Ticket, UUID(ticket["id"])).status == "valid"


def test_invalid_and_unusable_qr_codes(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    owner = f["headers"]

    r = scan(client, f, owner, "https://biletflow.kz/e/promo?c=SPRING")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "not_a_ticket_qr"
    forged = ticket["qr_payload"][:-4] + "abcd"
    r = scan(client, f, owner, forged)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "ticket_not_found"

    unclaimed, _ = free_ticket(client, account, f, recipient="friend@example.com")
    r = scan(client, f, owner, qr_payload(settings, unclaimed["id"]))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ticket_unclaimed"

    with factory.begin() as db:
        db.get(Ticket, UUID(ticket["id"])).status = "cancelled"
    r = scan(client, f, owner, ticket["qr_payload"])
    assert r.status_code == 409 and r.json()["detail"] == {
        "code": "ticket_not_valid",
        "status": "cancelled",
    }

    closed = published(client, setup, factory, open_now=False)
    late, _ = free_ticket(client, account, closed)
    r = scan(client, closed, closed["headers"], late["qr_payload"])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "admission_not_open"


def test_reversal_requires_permission_and_keeps_history(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, _ = free_ticket(client, account, f)
    first = scan(client, f, scanner, ticket["qr_payload"]).json()
    url = API + f"/scanner/check-ins/{first['check_in_id']}/reverse"

    assert client.post(url, headers=scanner, json={"reason": "Wrong person"}).status_code == 403
    assert client.post(url, headers=f["headers"], json={"reason": "  "}).status_code == 422
    r = client.post(url, headers=f["headers"], json={"reason": "Scanned the wrong ticket"})
    assert r.status_code == 200, r.text
    assert r.json()["ticket_status"] == "valid"
    assert client.post(url, headers=f["headers"], json={"reason": "again"}).json()["detail"][
        "code"
    ] == ("already_reversed")

    second = scan(client, f, scanner, ticket["qr_payload"])
    assert second.status_code == 200 and second.json()["check_in_id"] != first["check_in_id"]
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 2
        assert db.scalar(select(func.count(CheckInReversal.id))) == 1


def test_operation_id_cannot_be_reused_for_another_ticket(client, setup, account, factory):
    f = published(client, setup, factory)
    first, _ = free_ticket(client, account, f)
    second, _ = free_ticket(client, account, f)
    operation = str(uuid4())
    assert scan(
        client, f, f["headers"], first["qr_payload"], operation_id=operation
    ).status_code == (200)
    r = scan(client, f, f["headers"], second["qr_payload"], operation_id=operation)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "operation_conflict"


def test_two_scanners_racing_admit_one(client, setup, account, factory, settings, app):
    f = published(client, setup, factory)
    scanners = [f["headers"], staff(client, settings, account, f, ["scan"])]
    ticket, _ = free_ticket(client, account, f)

    def admit(headers):
        with TestClient(app) as other:
            return scan(other, f, headers, ticket["qr_payload"]).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(admit, scanners)) == [200, 409]
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
