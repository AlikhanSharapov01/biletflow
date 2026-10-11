"""Cross-module adversarial checks (offline sync, suspension, cross-organization review)."""

from sqlalchemy import func, select

from app.admin_cli import set_admin
from app.admission_models import CheckIn
from app.signing import ENTRY_PREFIX, b64, canonical
from tests.test_admission import API, free_ticket, published, scan, staff
from tests.test_entry_confirmation import code_of, confirm, detail
from tests.test_offline import attendee, device, op, package, prepared, results, upload

ADMIN = API + "/admin"


def make_admin(account, factory):
    email, _, headers = account()
    assert set_admin(factory, email, True) == "granted"
    return headers


def test_sync_survives_crafted_unsigned_confirmation_with_non_string_claims(
    client, setup, account, factory, settings
):
    """An authenticated scanner can upload any string as entry_confirmation. The claims are
    parsed WITHOUT signature verification (claimed_ids) and a non-string cid must not 500."""
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    forged = ENTRY_PREFIX + b64(canonical({"cid": 1, "tid": ticket["id"], "eid": "x"})) + ".sig"
    body = op(1, ticket)
    body["entry_confirmation"] = forged
    r = upload(client, scanner, dev, pkg["package_id"], [body])
    assert r.status_code == 200, r.text
    out = r.json()["results"][0]
    assert out["status"] == "rejected" and out["code"] == "invalid_confirmation"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0


def test_event_suspension_blocks_offline_package_and_sync_until_reinstated(
    client, setup, account, factory, settings
):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    admin = make_admin(account, factory)
    event_id = f["event"]["id"]
    r = client.post(ADMIN + f"/events/{event_id}/suspend", headers=admin, json={"reason": "x"})
    assert r.status_code == 200, r.text

    # No new package, no attendee confirmation, and queued uploads are not accepted.
    assert package(client, f, scanner, dev).status_code == 409
    assert detail(confirm(client, buyer, ticket["id"])) == "admission_closed"
    out = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof)]))[0]
    assert out["status"] == "rejected" and out["code"] == "admission_closed"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0

    r = client.post(ADMIN + f"/events/{event_id}/reinstate", headers=admin, json={"reason": "y"})
    assert r.status_code == 200
    # The rejected operation is spent; a fresh operation with the still-unused proof is accepted.
    out = results(upload(client, scanner, dev, pkg["package_id"], [op(2, ticket, proof)]))[0]
    assert out["status"] == "accepted", out
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1


def test_cross_organization_review_endpoints_do_not_leak(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    second = staff(client, settings, account, f, ["scan"])
    dev2 = device(client, second).json()["id"]
    pkg2 = package(client, f, second, dev2).json()
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    assert (
        results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof)]))[0][
            "status"
        ]
        == "accepted"
    )
    out = results(upload(client, second, dev2, pkg2["package_id"], [op(1, ticket, proof)]))[0]
    assert out["status"] == "conflict" and out["conflict_id"]
    conflict_id = out["conflict_id"]

    other = setup()  # a different organization and owner
    outsider = other["headers"]
    event_id = f["event"]["id"]
    assert (
        client.get(API + f"/events/{event_id}/sync-conflicts", headers=outsider).status_code == 404
    )
    assert (
        client.get(API + f"/events/{event_id}/offline-operations", headers=outsider).status_code
        == 404
    )
    r = client.post(
        API + f"/sync-conflicts/{conflict_id}/resolve", headers=outsider, json={"note": "mine"}
    )
    assert r.status_code == 404 and detail(r) == "sync_conflict_not_found"
    # A scanner without `attendees` gets 403 (it legitimately knows the event exists).
    r = client.post(
        API + f"/sync-conflicts/{conflict_id}/resolve", headers=scanner, json={"note": "mine"}
    )
    assert r.status_code == 403
    r = client.post(
        API + f"/sync-conflicts/{conflict_id}/resolve", headers=f["headers"], json={"note": "ok"}
    )
    assert r.status_code == 200 and r.json()["status"] == "resolved"


def test_manual_check_in_cannot_reach_another_events_ticket(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    g = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    foreign, foreign_buyer = free_ticket(client, account, g)
    proof = code_of(confirm(client, foreign_buyer, foreign["id"]))
    r = client.post(
        API + f"/scanner/events/{f['event']['id']}/check-ins",
        headers=scanner,
        json={"ticket_id": foreign["id"], "entry_confirmation": proof["token"]},
    )
    assert r.status_code == 404 and detail(r) == "ticket_not_found"
    r = scan(client, f, scanner, foreign["qr_payload"], entry_confirmation=proof["token"])
    assert r.status_code == 409 and detail(r) == "wrong_event"
    # Searching the other event's attendees from the wrong event yields nothing.
    r = client.get(
        API + f"/scanner/events/{f['event']['id']}/attendees", headers=scanner, params={"q": "Aru"}
    )
    assert r.status_code == 200 and r.json() == []
