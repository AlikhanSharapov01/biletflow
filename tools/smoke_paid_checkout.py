"""Live smoke test of simulated paid sales against the running Docker stack.

Run from backend/:  uv run python ../tools/smoke_paid_checkout.py

organizer activates paid sales (simulated KZT 5,000 fee) -> buyer holds a paid ticket ->
quote and pending order -> first payment fails, retry succeeds -> ticket issued and admitted
by the scanner -> the provider later reports the failed attempt as captured -> the worker
dispatches the compensation refund -> refund confirmed. Nothing here moves real money.
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
            text = c.get(f"{MAIL}/message/{m['ID']}").json()["Text"]
            hit = re.search(marker + r"#token=([^\s]+)", text)
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
    assert (
        c.post(
            f"{API}/auth/verify-email",
            json={"token": mail_token(email, "verify-email")},
        ).status_code
        == 200
    )
    r = c.post(
        f"{API}/auth/login",
        json={"email": email, "password": PASSWORD, "client_kind": "scanner"},
    )
    assert r.status_code == 200, r.text
    return email, {"Authorization": "Bearer " + r.json()["access_token"]}


def step(label, response, expect=200):
    ok = response.status_code == expect
    print(f"[{'OK ' if ok else 'BAD'}] {label}: {response.status_code}")
    if not ok:
        print("      ", response.text[:300])
        raise SystemExit(1)
    return response.json()


def until(label, check, seconds=20):
    for _ in range(seconds * 2):
        value = check()
        if value:
            print(f"[OK ] {label}")
            return value
        time.sleep(0.5)
    raise SystemExit(f"[BAD] {label}: timed out")


t = datetime.now(UTC)
iso = lambda d: d.isoformat()
_, owner = account("owner")
org = step(
    "create organization",
    c.post(
        f"{API}/organizations",
        headers=owner,
        json={"name": "Paid Demo", "contact_email": "org@example.com"},
    ),
    201,
)
event = step(
    "create event",
    c.post(
        f"{API}/organizations/{org['id']}/events",
        headers=owner,
        json={
            "category_id": c.get(f"{API}/categories").json()[0]["id"],
            "venue_id": c.get(f"{API}/venues").json()[0]["id"],
            "title": "Paid Demo Night",
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
window = {
    "sales_open_at": iso(t - timedelta(hours=1)),
    "sales_close_at": iso(t + timedelta(hours=1)),
}
paid = step(
    "add paid ticket type (KZT 4,000)",
    c.post(
        f"{API}/events/{event['id']}/ticket-types",
        headers=owner,
        json={
            "name": "Standard",
            "kind": "paid",
            "price_minor": 400000,
            "quantity_limit": 50,
            "per_order_limit": 4,
            **window,
        },
    ),
    201,
)
step("publish", c.post(f"{API}/events/{event['id']}/publish", headers=owner))

for part in ("payout-profile", "identity-verification"):
    step(
        f"simulated {part}",
        c.post(f"{API}/organizations/{org['id']}/paid-sales/{part}", headers=owner),
    )
checklist = c.get(f"{API}/events/{event['id']}/paid-sales", headers=owner).json()
step(
    "accept terms",
    c.post(
        f"{API}/events/{event['id']}/paid-sales/terms",
        headers=owner,
        json={"terms_version": checklist["terms"]["version"]},
    ),
)
fee = step(
    "start activation",
    c.post(f"{API}/events/{event['id']}/paid-sales/activation", headers=owner),
)
until(
    "worker initialized the fee payment",
    lambda: (
        c.get(f"{API}/events/{event['id']}/paid-sales", headers=owner).json()[
            "payment"
        ]["status"]
        == "pending"
    ),
)
step(
    "simulated fee payment succeeds",
    c.post(
        f"{API}/simulator/payments/{fee['payment']['id']}/events",
        headers=owner,
        json={"outcome": "succeeded"},
    ),
)
assert (
    c.get(f"{API}/events/{event['id']}/paid-sales", headers=owner).json()["status"]
    == "active"
)
print("      paid sales active")

buyer_email, buyer = account("buyer")
hold = step(
    "hold 1 paid ticket",
    c.post(
        f"{API}/events/{event['id']}/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": paid["id"], "quantity": 1}]},
    ),
    201,
)
order = step(
    "checkout (quote)",
    c.post(
        f"{API}/holds/{hold['id']}/checkout",
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
)
print(
    f"      status={order['status']} payable={order['payable_minor']} fee={order['processing_fee_minor']}"
)
first = order["payment"]["id"]
step(
    "first payment fails",
    c.post(
        f"{API}/simulator/payments/{first}/events",
        headers=buyer,
        json={"outcome": "failed"},
    ),
)
retry = step(
    "retry payment",
    c.post(f"{API}/orders/{order['id']}/payment-attempts", headers=buyer),
)
step(
    "second payment succeeds",
    c.post(
        f"{API}/simulator/payments/{retry['payment']['id']}/events",
        headers=buyer,
        json={"outcome": "succeeded"},
    ),
)
done = step("order", c.get(f"{API}/orders/{order['id']}", headers=buyer))
assert done["status"] == "confirmed" and done["items"][0]["ticket"]["qr_payload"]
print("      confirmed, ticket issued")
scan = step(
    "owner scans the paid ticket",
    c.post(
        f"{API}/scanner/events/{event['id']}/check-ins",
        headers=owner,
        json={"qr_payload": done["items"][0]["ticket"]["qr_payload"]},
    ),
)
print(f"      {scan['result']}: {scan['attendee_name']}")

step(
    "provider later reports the failed attempt as captured",
    c.post(
        f"{API}/simulator/payments/{first}/events",
        headers=buyer,
        json={"outcome": "succeeded"},
    ),
)
refund = until(
    "worker dispatched the compensation refund",
    lambda: next(
        iter(
            r
            for r in c.get(f"{API}/orders/{order['id']}", headers=buyer).json()[
                "refunds"
            ]
            if r["latest_attempt_id"]
        ),
        None,
    ),
)
print(f"      refund reason={refund['reason']} amount={refund['amount_minor']}")
result = step(
    "simulated refund succeeds",
    c.post(
        f"{API}/simulator/refunds/{refund['latest_attempt_id']}/events",
        headers=buyer,
        json={"outcome": "succeeded"},
    ),
)
assert result["refund"]["status"] == "succeeded"
final = c.get(f"{API}/orders/{order['id']}", headers=buyer).json()
assert (
    final["status"] == "confirmed"
    and final["items"][0]["ticket"]["status"] == "checked_in"
)
print("      legitimate ticket untouched by the compensation refund")
print("SMOKE PASSED")
