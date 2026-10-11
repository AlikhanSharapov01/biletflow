"""Live smoke test of free ticket issuance and online admission against the Docker stack.

Run from backend/:  uv run python ../tools/smoke_admission.py

auth -> organizer event -> free ticket with QR -> assigned scanner -> admit,
then duplicate, unassigned and forged scans must be rejected. Emails are read
from Mailpit, exactly as a real user would receive them.
"""

import re
import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx

API = "http://127.0.0.1:8000/api/v1"
MAIL = "http://127.0.0.1:8025/api/v1"
PASSWORD = "correct horse battery staple"
run = uuid.uuid4().hex[:8]
c = httpx.Client(timeout=20)


def mail_token(to, marker):
    for _ in range(30):
        msgs = c.get(f"{MAIL}/search", params={"query": f"to:{to}"}).json()["messages"]
        for m in msgs:
            body = c.get(f"{MAIL}/message/{m['ID']}").json()["Text"]
            hit = re.search(marker + r"#token=([^\s]+)", body)
            if hit:
                return hit.group(1)
        time.sleep(1)
    raise SystemExit(f"no email for {to}")


def account(name):
    email = f"{name}-{run}@example.com"
    r = c.post(
        f"{API}/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": name},
    )
    assert r.status_code == 202, r.text
    token = mail_token(email, "verify-email")
    assert c.post(f"{API}/auth/verify-email", json={"token": token}).status_code == 200
    r = c.post(
        f"{API}/auth/login",
        json={"email": email, "password": PASSWORD, "client_kind": "scanner"},
    )
    assert r.status_code == 200, r.text
    return email, {"Authorization": "Bearer " + r.json()["access_token"]}


def step(label, response, expect):
    ok = response.status_code == expect
    detail = (
        response.json()
        if response.headers.get("content-type", "").startswith("application/json")
        else response.text
    )
    print(
        f"[{'OK ' if ok else 'BAD'}] {label}: {response.status_code} {detail if not ok or expect >= 400 else ''}"
    )
    if not ok:
        raise SystemExit(1)
    return response.json()


t = datetime.now(UTC)
iso = lambda d: d.isoformat()
_, owner = account("owner")
org = step(
    "create organization",
    c.post(
        f"{API}/organizations",
        headers=owner,
        json={"name": "Demo Org", "contact_email": "org@example.com"},
    ),
    201,
)
cats = c.get(f"{API}/categories").json()
venues = c.get(f"{API}/venues").json()
event = step(
    "create event",
    c.post(
        f"{API}/organizations/{org['id']}/events",
        headers=owner,
        json={
            "category_id": cats[0]["id"],
            "venue_id": venues[0]["id"],
            "title": "Scanner Demo Night",
            "capacity": 50,
            "starts_at": iso(t + timedelta(hours=1)),
            "ends_at": iso(t + timedelta(hours=4)),
            "registration_opens_at": iso(t - timedelta(hours=1)),
            "registration_closes_at": iso(t + timedelta(hours=1)),
            "admission_opens_at": iso(t - timedelta(minutes=10)),
            "admission_closes_at": iso(t + timedelta(hours=3)),
            "refund_cutoff_at": iso(t + timedelta(minutes=30)),
        },
    ),
    201,
)
ticket_type = step(
    "add free ticket type",
    c.post(
        f"{API}/events/{event['id']}/ticket-types",
        headers=owner,
        json={
            "name": "General admission",
            "kind": "free",
            "price_minor": 0,
            "quantity_limit": 50,
            "per_order_limit": 4,
            "sales_open_at": iso(t - timedelta(hours=1)),
            "sales_close_at": iso(t + timedelta(hours=1)),
        },
    ),
    201,
)
step("publish event", c.post(f"{API}/events/{event['id']}/publish", headers=owner), 200)

buyer_email, buyer = account("buyer")
hold = step(
    "hold 1 ticket",
    c.post(
        f"{API}/events/{event['id']}/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": ticket_type["id"], "quantity": 1}]},
    ),
    201,
)
order = step(
    "confirm free order",
    c.post(
        f"{API}/holds/{hold['id']}/confirm",
        headers=buyer,
        json={
            "recipients": [
                {
                    "allocation_id": hold["allocations"][0]["id"],
                    "name": "Aru Buyer",
                    "email": buyer_email,
                }
            ]
        },
    ),
    200,
)
ticket = order["items"][0]["ticket"]
payload = ticket["qr_payload"]
print(
    f"      payload_total={order['payable_minor']} ticket={ticket['id']} qr={payload[:40]}..."
)
assert payload.startswith("biletflow:ticket:")

scanner_email, scanner = account("scanner")
inv = step(
    "invite scanner",
    c.post(
        f"{API}/organizations/{org['id']}/invitations",
        headers=owner,
        json={"email": scanner_email},
    ),
    201,
)
token = mail_token(scanner_email, "staff-invitations/accept")
member = step(
    "scanner accepts invite",
    c.post(f"{API}/staff-invitations/accept", headers=scanner, json={"token": token}),
    200,
)
step(
    "assign scan permission",
    c.put(
        f"{API}/events/{event['id']}/staff",
        headers=owner,
        json={"member_id": member["id"], "capabilities": ["scan"]},
    ),
    200,
)

events = step(
    "scanner lists assigned events",
    c.get(f"{API}/scanner/events", headers=scanner),
    200,
)
assert [e["id"] for e in events] == [event["id"]], events
print(
    f"      assigned: {events[0]['title']} @ {events[0]['venue']['name']} ({events[0]['time_status']})"
)
scan = lambda h, p, **extra: c.post(
    f"{API}/scanner/events/{event['id']}/check-ins",
    headers=h,
    json={"qr_payload": p, **extra},
)
step("scan without attendee confirmation -> rejected", scan(scanner, payload), 409)
proof = step(
    "attendee requests entry confirmation",
    c.post(f"{API}/tickets/{ticket['id']}/entry-confirmations", headers=buyer),
    201,
)
print(f"      code for printed tickets: {proof['code']} (expires in {proof['expires_in_seconds']}s)")
admitted = step(
    "scan ticket + confirmation -> admitted",
    scan(scanner, payload, entry_confirmation=proof["token"]),
    200,
)
print(
    f"      {admitted['result']}: {admitted['attendee_name']}, {admitted['ticket_type_name']}"
)
step("scan again -> rejected", scan(scanner, payload, entry_confirmation=proof["token"]), 409)
_, stranger = account("stranger")
step("unassigned account -> rejected", scan(stranger, payload), 404)
step("forged QR -> rejected", scan(scanner, payload[:-4] + "abcd"), 404)
step(
    "campaign QR -> rejected",
    scan(scanner, "https://biletflow.kz/e/x?promo=SPRING"),
    422,
)
counts = step(
    "counts", c.get(f"{API}/scanner/events/{event['id']}/counts", headers=scanner), 200
)
print(f"      registered={counts['registered']} admitted={counts['admitted']}")
print("SMOKE PASSED")
