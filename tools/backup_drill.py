"""Backup/restore drill data for the Backup workflow (AC-27). Runbook: docs/operations/backup.md

Run from backend/ against a running development stack (it signs in with the demo accounts),
in the order .github/workflows/backup.yml uses:

    uv run python ../tools/backup_drill.py prepare        # event, images a b c, order/ticket with
                                                         # stored PDF, support attachment, audit
    uv run python ../tools/backup_drill.py delete-image c # BACKUP_TEST_HOOK of an --online backup
    uv run python ../tools/backup_drill.py snapshot       # worker stopped: queue a job, record keys
    uv run python ../tools/backup_drill.py delete-image b # BACKUP_TEST_HOOK of a normal backup,
                                                         # then again after it
    uv run python ../tools/backup_drill.py verify         # after restoring the normal backup

`delete-image` records "deleted" (204) or "unreachable" (API stopped) and fails on anything else.
State is kept in DRILL_STATE (default backups/drill-state.json; it holds short-lived tokens).
`snapshot` and `verify` read PostgreSQL through DRILL_DATABASE_URL (owner role, 127.0.0.1:5433).
"""

import hashlib
import io
import json
import os
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import psycopg
from PIL import Image

BASE = os.environ.get("DRILL_BASE_URL", "http://127.0.0.1:8000")
API = BASE + "/api/v1"
STATE = Path(
    os.environ.get("DRILL_STATE", Path(__file__).parent.parent / "backups/drill-state.json")
)
DEMO_PASSWORD = "BiletFlow-demo-2026"
ACCOUNTS = {"organizer": "demo-organizer@example.com", "attendee": "demo-attendee@example.com"}


class Client(httpx.Client):
    """Waits out the per-minute rate limits, which the demo build may have just used up."""

    def request(self, *args, **kwargs):
        for _ in range(8):
            response = super().request(*args, **kwargs)
            if response.status_code != 429:
                break
            print("      rate limited; retrying in 10 seconds")
            time.sleep(10)
        return response


client = Client(timeout=20)


def load():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, sort_keys=True))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def ok(label, response, expect=200):
    if response.status_code != expect:
        raise SystemExit(f"[BAD] {label}: {response.status_code} {response.text[:300]}")
    print(f"[OK ] {label}")
    return response


def headers(state, who):
    """Bearer header; the token is cached in the state and renewed when older than 5 minutes."""
    tokens = state.setdefault("tokens", {})
    cached = tokens.get(who)
    if not cached or time.time() - cached["at"] > 300:
        response = client.post(
            f"{API}/auth/login",
            json={"email": ACCOUNTS[who], "password": DEMO_PASSWORD, "client_kind": "scanner"},
        )
        ok(f"sign in as {ACCOUNTS[who]}", response)
        cached = tokens[who] = {"token": response.json()["access_token"], "at": time.time()}
        save(state)
    return {"Authorization": "Bearer " + cached["token"]}


def png(color):
    output = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(output, format="PNG")
    return output.getvalue()


def image_content(state, name, who="organizer"):
    event_id, image_id = state["event_id"], state["images"][name]["id"]
    return client.get(
        f"{API}/events/{event_id}/images/{image_id}/content", headers=headers(state, who)
    )


def attachment_content(state):
    attendee = headers(state, "attendee")
    link = ok(
        "attachment download link",
        client.get(
            f"{API}/support/cases/{state['case_id']}/attachments/"
            f"{state['attachment_id']}/download-link",
            headers=attendee,
        ),
    ).json()["url"]
    return ok("download attachment", client.get(BASE + link)).content


def prepare():
    state = {"run": uuid.uuid4().hex[:8]}
    save(state)
    organizer, attendee = headers(state, "organizer"), headers(state, "attendee")
    organization = next(
        org
        for org in ok(
            "list organizations", client.get(f"{API}/organizations", headers=organizer)
        ).json()
        if org["status"] == "active"
    )
    now = datetime.now(UTC)
    iso = lambda delta: (now + delta).isoformat()  # noqa: E731
    event = ok(
        "create event",
        client.post(
            f"{API}/organizations/{organization['id']}/events",
            headers=organizer,
            json={
                "category_id": client.get(f"{API}/categories").json()[0]["id"],
                "venue_id": client.get(f"{API}/venues").json()[0]["id"],
                "title": f"Backup drill {state['run']}",
                "capacity": 20,
                "starts_at": iso(timedelta(days=2)),
                "ends_at": iso(timedelta(days=2, hours=3)),
                "registration_opens_at": iso(timedelta(hours=-1)),
                "registration_closes_at": iso(timedelta(days=1)),
                "admission_opens_at": iso(timedelta(days=2, hours=-1)),
                "admission_closes_at": iso(timedelta(days=2, hours=3)),
                "refund_cutoff_at": iso(timedelta(days=1)),
            },
        ),
        201,
    ).json()
    state["event_id"] = event["id"]
    ticket_type = ok(
        "add free ticket type",
        client.post(
            f"{API}/events/{event['id']}/ticket-types",
            headers=organizer,
            json={
                "name": "General admission",
                "kind": "free",
                "price_minor": 0,
                "quantity_limit": 20,
                "per_order_limit": 2,
                "sales_open_at": iso(timedelta(hours=-1)),
                "sales_close_at": iso(timedelta(days=1)),
            },
        ),
        201,
    ).json()
    ok("publish event", client.post(f"{API}/events/{event['id']}/publish", headers=organizer))

    # a stays; b is deleted during the quiesced backup's window; c during the online one.
    state["images"] = {}
    for name, color in (("a", "red"), ("b", "green"), ("c", "blue")):
        image = ok(
            f"upload image {name}",
            client.post(
                f"{API}/events/{event['id']}/images",
                params={"alt_text": f"Drill image {name}", "filename": f"{name}.png"},
                headers={**organizer, "Content-Type": "image/png"},
                content=png(color),
            ),
            201,
        ).json()
        state["images"][name] = {"id": image["id"]}
        save(state)
        state["images"][name]["sha256"] = sha(
            ok(f"read image {name}", image_content(state, name)).content
        )

    hold = ok(
        "hold a ticket",
        client.post(
            f"{API}/events/{event['id']}/holds",
            headers=attendee,
            json={"items": [{"ticket_type_id": ticket_type["id"], "quantity": 1}]},
        ),
        201,
    ).json()
    order = ok(
        "confirm free order",
        client.post(
            f"{API}/holds/{hold['id']}/confirm",
            headers=attendee,
            json={
                "recipients": [
                    {
                        "allocation_id": hold["allocations"][0]["id"],
                        "name": "Aru Demo Attendee",
                        "email": ACCOUNTS["attendee"],
                    }
                ]
            },
        ),
    ).json()
    ticket = order["items"][0]["ticket"]
    state.update(order_id=order["id"], ticket_id=ticket["id"], qr_payload=ticket["qr_payload"])
    # The first download stores the PDF (stored_file + ticket.pdf_file_id); later ones reuse it.
    ok("store ticket PDF", client.get(f"{API}/tickets/{ticket['id']}/pdf", headers=attendee))
    state["pdf_sha256"] = sha(
        ok(
            "read stored PDF", client.get(f"{API}/tickets/{ticket['id']}/pdf", headers=attendee)
        ).content
    )

    case = ok(
        "open support case",
        client.post(
            f"{API}/support/cases",
            headers=attendee,
            json={
                "kind": "attendee",
                "category": "delivery",
                "subject": "Backup drill",
                "body": "Case opened by the backup drill",
                "client_message_id": str(uuid.uuid4()),
                "ticket_id": ticket["id"],
            },
        ),
        201,
    ).json()["case"]
    upload = ok(
        "upload attachment",
        client.post(
            f"{API}/support/cases/{case['id']}/attachments",
            params={"filename": "receipt.pdf"},
            headers={**attendee, "Content-Type": "application/pdf"},
            content=b"%PDF-1.4\n% backup drill " + state["run"].encode() + b"\n%%EOF\n",
        ),
        201,
    ).json()
    message = ok(
        "link attachment to a message",
        client.post(
            f"{API}/support/cases/{case['id']}/messages",
            headers=attendee,
            json={
                "client_message_id": str(uuid.uuid4()),
                "body": "Attached",
                "attachment_ids": [upload["file_id"]],
            },
        ),
        201,
    ).json()
    state.update(case_id=case["id"], attachment_id=message["attachments"][0]["id"])
    save(state)
    state["attachment_sha256"] = sha(attachment_content(state))
    save(state)


def delete_image(name):
    state = load()
    try:
        response = client.delete(
            f"{API}/events/{state['event_id']}/images/{state['images'][name]['id']}",
            headers=headers(state, "organizer"),
        )
    except httpx.TransportError:
        outcome = "unreachable"
    else:
        if response.status_code != 204:
            raise SystemExit(f"[BAD] delete image {name}: {response.status_code} {response.text}")
        outcome = "deleted"
    print(f"[OK ] delete image {name}: {outcome}")
    state.setdefault("deletions", {}).setdefault(name, []).append(outcome)
    save(state)


def database():
    return psycopg.connect(os.environ["DRILL_DATABASE_URL"])


def facts(db):
    """Rows and keys a restore must bring back as they were at backup time.

    Only columns the restarted worker cannot legitimately change are recorded: ids, the ticket
    QR token hash, object keys and checksums, audit actions and outbox deduplication keys.
    """
    rows = lambda sql: [list(map(str, row)) for row in db.execute(sql).fetchall()]  # noqa: E731
    return {
        "orders": rows("SELECT id FROM biletflow.ticket_order"),
        "tickets": rows("SELECT id, qr_token_hash FROM biletflow.ticket"),
        "files": rows("SELECT id, object_key, sha256 FROM biletflow.stored_file"),
        "event_media": rows("SELECT id, file_id FROM biletflow.event_media"),
        "audit": rows("SELECT id, action FROM biletflow.audit_log"),
        "outbox": rows("SELECT id, deduplication_key FROM biletflow.outbox_job"),
    }


def snapshot():
    """Run with the worker stopped, so the job queued here is still pending in the backup."""
    state = load()
    email = f"backup-drill-pending-{state['run']}@example.com"
    with database() as db:
        started = db.execute("SELECT clock_timestamp()").fetchone()[0]
    ok(
        "register an account (queues a verification email)",
        client.post(
            f"{API}/auth/register",
            json={"email": email, "password": DEMO_PASSWORD, "display_name": "Pending"},
        ),
        202,
    )
    with database() as db:
        # Only the job queued above: other pending jobs may be scheduled for later on purpose.
        pending = db.execute(
            "SELECT id::text FROM biletflow.outbox_job WHERE status = 'pending' "
            "AND created_at >= %s",
            (started,),
        ).fetchall()
        if not pending:
            raise SystemExit("[BAD] no pending outbox job; is the worker stopped?")
        state["pending_jobs"] = [row[0] for row in pending]
        state["facts"] = facts(db)
    print(f"[OK ] snapshot: {len(pending)} pending jobs, {len(state['facts']['audit'])} audit rows")
    save(state)


def until(label, check, seconds=90):
    for _ in range(seconds):
        if check():
            print(f"[OK ] {label}")
            return
        time.sleep(1)
    raise SystemExit(f"[BAD] {label}: timed out")


def verify():
    state = load()
    expected = state["facts"]
    with database() as db:
        restored = facts(db)
    for table, rows in expected.items():
        missing = set(map(tuple, rows)) - set(map(tuple, restored[table]))
        if missing:
            raise SystemExit(f"[BAD] {len(missing)} {table} rows differ from the snapshot")
        print(f"[OK ] all {len(rows)} {table} rows came back with the same keys")
    if sorted(restored["event_media"]) != sorted(expected["event_media"]):
        raise SystemExit("[BAD] the gallery differs from the snapshot (a later change leaked in)")

    # The quiesced backup's window must have refused b's deletion, so b is in that backup although
    # it was deleted afterwards. c was deleted earlier, in the online backup's window.
    deletions = state.get("deletions", {})
    if deletions.get("b", [None])[0] != "unreachable":
        raise SystemExit("[BAD] deleting image b during the quiesced backup was not refused")
    expect = {"a", "b"} if "deleted" in deletions.get("c", []) else {"a", "b", "c"}
    gallery = ok(
        "read gallery",
        client.get(f"{API}/events/{state['event_id']}", headers=headers(state, "organizer")),
    ).json()["images"]
    names = {
        name for name, image in state["images"].items() if image["id"] in {i["id"] for i in gallery}
    }
    if names != expect:
        raise SystemExit(f"[BAD] gallery holds {sorted(names)}, expected {sorted(expect)}")
    for name in sorted(expect):
        content = ok(f"read restored image {name}", image_content(state, name)).content
        if sha(content) != state["images"][name]["sha256"]:
            raise SystemExit(f"[BAD] image {name} bytes differ")
    print("[OK ] restored images are readable and unchanged")

    attendee = headers(state, "attendee")
    ticket = ok(
        "read ticket", client.get(f"{API}/tickets/{state['ticket_id']}", headers=attendee)
    ).json()
    if ticket["status"] != "valid" or ticket["qr_payload"] != state["qr_payload"]:
        raise SystemExit("[BAD] ticket status or QR payload changed")
    pdf = ok(
        "read ticket PDF", client.get(f"{API}/tickets/{state['ticket_id']}/pdf", headers=attendee)
    )
    if sha(pdf.content) != state["pdf_sha256"]:
        raise SystemExit("[BAD] the stored ticket PDF was not restored")
    if sha(attachment_content(state)) != state["attachment_sha256"]:
        raise SystemExit("[BAD] support attachment bytes differ")
    print("[OK ] ticket, QR payload, stored PDF and attachment are unchanged")

    def drained():
        with database() as db:
            rows = db.execute(
                "SELECT count(*) FROM biletflow.outbox_job WHERE id = ANY(%s::uuid[]) "
                "AND status <> 'done'",
                (state["pending_jobs"],),
            ).fetchone()
        return rows[0] == 0

    until(f"worker completed the {len(state['pending_jobs'])} jobs pending at backup time", drained)


COMMANDS = {"prepare": prepare, "snapshot": snapshot, "verify": verify}

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "delete-image":
        delete_image(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] in COMMANDS:
        COMMANDS[sys.argv[1]]()
    else:
        raise SystemExit(__doc__)
