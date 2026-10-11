from uuid import UUID, uuid4

from sqlalchemy import func, select, update

from app.admission_models import CheckIn
from app.catalog_models import Event
from tests.test_admission import API, free_ticket, published, scan, staff


def set_event(factory, f, **values):
    with factory.begin() as db:
        db.execute(update(Event).where(Event.id == UUID(f["event"]["id"])).values(**values))


def test_unpublished_cancelled_and_suspended_events_report_admission_closed(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    ticket, _ = free_ticket(client, account, f)

    set_event(factory, f, moderation_state="suspended")
    for headers in (scanner, f["headers"]):
        r = scan(client, f, headers, ticket["qr_payload"])
        assert r.status_code == 409 and r.json()["detail"]["code"] == "admission_closed"
    set_event(factory, f, moderation_state="normal")

    r = client.post(API + f"/events/{f['event']['id']}/unpublish", headers=f["headers"])
    assert r.status_code == 200, r.text
    for headers in (scanner, f["headers"]):
        r = scan(client, f, headers, ticket["qr_payload"])
        assert r.status_code == 409 and r.json()["detail"]["code"] == "admission_closed"
    with factory() as db:
        assert db.scalar(select(func.count(CheckIn.id))) == 0

    # An unauthorized caller still learns nothing about the event.
    _, _, stranger = account()
    assert scan(client, f, stranger, ticket["qr_payload"]).status_code == 404

    other = published(client, setup, factory)
    r = client.post(API + f"/events/{other['event']['id']}/cancel", headers=other["headers"])
    assert r.status_code == 200, r.text
    r = scan(client, other, other["headers"], ticket["qr_payload"])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "admission_closed"


def test_revoked_staff_and_members_lose_scanner_access(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    scanner = staff(client, settings, account, f, ["scan", "reverse_checkin"])
    admitted = scan(client, f, scanner, ticket["qr_payload"])
    assert admitted.status_code == 200

    event_id = f["event"]["id"]
    assignments = client.get(API + f"/events/{event_id}/staff", headers=f["headers"])
    assert assignments.status_code == 200, assignments.text
    staff_id = assignments.json()[0]["id"]
    r = client.delete(API + f"/events/{event_id}/staff/{staff_id}", headers=f["headers"])
    assert r.status_code == 200, r.text

    assert client.get(API + "/scanner/events", headers=scanner).json() == []
    assert scan(client, f, scanner, ticket["qr_payload"]).status_code == 404
    assert (
        client.get(API + f"/scanner/events/{event_id}/counts", headers=scanner).status_code == 404
    )
    r = client.post(
        API + f"/scanner/check-ins/{admitted.json()['check_in_id']}/reverse",
        headers=scanner,
        json={"reason": "revoked"},
    )
    assert r.status_code == 404


def test_replay_of_a_reversed_admission_is_not_reported_as_admitted(
    client, setup, account, factory, settings
):
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    operation = str(uuid4())
    first = scan(client, f, f["headers"], ticket["qr_payload"], operation_id=operation).json()
    url = API + f"/scanner/check-ins/{first['check_in_id']}/reverse"
    assert client.post(url, headers=f["headers"], json={"reason": "mistake"}).status_code == 200
    counts = client.get(API + f"/scanner/events/{f['event']['id']}/counts", headers=f["headers"])
    assert counts.json()["admitted"] == 0

    again = scan(client, f, f["headers"], ticket["qr_payload"], operation_id=operation)
    # Never "admitted" for a reversed admission, and never a server error.
    assert again.status_code == 409, again.text
    assert again.json()["detail"]["code"] == "operation_conflict"
    # A fresh operation id still re-admits the ticket.
    fresh = scan(client, f, f["headers"], ticket["qr_payload"], operation_id=str(uuid4()))
    assert fresh.status_code == 200 and fresh.json()["check_in_id"] != first["check_in_id"]


def test_reversal_does_not_reveal_check_ins_to_outsiders(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    ticket, _ = free_ticket(client, account, f)
    admitted = scan(client, f, f["headers"], ticket["qr_payload"]).json()
    _, _, stranger = account()
    real = client.post(
        API + f"/scanner/check-ins/{admitted['check_in_id']}/reverse",
        headers=stranger,
        json={"reason": "probe"},
    )
    missing = client.post(
        API + f"/scanner/check-ins/{uuid4()}/reverse", headers=stranger, json={"reason": "probe"}
    )
    assert real.status_code == missing.status_code == 404
    assert real.json() == missing.json()
    with factory() as db:
        assert db.scalar(select(CheckIn.reversed_at)) is None
