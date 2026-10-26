"""BF-11 remainder: signed-in attendee entry confirmation and manual attendee search."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.admission_models import CheckIn
from app.config import Settings
from app.models import AuthSession
from app.offline_models import EntryConfirmation
from app.security import now
from app.signing import ENTRY_PURPOSE, b64, canonical, entry_token, read_entry_token, sign
from tests.test_admission import API, free_ticket, published, scan, staff


def confirm(client, headers, ticket_id):
    return client.post(API + f"/tickets/{ticket_id}/entry-confirmations", headers=headers)


def code_of(r):
    assert r.status_code == 201, r.text
    return r.json()


def detail(r):
    return r.json()["detail"]["code"]


def test_checkin_requires_confirmation_and_consumes_it_once(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan", "reverse_checkin"])
    ticket, buyer = free_ticket(client, account, f)
    payload = ticket["qr_payload"]

    r = scan(client, f, scanner, payload)
    assert r.status_code == 409 and detail(r) == "sign_in_required"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0

    first = code_of(confirm(client, buyer, ticket["id"]))
    assert first["token"].startswith("biletflow:entry:") and len(first["code"]) == 8
    assert 0 < first["expires_in_seconds"] <= 120 and first["ticket_id"] == ticket["id"]

    operation = str(uuid4())
    r = scan(client, f, scanner, payload, entry_confirmation=first["token"], operation_id=operation)
    assert r.status_code == 200, r.text
    check_in_id = r.json()["check_in_id"]
    with factory() as db:
        row = db.get(CheckIn, UUID(check_in_id))
        assert row.entry_confirmation_id == UUID(first["id"])
        assert db.get(EntryConfirmation, UUID(first["id"])).consumed_at is not None

    # A retry of the very same request still returns the original admission (idempotent).
    again = scan(
        client, f, scanner, payload, entry_confirmation=first["token"], operation_id=operation
    )
    assert again.status_code == 200 and again.json()["replayed"] is True
    # Without the operation id, the used ticket reports already_checked_in before anything else.
    dup = scan(client, f, scanner, payload, entry_confirmation=first["token"])
    assert dup.status_code == 409 and detail(dup) == "already_checked_in"

    # A ticket that is checked in cannot ask for a new confirmation.
    r = confirm(client, buyer, ticket["id"])
    assert r.status_code == 409 and detail(r) == "already_checked_in"

    # After a reversal the old confirmation is spent: re-admission needs a fresh one.
    undo = client.post(
        API + f"/scanner/check-ins/{check_in_id}/reverse",
        headers=f["headers"],
        json={"reason": "Wrong gate"},
    )
    assert undo.status_code == 200, undo.text
    r = scan(client, f, scanner, payload, entry_confirmation=first["token"])
    assert r.status_code == 409 and detail(r) == "confirmation_used"
    r = scan(client, f, scanner, payload)
    assert r.status_code == 409 and detail(r) == "sign_in_required"
    second = code_of(confirm(client, buyer, ticket["id"]))
    r = scan(client, f, scanner, payload, entry_confirmation=second["token"])
    assert r.status_code == 200 and r.json()["check_in_id"] != check_in_id
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 2


def test_printed_ticket_code_and_replacement(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    other, other_buyer = free_ticket(client, account, f)
    payload = ticket["qr_payload"]

    old = code_of(confirm(client, buyer, ticket["id"]))
    new = code_of(confirm(client, buyer, ticket["id"]))
    assert old["id"] != new["id"]
    r = scan(client, f, scanner, payload, entry_code=old["code"])
    assert r.status_code == 409 and detail(r) == "confirmation_used"  # superseded
    wrong = "00000000" if new["code"] != "00000000" else "11111111"
    r = scan(client, f, scanner, payload, entry_code=wrong)
    assert r.status_code == 422 and detail(r) == "invalid_confirmation"
    # Another ticket's code never works here, even if it is genuine.
    foreign = code_of(confirm(client, other_buyer, other["id"]))
    r = scan(client, f, scanner, payload, entry_code=foreign["code"])
    assert r.status_code == 422 and detail(r) == "invalid_confirmation"
    r = scan(client, f, scanner, payload, entry_code="12ab")
    assert r.status_code == 422
    r = scan(client, f, scanner, payload, entry_code=new["code"])
    assert r.status_code == 200, r.text


def test_expired_forged_and_cross_purpose_tokens(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    other, other_buyer = free_ticket(client, account, f)
    payload = ticket["qr_payload"]
    mine = code_of(confirm(client, buyer, ticket["id"]))
    theirs = code_of(confirm(client, other_buyer, other["id"]))

    tampered = mine["token"][:-3] + ("AAA" if not mine["token"].endswith("AAA") else "BBB")
    for bad in (
        tampered,
        ticket["qr_payload"],  # a ticket QR is not an entry confirmation
        "biletflow:entry:not-a-token",
        "x" * 50,
    ):
        r = scan(client, f, scanner, payload, entry_confirmation=bad)
        assert r.status_code == 422 and detail(r) == "invalid_confirmation", bad
    # Genuine token, wrong ticket.
    r = scan(client, f, scanner, payload, entry_confirmation=theirs["token"])
    assert r.status_code == 409 and detail(r) == "invalid_confirmation"
    # Signed with another purpose's key: forged from the server's point of view.
    claims = read_entry_token(settings, mine["token"])
    body = canonical(claims)
    cross = f"biletflow:entry:{b64(body)}.{sign(settings, 'offline_package', body)}"
    r = scan(client, f, scanner, payload, entry_confirmation=cross)
    assert r.status_code == 422 and detail(r) == "invalid_confirmation"
    # An entry token is not a ticket QR either.
    r = scan(client, f, scanner, mine["token"])
    assert r.status_code == 422 and detail(r) == "not_a_ticket_qr"

    with factory.begin() as db:
        db.execute(
            update(EntryConfirmation)
            .where(EntryConfirmation.id == UUID(mine["id"]))
            .values(
                created_at=now() - timedelta(minutes=5), expires_at=now() - timedelta(minutes=3)
            )
        )
    for kwargs in ({"entry_confirmation": mine["token"]}, {"entry_code": mine["code"]}):
        r = scan(client, f, scanner, payload, **kwargs)
        assert r.status_code == 409 and detail(r) == "confirmation_expired"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0
        assert db.get(EntryConfirmation, UUID(mine["id"])).consumed_at is None


def test_only_signed_in_recipient_obtains_confirmation(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    ticket, buyer = free_ticket(client, account, f)
    unclaimed, friend_buyer = free_ticket(client, account, f, recipient="friend@example.com")
    _, _, stranger = account()
    scanner = staff(client, settings, account, f, ["scan"])

    assert client.post(API + f"/tickets/{ticket['id']}/entry-confirmations").status_code == 401
    for headers in (stranger, scanner, f["headers"]):
        r = confirm(client, headers, ticket["id"])
        assert r.status_code == 404 and detail(r) == "ticket_not_found"
    # The buyer of a ticket that was given to someone else is not its attendee.
    r = confirm(client, friend_buyer, unclaimed["id"])
    assert r.status_code == 404
    assert confirm(client, buyer, str(uuid4())).status_code == 404

    with factory.begin() as db:
        from app.checkout_models import Ticket

        db.get(Ticket, UUID(ticket["id"])).status = "refunded"
    r = confirm(client, buyer, ticket["id"])
    assert r.status_code == 409 and detail(r) == "ticket_not_valid"
    with factory() as db:
        assert db.scalar(select(func.count(EntryConfirmation.id))) == 0


def test_attendee_sign_out_invalidates_confirmation(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))
    with factory.begin() as db:
        db.execute(
            update(AuthSession)
            .values(revoked_at=now())
            .where(AuthSession.id == db.get(EntryConfirmation, UUID(proof["id"])).session_id)
        )
    r = scan(client, f, scanner, ticket["qr_payload"], entry_confirmation=proof["token"])
    assert r.status_code == 409 and detail(r) == "sign_in_required"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0


def test_one_confirmation_admits_once_under_race(client, setup, account, factory, settings, app):
    f = published(client, setup, factory)
    scanners = [f["headers"], staff(client, settings, account, f, ["scan"])]
    ticket, buyer = free_ticket(client, account, f)
    proof = code_of(confirm(client, buyer, ticket["id"]))

    def go(headers):
        with TestClient(app) as other:
            r = scan(other, f, headers, ticket["qr_payload"], entry_confirmation=proof["token"])
            return r.status_code, None if r.status_code == 200 else detail(r)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = sorted(pool.map(go, scanners))
    assert results[0] == (200, None) and results[1][0] == 409
    assert results[1][1] in ("already_checked_in", "confirmation_used")
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 1
        assert db.get(EntryConfirmation, UUID(proof["id"])).consumed_at is not None


def test_failed_confirmation_leaves_ticket_admittable(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, buyer = free_ticket(client, account, f)
    r = scan(client, f, scanner, ticket["qr_payload"], entry_code="00000000")
    assert r.status_code == 422
    proof = code_of(confirm(client, buyer, ticket["id"]))
    assert (
        scan(client, f, scanner, ticket["qr_payload"], entry_code=proof["code"]).status_code == 200
    )


def test_setting_off_restores_unconfirmed_admission(client, setup, account, factory, settings, app):
    app.state.settings.admission_require_entry_confirmation = False
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    assert scan(client, f, f["headers"], ticket["qr_payload"]).status_code == 200
    assert (
        Settings(
            _env_file=None,
            database_url=settings.database_url,
            jwt_secret="j" * 48,
            challenge_secret="c" * 48,
        ).admission_require_entry_confirmation
        is True
    )


def test_manual_search_minimal_data_and_same_rules(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    attendees_only = staff(client, settings, account, f, ["attendees"])
    _, _, stranger = account()
    ticket, buyer = free_ticket(client, account, f)
    url = API + f"/scanner/events/{f['event']['id']}/attendees"

    assert client.get(url, params={"q": "aru"}).status_code == 401
    assert client.get(url, params={"q": "aru"}, headers=stranger).status_code == 404
    assert client.get(url, params={"q": "aru"}, headers=attendees_only).status_code == 403
    assert client.get(url, params={"q": "a"}, headers=scanner).status_code == 422

    hits = client.get(url, params={"q": "aru att"}, headers=scanner)
    assert hits.status_code == 200, hits.text
    assert hits.json() == [
        {
            "ticket_id": ticket["id"],
            "attendee_name": "Aru Attendee",
            "ticket_type_name": "General admission",
            "seat": None,
            "status": "valid",
            "claimed": True,
            "checked_in": False,
            "check_in_id": None,
        }
    ]
    # Wildcards are literal, so a scanner cannot dump the list with "%%".
    assert client.get(url, params={"q": "%%"}, headers=scanner).json() == []
    assert client.get(url, params={"q": "nobody"}, headers=scanner).json() == []

    # Manual check-in is the same admission: it still needs the attendee's confirmation.
    check = API + f"/scanner/events/{f['event']['id']}/check-ins"
    both = {"ticket_id": ticket["id"], "qr_payload": ticket["qr_payload"]}
    assert client.post(check, headers=scanner, json=both).status_code == 422
    assert client.post(check, headers=scanner, json={}).status_code == 422
    r = client.post(check, headers=scanner, json={"ticket_id": ticket["id"]})
    assert r.status_code == 409 and detail(r) == "sign_in_required"
    proof = code_of(confirm(client, buyer, ticket["id"]))
    r = client.post(
        check, headers=scanner, json={"ticket_id": ticket["id"], "entry_code": proof["code"]}
    )
    assert r.status_code == 200, r.text
    hit = client.get(url, params={"q": "aru"}, headers=scanner).json()[0]
    assert hit["checked_in"] is True and hit["check_in_id"] == r.json()["check_in_id"]
    # A ticket of another event is not found through this event's check-in.
    other = published(client, setup, factory)
    foreign, _ = free_ticket(client, account, other)
    r = client.post(check, headers=scanner, json={"ticket_id": foreign["id"]})
    assert r.status_code == 404 and detail(r) == "ticket_not_found"
    # Search never crosses events.
    assert client.get(url, params={"q": "aru"}, headers=other["headers"]).status_code == 404


def test_token_helpers_roundtrip(settings):
    token = entry_token(settings, {"cid": "x"})
    assert read_entry_token(settings, token) == {"cid": "x"}
    assert read_entry_token(settings, token[:-2] + "zz") is None
    assert ENTRY_PURPOSE == "entry_confirmation"
