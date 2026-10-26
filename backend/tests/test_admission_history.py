"""BF-20: organizer check-in history, CSV export and the attendee's admission status."""

import csv
import io
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update

from app.admission_models import CheckIn
from app.checkout_models import OrderItem, Ticket
from app.checkout_service import qr_payload
from app.models import AuditLog
from app.security import now
from tests.test_admission import API, free_ticket, published, scan, staff
from tests.test_offline import attendee, device, op, package, results, upload

pytestmark = pytest.mark.usefixtures("no_entry_confirmation")


def history(client, f, headers=None, **params):
    return client.get(
        API + f"/events/{f['event']['id']}/check-ins",
        headers=headers or f["headers"],
        params=params,
    )


def reverse(client, f, check_in_id, reason="Wrong person"):
    r = client.post(
        API + f"/scanner/check-ins/{check_in_id}/reverse",
        headers=f["headers"],
        json={"reason": reason},
    )
    assert r.status_code == 200, r.text


def named(factory, ticket, name):
    with factory.begin() as db:
        item_id = db.get(Ticket, UUID(ticket["id"])).order_item_id
        db.execute(update(OrderItem).where(OrderItem.id == item_id).values(recipient_name=name))


def admit(client, f, scanner, ticket, settings=None):
    # A ticket nominated to someone else carries no QR payload in the buyer's order response.
    payload = qr_payload(settings, UUID(ticket["id"])) if settings else ticket["qr_payload"]
    r = scan(client, f, scanner, payload)
    assert r.status_code == 200, r.text
    return r.json()["check_in_id"]


@pytest.fixture
def log(client, setup, account, factory, settings):
    """Two check-ins by one scanner; the first is reversed. Returns the data tests assert on."""
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    first, first_buyer = free_ticket(client, account, f)
    second, _ = free_ticket(client, account, f)
    named(factory, second, "Bota Zhaksylyk")
    one = admit(client, f, scanner, first)
    two = admit(client, f, scanner, second)
    reverse(client, f, one)
    return {
        "f": f,
        "scanner": scanner,
        "first": first,
        "buyer": first_buyer,
        "second": second,
        "one": one,
        "two": two,
    }


def test_history_lists_reversed_and_current_in_order(client, log, factory):
    f = log["f"]
    r = history(client, f)
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["total"], body["limit"], body["offset"]) == (2, 50, 0)
    one, two = body["items"]
    assert [one["check_in_id"], two["check_in_id"]] == [log["one"], log["two"]]
    assert one["attendee_name"] == "Aru Attendee" and two["attendee_name"] == "Bota Zhaksylyk"
    assert one["ticket_id"] == log["first"]["id"]
    assert one["ticket_type_name"] == "General admission" and one["seat"] is None
    assert one["source"] == "online" and one["device_label"] is None and one["operation_id"]
    assert one["scanner"]["id"] and one["scanner"]["display_name"]
    assert one["accepted_at"] and one["captured_at"]
    assert one["reversed_at"]
    assert one["reversal"]["reason"] == "Wrong person"
    assert one["reversal"]["actor"]["display_name"] and one["reversal"]["created_at"]
    assert two["reversed_at"] is None and two["reversal"] is None

    current = history(client, f, state="current").json()
    assert [i["check_in_id"] for i in current["items"]] == [log["two"]] and current["total"] == 1
    reversed_ = history(client, f, state="reversed").json()
    assert [i["check_in_id"] for i in reversed_["items"]] == [log["one"]]

    page = history(client, f, limit=1, offset=1).json()
    assert [i["check_in_id"] for i in page["items"]] == [log["two"]] and page["total"] == 2
    assert history(client, f, limit=0).status_code == 422
    assert history(client, f, limit=201).status_code == 422
    assert history(client, f, offset=-1).status_code == 422


def test_history_filters(client, log, factory):
    f = log["f"]
    assert history(client, f, source="offline_sync").json() == {
        "items": [],
        "total": 0,
        "limit": 50,
        "offset": 0,
    }
    assert history(client, f, source="online").json()["total"] == 2
    assert history(client, f, source="paper").status_code == 422

    assert [i["attendee_name"] for i in history(client, f, q="zhaks").json()["items"]] == [
        "Bota Zhaksylyk"
    ]
    assert history(client, f, q="nobody").json()["total"] == 0
    # LIKE wildcards in the search text are literal characters.
    assert history(client, f, q="B%").json()["total"] == 0
    assert history(client, f, q="B_ta").json()["total"] == 0
    assert history(client, f, q="a").status_code == 422

    assert history(client, f, ticket_type_id=f["ticket"]["id"]).json()["total"] == 2
    assert history(client, f, ticket_type_id=str(uuid4())).json()["total"] == 0

    with factory() as db:
        first, second = (db.get(CheckIn, UUID(log[k])).accepted_at for k in ("one", "two"))
    second_cut = second - timedelta(microseconds=1)
    assert first <= second_cut
    bounds = {"from": second.isoformat()}
    assert [i["check_in_id"] for i in history(client, f, **bounds).json()["items"]] == [log["two"]]
    assert [i["check_in_id"] for i in history(client, f, to=first.isoformat()).json()["items"]] == [
        log["one"]
    ]
    both = history(client, f, **{"from": first.isoformat(), "to": second.isoformat()})
    assert both.json()["total"] == 2
    future = (now() + timedelta(days=1)).isoformat()
    assert history(client, f, **{"from": future}).json()["total"] == 0
    bad = history(client, f, **{"from": second.isoformat(), "to": first.isoformat()})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_range"


def test_offline_check_in_shows_device_and_source(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    dev = device(client, scanner, label="Gate B tablet").json()["id"]
    pkg = package(client, f, scanner, dev).json()
    ticket, _ = attendee(client, account, f)
    sent = results(upload(client, scanner, dev, pkg["package_id"], [op(1, ticket)]))
    assert sent[0]["status"] == "accepted", sent

    items = history(client, f, source="offline_sync").json()["items"]
    assert len(items) == 1
    assert items[0]["source"] == "offline_sync" and items[0]["device_label"] == "Gate B tablet"
    assert items[0]["captured_at"] != items[0]["accepted_at"]
    assert history(client, f, source="online").json()["total"] == 0


def test_history_requires_attendees_capability(client, log, setup, account, settings):
    f = log["f"]
    # The scanner holds only `scan`: known to the event, but not allowed to read the log.
    denied = history(client, f, headers=log["scanner"])
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "permission_denied"
    csv_url = API + f"/events/{f['event']['id']}/check-ins.csv"
    assert client.get(csv_url, headers=log["scanner"]).status_code == 403

    reader = staff(client, settings, account, f, ["attendees"])
    allowed = history(client, f, headers=reader)
    assert allowed.status_code == 200 and allowed.json()["total"] == 2
    assert client.get(csv_url, headers=reader).status_code == 200

    _, _, stranger = account()
    missing = history(client, f, headers=stranger)
    assert missing.status_code == 404 and missing.json()["detail"]["code"] == "event_not_found"
    assert client.get(csv_url, headers=stranger).status_code == 404
    assert client.get(csv_url).status_code == 401
    assert client.get(API + f"/events/{f['event']['id']}/check-ins").status_code == 401


def test_csv_export_escapes_formulas_and_is_audited(client, log, factory):
    f = log["f"]
    named(factory, log["first"], '=HYPERLINK("x")')
    with factory.begin() as db:
        item_id = db.get(Ticket, UUID(log["second"]["id"])).order_item_id
        db.execute(
            update(OrderItem)
            .where(OrderItem.id == item_id)
            .values(seat_snapshot={"section_label": "A", "row_label": "3", "seat_label": "12"})
        )

    url = API + f"/events/{f['event']['id']}/check-ins.csv"
    r = client.get(url, headers=f["headers"])
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "text/csv; charset=utf-8"
    assert r.headers["content-disposition"] == (
        f'attachment; filename="check-ins-{f["event"]["id"]}.csv"'
    )
    assert r.content.startswith(b"\xef\xbb\xbf")
    text = r.content.decode("utf-8-sig")
    assert text.startswith('"check_in_id","ticket_id"') and "\r\n" in text
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0] == [
        "check_in_id",
        "ticket_id",
        "attendee_name",
        "ticket_type",
        "seat",
        "source",
        "accepted_at",
        "captured_at",
        "scanner",
        "device",
        "reversed_at",
        "reversal_reason",
        "reversed_by",
    ]
    assert len(rows) == 3
    one, two = (dict(zip(rows[0], row, strict=True)) for row in rows[1:])
    assert one["check_in_id"] == log["one"] and one["ticket_id"] == log["first"]["id"]
    assert one["attendee_name"] == '\'=HYPERLINK("x")'
    assert one["seat"] == "" and one["device"] == "" and one["source"] == "online"
    assert one["reversal_reason"] == "Wrong person" and one["reversed_by"] and one["reversed_at"]
    assert two["attendee_name"] == "Bota Zhaksylyk" and two["seat"] == "A-3-12"
    assert two["reversed_at"] == two["reversal_reason"] == two["reversed_by"] == ""
    assert two["accepted_at"].endswith("+00:00")

    # Filters apply to the export too.
    only = client.get(url, headers=f["headers"], params={"state": "current"})
    assert len(list(csv.reader(io.StringIO(only.content.decode("utf-8-sig"))))) == 2
    bad = client.get(url, headers=f["headers"], params={"q": "x"})
    assert bad.status_code == 422

    with factory() as db:
        audits = list(
            db.scalars(select(AuditLog).where(AuditLog.action == "admission.history_exported"))
        )
    assert len(audits) == 2
    assert audits[0].event_id == UUID(f["event"]["id"]) and audits[0].entity_type == "event"


def test_csv_export_refuses_more_than_the_cap(client, log, factory, monkeypatch):
    from app import admission_history_service

    monkeypatch.setattr(admission_history_service, "EXPORT_LIMIT", 1)
    f = log["f"]
    url = API + f"/events/{f['event']['id']}/check-ins.csv"
    r = client.get(url, headers=f["headers"])
    assert r.status_code == 413 and r.json()["detail"]["code"] == "export_too_large"
    # A narrower range fits and is exported.
    ok = client.get(url, headers=f["headers"], params={"state": "current"})
    assert ok.status_code == 200
    with factory() as db:
        count = len(
            list(
                db.scalars(select(AuditLog).where(AuditLog.action == "admission.history_exported"))
            )
        )
    assert count == 1


def test_attendee_sees_own_admission_status(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    scanner = staff(client, settings, account, f, ["scan"])
    recipient_email, _, recipient = account()
    ticket, buyer = free_ticket(client, account, f, recipient=recipient_email)
    _, _, stranger = account()
    url = API + f"/tickets/{ticket['id']}/admission"

    r = client.get(url, headers=buyer)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ticket_id"] == ticket["id"] and body["status"] == "valid"
    assert body["checked_in_at"] is None and body["reversed_at"] is None
    assert body["admission_window"]["opens_at"] and body["admission_window"]["closes_at"]

    # The recipient sees it only after claiming the ticket; a stranger never can.
    assert client.get(url, headers=recipient).status_code == 404
    assert client.post(API + "/tickets/claim", headers=recipient).json() == {"claimed": 1}
    assert client.get(url, headers=recipient).status_code == 200
    gone = client.get(url, headers=stranger)
    assert gone.status_code == 404 and gone.json()["detail"]["code"] == "ticket_not_found"
    assert client.get(url).status_code == 401

    check_in = admit(client, f, scanner, ticket, settings)
    with factory() as db:
        accepted = db.get(CheckIn, UUID(check_in)).accepted_at
    admitted = client.get(url, headers=buyer).json()
    assert admitted["status"] == "checked_in" and admitted["reversed_at"] is None
    assert datetime.fromisoformat(admitted["checked_in_at"]) == accepted

    reverse(client, f, check_in)
    undone = client.get(url, headers=buyer).json()
    assert undone["status"] == "valid" and undone["checked_in_at"] is None
    assert undone["reversed_at"]

    # A new admission replaces the reversal in what the attendee sees.
    again = admit(client, f, scanner, ticket, settings)
    final = client.get(url, headers=recipient).json()
    assert final["status"] == "checked_in" and final["checked_in_at"] and again != check_in
    assert final["reversed_at"] is None
