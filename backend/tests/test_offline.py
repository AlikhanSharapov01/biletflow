"""BF-12: scanner devices, offline packages and idempotent batch synchronization."""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.admission_models import CheckIn
from app.checkout_models import Ticket
from app.checkout_service import qr_payload
from app.offline_models import (
    EntryConfirmation,
    OfflineOperation,
    OfflinePackage,
    SyncConflict,
)
from app.security import now
from app.signing import ENTRY_PREFIX, canonical, unb64
from tests.test_admission import API, free_ticket, published, scan, staff
from tests.test_entry_confirmation import code_of, confirm, detail


def device(client, headers, key=None, label="Gate phone"):
    return client.post(
        API + "/scanner/devices",
        headers=headers,
        json={"device_key": key or f"dev-{uuid4().hex}", "label": label},
    )


def package(client, f, headers, device_id):
    return client.post(
        API + f"/scanner/events/{f['event']['id']}/offline-packages",
        headers=headers,
        json={"device_id": device_id},
    )


def op(sequence, ticket=None, proof=None, kind="check_in", **extra):
    body = {
        "operation_id": str(uuid4()),
        "sequence_number": sequence,
        "kind": kind,
        "captured_at": now().isoformat(),
    }
    if kind == "check_in":
        body["qr_payload"] = ticket["qr_payload"]
        if proof:
            body["entry_confirmation"] = proof["token"]
    body.update(extra)
    return body


def upload(client, headers, device_id, package_id, operations):
    return client.post(
        API + "/scanner/offline/sync",
        headers=headers,
        json={
            "device_id": device_id,
            "package_id": package_id,
            "device_time": now().isoformat(),
            "operations": operations,
        },
    )


def prepared(client, setup, account, factory, settings, capabilities=("scan",)):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, list(capabilities))
    dev = device(client, scanner)
    assert dev.status_code == 201, dev.text
    pkg = package(client, f, scanner, dev.json()["id"])
    assert pkg.status_code == 201, pkg.text
    return f, scanner, dev.json()["id"], pkg.json()


def attendee(client, account, f):
    ticket, buyer = free_ticket(client, account, f)
    return ticket, buyer


def results(r):
    assert r.status_code == 200, r.text
    return r.json()["results"]


def test_device_registration(client, account):
    _, _, one = account()
    _, _, two = account()
    created = device(client, one, key="installation-0001")
    assert created.status_code == 201 and created.json()["revoked_at"] is None
    again = device(client, one, key="installation-0001", label="Renamed")
    assert again.status_code == 200 and again.json()["id"] == created.json()["id"]
    assert again.json()["label"] == "Renamed"
    taken = device(client, two, key="installation-0001")
    assert taken.status_code == 409 and detail(taken) == "device_key_taken"
    assert client.get(API + "/scanner/devices", headers=two).json() == []
    assert len(client.get(API + "/scanner/devices", headers=one).json()) == 1
    assert client.post(API + "/scanner/devices", json={}).status_code == 401
    assert (
        client.post(
            API + "/scanner/devices", headers=one, json={"device_key": "short", "label": "x"}
        ).status_code
        == 422
    )

    url = API + f"/scanner/devices/{created.json()['id']}/revoke"
    assert client.post(url, headers=two).status_code == 404
    revoked = client.post(url, headers=one)
    assert revoked.status_code == 200 and revoked.json()["revoked_at"]
    r = device(client, one, key="installation-0001")
    assert r.status_code == 403 and detail(r) == "device_revoked"


def test_package_is_signed_event_specific_and_verifiable_offline(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    unclaimed, _ = free_ticket(client, account, f, recipient="friend@example.com")
    dev = device(client, scanner).json()["id"]

    keys = client.get(API + "/scanner/signing-keys", headers=scanner).json()
    assert keys["algorithm"] == "Ed25519"
    assert keys["entry_confirmation"]["key_id"] != keys["offline_package"]["key_id"]
    assert keys["entry_confirmation"]["public_key"] != keys["offline_package"]["public_key"]

    r = package(client, f, scanner, dev)
    assert r.status_code == 201, r.text
    pkg = r.json()
    manifest = pkg["manifest"]
    body = canonical(manifest)
    assert pkg["content_hash"] == hashlib.sha256(body).hexdigest()
    package_key = Ed25519PublicKey.from_public_bytes(unb64(keys["offline_package"]["public_key"]))
    package_key.verify(unb64(pkg["signature"]), b"offline_package\0" + body)
    try:
        package_key.verify(unb64(pkg["signature"]), b"offline_package\0" + body + b" ")
        raise AssertionError("tampered manifest must not verify")
    except InvalidSignature:
        pass

    assert manifest["event"]["id"] == f["event"]["id"] and manifest["device_id"] == dev
    assert manifest["snapshot_version"] == pkg["snapshot_version"] >= 0
    assert pkg["expires_at"] and manifest["generated_at"] and manifest["revocations"] == []
    # Minimum data: claimed tickets only, hashed QR, no e-mail, no full surname.
    assert [t["ticket_id"] for t in manifest["tickets"]] == [ticket["id"]]
    entry = manifest["tickets"][0]
    assert entry["holder"] == "Aru A." and "email" not in json.dumps(manifest).lower()
    token = ticket["qr_payload"].removeprefix(manifest["ticket_qr"]["prefix"])
    assert entry["qr_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert unclaimed["id"] not in json.dumps(manifest)

    # A device can verify an entry confirmation with the package's key, without the server.
    proof = code_of(confirm(client, buyer, ticket["id"]))
    body_part, signature = proof["token"].removeprefix(ENTRY_PREFIX).split(".")
    entry_key = Ed25519PublicKey.from_public_bytes(
        unb64(manifest["entry_confirmation"]["public_key"])
    )
    entry_key.verify(unb64(signature), b"entry_confirmation\0" + unb64(body_part))
    claims = json.loads(unb64(body_part))
    assert claims["tid"] == ticket["id"] and claims["eid"] == f["event"]["id"]
    # The two purposes cannot stand in for each other.
    try:
        package_key.verify(unb64(signature), b"offline_package\0" + unb64(body_part))
        raise AssertionError("entry token must not verify as a package")
    except InvalidSignature:
        pass


def test_package_authorization(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    attendees_only = staff(client, settings, account, f, ["attendees"])
    _, _, stranger = account()
    dev = device(client, scanner).json()["id"]

    assert client.post(
        API + f"/scanner/events/{f['event']['id']}/offline-packages"
    ).status_code in (
        401,
        422,
    )
    r = package(client, f, stranger, dev)
    assert r.status_code == 404 and detail(r) == "event_not_found"
    r = package(client, f, attendees_only, device(client, attendees_only).json()["id"])
    assert r.status_code == 403 and detail(r) == "permission_denied"
    # Someone else's device cannot be used.
    r = package(client, f, f["headers"], dev)
    assert r.status_code == 404 and detail(r) == "device_not_found"
    r = package(client, f, scanner, str(uuid4()))
    assert r.status_code == 404

    client.post(API + f"/scanner/devices/{dev}/revoke", headers=scanner)
    r = package(client, f, scanner, dev)
    assert r.status_code == 403 and detail(r) == "device_revoked"

    other_dev = device(client, scanner).json()["id"]
    r = client.post(API + f"/events/{f['event']['id']}/unpublish", headers=f["headers"])
    assert r.status_code == 200
    r = package(client, f, scanner, other_dev)
    assert r.status_code == 409 and detail(r) == "admission_closed"


def test_sync_accepts_and_is_idempotent(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    operation = op(1, ticket, proof)

    r = upload(client, scanner, dev, pkg["package_id"], [operation])
    body = r.json()
    assert body["results"][0]["status"] == "accepted", body
    assert body["results"][0]["check_in_id"] and body["results"][0]["code"] is None
    assert body["refreshed"]["counts"]["admitted"] == 1
    assert body["refreshed"]["admitted_ticket_ids"] == [ticket["id"]]
    assert "clock_skew_seconds" in body and body["server_time"] != body["device_time"]
    first_check_in = body["results"][0]["check_in_id"]

    # Uploading the same operation again changes nothing.
    again = results(upload(client, scanner, dev, pkg["package_id"], [operation]))[0]
    assert again["status"] == "duplicate" and again["original_status"] == "accepted"
    assert again["check_in_id"] == first_check_in
    # Same id with different content is refused, never silently merged.
    changed = {**operation, "captured_at": (now() - timedelta(minutes=1)).isoformat()}
    mismatch = results(upload(client, scanner, dev, pkg["package_id"], [changed]))[0]
    assert mismatch["status"] == "rejected" and mismatch["code"] == "operation_payload_mismatch"

    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
        row = db.get(CheckIn, UUID(first_check_in))
        assert row.source == "offline_sync" and row.device_id == UUID(dev)
        assert row.entry_confirmation_id == UUID(proof["id"])
        # Device time and server receipt time are stored separately.
        assert row.captured_at != row.accepted_at
        stored = db.scalar(select(OfflineOperation))
        assert stored.captured_at != stored.created_at and stored.device_reported_at
        assert db.get(EntryConfirmation, UUID(proof["id"])).consumed_at is not None
        assert db.get(Ticket, UUID(ticket["id"])).status == "checked_in"
    counts = client.get(API + f"/scanner/events/{f['event']['id']}/counts", headers=scanner)
    assert counts.json()["admitted"] == 1


def test_batch_reports_each_operation(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    good, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, good["id"]))
    other = published(client, setup, factory)
    foreign, foreign_buyer = free_ticket(client, account, other)
    unclaimed, _ = free_ticket(client, account, f, recipient="friend@example.com")
    stale, stale_buyer = attendee(client, account, f)

    operations = [
        op(1, good, proof),
        op(2, foreign, code_of(confirm(client, foreign_buyer, foreign["id"]))),
        op(3, {"qr_payload": good["qr_payload"][:-4] + "abcd"}),
        op(4, {"qr_payload": "https://biletflow.kz/e/x?promo=SPRING"}),
        op(5, {"qr_payload": qr_payload(settings, unclaimed["id"])}),
        op(6, stale),  # no entry confirmation
        op(7, good, captured_at=(now() + timedelta(hours=5)).isoformat()),
        op(8, good, captured_at=(now() - timedelta(hours=5)).isoformat()),
    ]
    out = results(upload(client, scanner, dev, pkg["package_id"], list(reversed(operations))))
    assert [o["sequence_number"] for o in out] == list(range(1, 9))  # processed in sequence
    assert [(o["status"], o["code"]) for o in out] == [
        ("accepted", None),
        ("rejected", "wrong_event"),
        ("rejected", "ticket_not_found"),
        ("rejected", "not_a_ticket_qr"),
        ("rejected", "ticket_unclaimed"),
        ("rejected", "sign_in_required"),
        ("rejected", "package_expired"),
        ("rejected", "outside_admission_window"),
    ]
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
        assert db.scalar(select(func.count(SyncConflict.id))) == 0
        assert db.get(Ticket, UUID(stale["id"])).status == "valid"  # rolled back
        assert db.scalar(select(func.count(OfflineOperation.id))) == 8

    # A cap on batch size and a required body.
    assert upload(client, scanner, dev, pkg["package_id"], []).status_code == 422


def test_second_device_becomes_conflict_not_second_entry(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    second_scanner = staff(client, settings, account, f, ["scan"])
    dev2 = device(client, second_scanner).json()["id"]
    pkg2 = package(client, f, second_scanner, dev2).json()
    ticket, buyer = attendee(client, account, f)
    proof_a = code_of(confirm(client, buyer, ticket["id"]))
    proof_b = code_of(confirm(client, buyer, ticket["id"]))  # supersedes the first

    # Device A uploads first (an unrelated sequence on a different package is fine).
    a = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof_b)]))[0]
    assert a["status"] == "accepted"
    b = results(upload(client, second_scanner, dev2, pkg2["package_id"], [op(1, ticket, proof_a)]))[
        0
    ]
    assert b["status"] == "conflict" and b["code"] == "already_checked_in" and b["conflict_id"]
    assert b["check_in_id"] is None
    # Reusing a sequence number of the same package for another operation is refused.
    clash = {**op(1, ticket, proof_a), "operation_id": str(uuid4())}
    clash = results(upload(client, second_scanner, dev2, pkg2["package_id"], [clash]))[0]
    assert clash["status"] == "rejected" and clash["code"] == "sequence_conflict"

    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
        conflict = db.scalar(select(SyncConflict))
        assert conflict.status == "open" and conflict.existing_check_in_id == UUID(a["check_in_id"])

    # The organizer sees it, with device time and server time apart.
    listing = client.get(API + f"/events/{f['event']['id']}/sync-conflicts", headers=f["headers"])
    assert listing.status_code == 200, listing.text
    item = listing.json()[0]
    assert item["id"] == b["conflict_id"] and item["status"] == "open"
    assert item["operation"]["ticket"]["attendee_name"] == "Aru Attendee"
    assert item["operation"]["captured_at_device"] != item["operation"]["received_at_server"]
    assert item["existing_check_in"]["source"] == "offline_sync"
    assert item["operation"]["device"]["id"] == dev2

    # Only authorized organizers review; scan-only staff and strangers cannot.
    for headers, code in ((scanner, 403), (account()[2], 404)):
        r = client.get(API + f"/events/{f['event']['id']}/sync-conflicts", headers=headers)
        assert r.status_code == code
    url = API + f"/sync-conflicts/{b['conflict_id']}/resolve"
    assert client.post(url, headers=scanner, json={"note": "ok"}).status_code == 403
    assert client.post(url, headers=account()[2], json={"note": "ok"}).status_code == 404
    assert client.post(url, headers=f["headers"], json={"note": " "}).status_code == 422
    done = client.post(url, headers=f["headers"], json={"note": "Guest showed one ticket only"})
    assert done.status_code == 200 and done.json()["status"] == "resolved"
    assert client.post(url, headers=f["headers"], json={"note": "again"}).status_code == 409
    open_ones = client.get(
        API + f"/events/{f['event']['id']}/sync-conflicts",
        params={"status": "open"},
        headers=f["headers"],
    )
    assert open_ones.json() == []
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1  # review never adds an entry


def test_online_admission_then_offline_upload_is_conflict(
    client, setup, account, factory, settings
):
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
    assert out["status"] == "conflict" and out["code"] == "already_checked_in"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1


def test_refund_since_snapshot_is_rejected_on_sync(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    with factory.begin() as db:
        db.get(Ticket, UUID(ticket["id"])).status = "refunded"
    out = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof)]))[0]
    assert out["status"] == "conflict" and out["code"] == "ticket_not_valid"
    r = upload(client, scanner, dev, pkg["package_id"], [op(2, ticket, proof)]).json()
    assert r["refreshed"]["revocations"] == [{"ticket_id": ticket["id"], "status": "refunded"}]
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0
        assert db.get(EntryConfirmation, UUID(proof["id"])).consumed_at is None
    listed = client.get(
        API + f"/events/{f['event']['id']}/sync-conflicts", headers=f["headers"]
    ).json()
    assert len(listed) >= 1 and listed[0]["reason"] == "ticket_not_valid"
    assert listed[0]["existing_check_in"] is None


def test_offline_reversal_follows_original_operation(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(
        client, setup, account, factory, settings, ("scan", "reverse_checkin")
    )
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    first = op(1, ticket, proof)
    undo = op(2, kind="reverse", parent_operation_id=first["operation_id"], reason="Wrong person")
    out = results(upload(client, scanner, dev, pkg["package_id"], [first, undo]))
    assert [o["status"] for o in out] == ["accepted", "accepted"]
    with factory() as db:
        row = db.get(CheckIn, UUID(out[0]["check_in_id"]))
        assert row.reversed_at is not None
        assert db.get(Ticket, UUID(ticket["id"])).status == "valid"
    # Reversing twice, an unknown parent, or a reverse without reason are rejected.
    again = op(3, kind="reverse", parent_operation_id=first["operation_id"], reason="twice")
    unknown = op(4, kind="reverse", parent_operation_id=str(uuid4()), reason="x")
    no_reason = op(5, kind="reverse", parent_operation_id=first["operation_id"])
    out = results(upload(client, scanner, dev, pkg["package_id"], [again, unknown, no_reason]))
    assert [(o["status"], o["code"]) for o in out] == [
        ("rejected", "already_reversed"),
        ("rejected", "parent_not_found"),
        ("rejected", "invalid_operation"),
    ]
    # Re-admission offline needs a fresh confirmation too.
    r = results(upload(client, scanner, dev, pkg["package_id"], [op(6, ticket, proof)]))[0]
    assert r["status"] == "rejected" and r["code"] == "confirmation_used"
    fresh = code_of(confirm(client, buyer, ticket["id"]))
    r = results(upload(client, scanner, dev, pkg["package_id"], [op(7, ticket, fresh)]))[0]
    assert r["status"] == "accepted"

    # Staff without reverse permission cannot reverse offline either.
    f2, scan_only, dev2, pkg2 = prepared(client, setup, account, factory, settings)
    t2, b2 = attendee(client, account, f2)
    p2 = code_of(confirm(client, b2, t2["id"]))
    o1 = op(1, t2, p2)
    o2 = op(2, kind="reverse", parent_operation_id=o1["operation_id"], reason="nope")
    out = results(upload(client, scan_only, dev2, pkg2["package_id"], [o1, o2]))
    assert (out[1]["status"], out[1]["code"]) == ("rejected", "permission_denied")


def test_revoked_staff_or_device_cannot_sync_acceptances(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    event_id = f["event"]["id"]
    staff_id = client.get(API + f"/events/{event_id}/staff", headers=f["headers"]).json()[0]["id"]
    assert (
        client.delete(
            API + f"/events/{event_id}/staff/{staff_id}", headers=f["headers"]
        ).status_code
        == 200
    )

    out = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof)]))[0]
    assert out["status"] == "rejected" and out["code"] == "scanner_not_authorized"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0
    # Rejected uploads stay reviewable by the organizer.
    ops = client.get(
        API + f"/events/{event_id}/offline-operations",
        params={"status": "rejected"},
        headers=f["headers"],
    )
    assert ops.status_code == 200 and ops.json()[0]["rejection_code"] == "scanner_not_authorized"
    assert client.get(
        API + f"/events/{event_id}/offline-operations", headers=scanner
    ).status_code in (403, 404)

    f2, s2, dev2, pkg2 = prepared(client, setup, account, factory, settings)
    t2, b2 = attendee(client, account, f2)
    p2 = code_of(confirm(client, b2, t2["id"]))
    client.post(API + f"/scanner/devices/{dev2}/revoke", headers=s2)
    out = results(upload(client, s2, dev2, pkg2["package_id"], [op(1, t2, p2)]))[0]
    assert out["status"] == "rejected" and out["code"] == "device_revoked"


def test_sync_package_ownership(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    _, _, stranger = account()
    ticket, buyer = attendee(client, account, f)
    operation = [op(1, ticket, code_of(confirm(client, buyer, ticket["id"])))]
    r = upload(client, stranger, dev, pkg["package_id"], operation)
    assert r.status_code == 404 and detail(r) == "package_not_found"
    r = upload(client, scanner, str(uuid4()), pkg["package_id"], operation)
    assert r.status_code == 404
    assert upload(client, {}, dev, pkg["package_id"], operation).status_code == 401
    # Unexpected fields are refused.
    bad = {**operation[0], "status": "accepted"}
    assert upload(client, scanner, dev, pkg["package_id"], [bad]).status_code == 422


def test_same_batch_uploaded_concurrently_counts_once(
    client, setup, account, factory, settings, app
):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    batch = []
    for sequence in (1, 2, 3):
        ticket, buyer = attendee(client, account, f)
        batch.append(op(sequence, ticket, code_of(confirm(client, buyer, ticket["id"]))))

    def go(_):
        with TestClient(app) as other:
            r = upload(other, scanner, dev, pkg["package_id"], batch)
            assert r.status_code == 200, r.text
            return [o["status"] for o in r.json()["results"]]

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(go, range(2)))
    flat = sorted(sum(outcomes, []))
    assert flat == ["accepted"] * 3 + ["duplicate"] * 3
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 3
        assert db.scalar(select(func.count(OfflineOperation.id))) == 3


def test_two_devices_racing_on_one_ticket_admit_once(
    client, setup, account, factory, settings, app
):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    second = staff(client, settings, account, f, ["scan"])
    dev2 = device(client, second).json()["id"]
    pkg2 = package(client, f, second, dev2).json()
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    jobs = [(scanner, dev, pkg["package_id"]), (second, dev2, pkg2["package_id"])]

    def go(job):
        headers, device_id, package_id = job
        with TestClient(app) as other:
            r = upload(other, headers, device_id, package_id, [op(1, ticket, proof)])
            assert r.status_code == 200, r.text
            return r.json()["results"][0]["status"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(go, jobs))
    assert statuses == ["accepted", "conflict"]
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
        assert db.get(Ticket, UUID(ticket["id"])).status == "checked_in"


def test_expired_package_fails_closed_for_late_captures(client, setup, account, factory, settings):
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    ticket, buyer = attendee(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    with factory.begin() as db:
        db.execute(
            update(OfflinePackage)
            .where(OfflinePackage.id == UUID(pkg["package_id"]))
            .values(created_at=now() - timedelta(hours=3), expires_at=now() - timedelta(hours=1))
        )
    out = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof)]))[0]
    assert out["status"] == "rejected" and out["code"] == "package_expired"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0
