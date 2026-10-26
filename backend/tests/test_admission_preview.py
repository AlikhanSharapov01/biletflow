"""BF-11/BF-12: read-only verification preview and reversal from the conflict review."""

from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, update

from app.admission_models import CheckIn
from app.checkout_models import Ticket
from app.checkout_service import qr_payload
from app.models import AuditLog, AuthSession
from app.offline_models import EntryConfirmation, SyncConflict
from app.security import now
from tests.test_admission import API, free_ticket, published, scan, staff
from tests.test_entry_confirmation import code_of, confirm, detail
from tests.test_offline import device, op, package, prepared, results, upload


def preview(client, f, headers, **body):
    return client.post(
        API + f"/scanner/events/{f['event']['id']}/verifications", headers=headers, json=body
    )


def assert_untouched(factory, ticket, check_ins=0):
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == check_ins
        assert db.get(Ticket, UUID(ticket["id"])).status == ("checked_in" if check_ins else "valid")


def test_preview_consumes_nothing_and_real_check_in_still_works(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))

    for extra in ({"entry_confirmation": proof["token"]}, {"entry_code": proof["code"]}):
        r = preview(client, f, scanner, qr_payload=ticket["qr_payload"], **extra)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["result"] == "would_admit" and body["code"] is None
        assert body["confirmation"] == "valid" and body["checked_in_at"] is None
        assert body["ticket_id"] == ticket["id"] and body["event_id"] == f["event"]["id"]
        assert body["attendee_name"] == "Aru Attendee"
        assert body["ticket_type_name"] == "General admission" and body["ticket_status"] == "valid"
        assert body["checked_at"]
    by_id = preview(client, f, scanner, ticket_id=ticket["id"], entry_code=proof["code"])
    assert by_id.json()["result"] == "would_admit"

    assert_untouched(factory, ticket)
    with factory() as db:
        assert db.get(EntryConfirmation, UUID(proof["id"])).consumed_at is None
        assert not db.scalar(select(AuditLog.id).where(AuditLog.action.like("admission.%")))

    r = scan(client, f, scanner, ticket["qr_payload"], entry_confirmation=proof["token"])
    assert r.status_code == 200, r.text
    assert_untouched(factory, ticket, check_ins=1)


def test_already_checked_in_is_reported_before_confirmation(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    assert (
        scan(client, f, scanner, ticket["qr_payload"], entry_code=proof["code"]).status_code == 200
    )

    # The real check-in says already_checked_in even with a spent confirmation or none at all.
    real = scan(client, f, scanner, ticket["qr_payload"], entry_code=proof["code"])
    assert real.status_code == 409 and detail(real) == "already_checked_in"
    spent = preview(client, f, scanner, qr_payload=ticket["qr_payload"], entry_code=proof["code"])
    bare = preview(client, f, scanner, qr_payload=ticket["qr_payload"])
    for r, state in ((spent, "used"), (bare, "missing")):
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["result"] == "rejected" and body["code"] == "already_checked_in"
        assert body["checked_in_at"] and body["ticket_status"] == "checked_in"
        assert body["confirmation"] == state
    assert_untouched(factory, ticket, check_ins=1)


def test_other_statuses_and_missing_confirmation(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, _ = free_ticket(client, account, f)
    unclaimed, _ = free_ticket(client, account, f, recipient="friend@example.com")

    r = preview(client, f, scanner, qr_payload=qr_payload(settings, unclaimed["id"]))
    assert r.status_code == 200 and r.json()["code"] == "ticket_unclaimed"
    assert r.json()["result"] == "rejected"

    r = preview(client, f, scanner, qr_payload=ticket["qr_payload"])
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "rejected" and r.json()["code"] == "sign_in_required"
    assert r.json()["confirmation"] == "missing" and r.json()["ticket_status"] == "valid"

    with factory.begin() as db:
        db.get(Ticket, UUID(ticket["id"])).status = "cancelled"
    r = preview(client, f, scanner, qr_payload=ticket["qr_payload"])
    assert r.json()["code"] == "ticket_not_valid" and r.json()["ticket_status"] == "cancelled"

    closed = published(client, setup, factory, open_now=False)
    late, _ = free_ticket(client, account, closed)
    r = preview(client, closed, closed["headers"], qr_payload=late["qr_payload"])
    assert r.status_code == 200, r.text
    assert r.json()["code"] == "admission_not_open" and r.json()["ticket_id"] is None
    assert r.json()["confirmation"] is None


def test_confirmation_states(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    payload = ticket["qr_payload"]

    def state(**extra):
        r = preview(client, f, scanner, qr_payload=payload, **extra)
        assert r.status_code == 200, r.text
        return r.json()["confirmation"], r.json()["code"]

    old = code_of(confirm(client, buyer, ticket["id"]))
    new = code_of(confirm(client, buyer, ticket["id"]))  # supersedes the first
    assert state(entry_confirmation=old["token"]) == ("used", "confirmation_used")
    with factory.begin() as db:
        db.execute(
            update(EntryConfirmation)
            .where(EntryConfirmation.id == UUID(new["id"]))
            .values(
                created_at=now() - timedelta(seconds=60), expires_at=now() - timedelta(seconds=5)
            )
        )
    assert state(entry_confirmation=new["token"]) == ("expired", "confirmation_expired")

    again = code_of(confirm(client, buyer, ticket["id"]))
    with factory.begin() as db:
        row = db.get(EntryConfirmation, UUID(again["id"]))
        db.execute(
            update(AuthSession).where(AuthSession.id == row.session_id).values(revoked_at=now())
        )
    assert state(entry_confirmation=again["token"]) == ("sign_in_required", "sign_in_required")

    # Malformed input is still a 422, as for a real check-in.
    r = preview(client, f, scanner, qr_payload=payload, entry_confirmation="not-a-token")
    assert r.status_code == 422 and detail(r) == "invalid_confirmation"
    # A genuine token of another ticket is a verdict: 200 with invalid_confirmation.
    other, other_buyer = free_ticket(client, account, f)
    foreign = code_of(confirm(client, other_buyer, other["id"]))
    r = preview(client, f, scanner, qr_payload=payload, entry_confirmation=foreign["token"])
    assert r.status_code == 200 and r.json()["code"] == "invalid_confirmation"
    assert r.json()["confirmation"] == "invalid"
    # Both given is accepted like a check-in: the token wins over the code.
    both = preview(
        client,
        f,
        scanner,
        qr_payload=payload,
        entry_confirmation=old["token"],
        entry_code="12345678",
    )
    assert both.status_code == 200 and both.json()["confirmation"] == "used"
    assert_untouched(factory, ticket)


@pytest.mark.usefixtures("no_entry_confirmation")
def test_confirmation_not_required(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, _ = free_ticket(client, account, f)
    r = preview(client, f, scanner, qr_payload=ticket["qr_payload"])
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "would_admit" and r.json()["confirmation"] == "not_required"
    assert_untouched(factory, ticket)


def test_input_and_access_errors(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    attendees_only = staff(client, settings, account, f, ["attendees"])
    ticket, buyer = free_ticket(client, account, f)
    _, _, stranger = account()

    r = preview(client, f, scanner, qr_payload="https://biletflow.kz/e/promo?c=SPRING")
    assert r.status_code == 422 and detail(r) == "not_a_ticket_qr"
    r = preview(client, f, scanner, qr_payload=ticket["qr_payload"][:-4] + "abcd")
    assert r.status_code == 404 and detail(r) == "ticket_not_found"
    assert preview(client, f, scanner).status_code == 422
    r = preview(client, f, scanner, qr_payload=ticket["qr_payload"], ticket_id=ticket["id"])
    assert r.status_code == 422
    r = preview(client, f, scanner, qr_payload=ticket["qr_payload"], device_id=str(uuid4()))
    assert r.status_code == 404 and detail(r) == "device_not_found"

    other = published(client, setup, factory)
    r = preview(client, other, other["headers"], qr_payload=ticket["qr_payload"])
    assert r.status_code == 200 and r.json()["code"] == "wrong_event"
    assert r.json()["ticket_id"] is None and r.json()["attendee_name"] is None

    r = preview(client, f, attendees_only, qr_payload=ticket["qr_payload"])
    assert r.status_code == 403 and detail(r) == "permission_denied"
    r = preview(client, f, stranger, qr_payload=ticket["qr_payload"])
    assert r.status_code == 404 and detail(r) == "event_not_found"
    assert preview(client, f, {}, qr_payload=ticket["qr_payload"]).status_code == 401
    assert_untouched(factory, ticket)


def test_preview_is_rate_limited_per_account(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    body = {"ticket_id": str(uuid4())}
    codes = [preview(client, f, scanner, **body).status_code for _ in range(61)]
    assert codes[:60] == [404] * 60 and codes[60] == 429
    # Another account is not affected.
    assert preview(client, f, f["headers"], **body).status_code == 404


def conflict(client, setup, account, factory, settings, review=("scan",)):
    """Device A is admitted offline; device B's upload for the same ticket becomes a conflict."""
    f, scanner, dev, pkg = prepared(client, setup, account, factory, settings)
    second = staff(client, settings, account, f, list(review))
    dev2 = device(client, second).json()["id"]
    pkg2 = package(client, f, second, dev2).json()
    ticket, buyer = free_ticket(client, account, f)
    proof_a = code_of(confirm(client, buyer, ticket["id"]))
    proof_b = code_of(confirm(client, buyer, ticket["id"]))
    accepted = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket, proof_b)]))
    assert accepted[0]["status"] == "accepted"
    lost = results(upload(client, second, dev2, pkg2["package_id"], [op(1, ticket, proof_a)]))[0]
    assert lost["status"] == "conflict", lost
    return f, ticket, accepted[0]["check_in_id"], lost["conflict_id"], second


def test_conflict_review_can_reverse_the_existing_admission(
    client, setup, account, factory, settings
):
    f, ticket, check_in_id, conflict_id, _ = conflict(client, setup, account, factory, settings)
    url = API + f"/sync-conflicts/{conflict_id}/resolve"
    r = client.post(
        url,
        headers=f["headers"],
        json={
            "note": "Wrong guest scanned",
            "reverse_existing_check_in": True,
            "reversal_reason": "Admitted by mistake",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "resolved" and body["reversed_check_in_id"] == check_in_id
    assert body["existing_check_in"]["reversed_at"]
    with factory() as db:
        assert db.get(Ticket, UUID(ticket["id"])).status == "valid"
        assert db.get(CheckIn, UUID(check_in_id)).reversed_at is not None
        for action in ("admission.reversed", "admission.sync_conflict_resolved"):
            assert db.scalar(select(func.count(AuditLog.id)).where(AuditLog.action == action)) == 1
    # Without the flag, resolving still reports no reversal.
    plain = conflict(client, setup, account, factory, settings)
    r = client.post(
        API + f"/sync-conflicts/{plain[3]}/resolve",
        headers=plain[0]["headers"],
        json={"note": "ok"},
    )
    assert r.status_code == 200 and r.json()["reversed_check_in_id"] is None


def test_conflict_reversal_needs_permission_reason_and_an_open_admission(
    client, setup, account, factory, settings
):
    f, ticket, check_in_id, conflict_id, reviewer = conflict(
        client, setup, account, factory, settings, review=("scan", "attendees")
    )
    url = API + f"/sync-conflicts/{conflict_id}/resolve"
    base = {"note": "Checked at the gate", "reverse_existing_check_in": True}

    r = client.post(url, headers=reviewer, json={**base, "reversal_reason": "Mistake"})
    assert r.status_code == 403 and detail(r) == "permission_denied"
    stray = {"note": "n", "reversal_reason": "Mistake"}
    assert client.post(url, headers=f["headers"], json=stray).status_code == 422
    for bad in ({}, {"reversal_reason": "  "}, {"reversal_reason": "x" * 501}):
        r = client.post(url, headers=f["headers"], json={**base, **bad})
        assert r.status_code == 422, r.text
    with factory() as db:
        assert db.get(SyncConflict, UUID(conflict_id)).status == "open"
        assert db.get(CheckIn, UUID(check_in_id)).reversed_at is None
        assert db.get(Ticket, UUID(ticket["id"])).status == "checked_in"

    # Reversed elsewhere first: the conflict then stays open instead of half-resolving.
    undo = client.post(
        API + f"/scanner/check-ins/{check_in_id}/reverse",
        headers=f["headers"],
        json={"reason": "Wrong gate"},
    )
    assert undo.status_code == 200, undo.text
    r = client.post(url, headers=f["headers"], json={**base, "reversal_reason": "Mistake"})
    assert r.status_code == 409 and detail(r) == "already_reversed"
    with factory() as db:
        assert db.get(SyncConflict, UUID(conflict_id)).status == "open"


def test_conflict_without_existing_admission_cannot_be_reversed(
    client, setup, account, factory, settings
):
    f, _, _, conflict_id, _ = conflict(client, setup, account, factory, settings)
    with factory.begin() as db:
        db.execute(
            update(SyncConflict)
            .where(SyncConflict.id == UUID(conflict_id))
            .values(existing_check_in_id=None)
        )
    r = client.post(
        API + f"/sync-conflicts/{conflict_id}/resolve",
        headers=f["headers"],
        json={"note": "n", "reverse_existing_check_in": True, "reversal_reason": "Mistake"},
    )
    assert r.status_code == 409 and detail(r) == "no_admission_to_reverse"
