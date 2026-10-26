import re
from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import update

from app.calendar_service import build_ics, escape, fold
from app.catalog_models import Event
from app.config import Settings

API = "/api/v1"


def published(client, setup, **options):
    f = setup(**options)
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text
    return f


def ics_fields(text):
    unfolded = text.replace("\r\n ", "")
    return dict(re.findall(r"^([A-Z-]+(?:;[^:\r]+)?):([^\r]*)\r?$", unfolded, flags=re.M))


def shifted(data):
    result = dict(data)
    for key in ("starts_at", "ends_at", "admission_opens_at", "admission_closes_at"):
        result[key] = (datetime.fromisoformat(data[key]) + timedelta(hours=1)).isoformat()
    return result


def test_public_export_is_tokenless_with_stable_identity_and_zone(client, setup):
    f = published(client, setup)
    eid = f["event"]["id"]
    r = client.get(API + f"/events/{eid}/calendar.ics")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/calendar")
    assert "attachment" in r.headers["content-disposition"]
    assert "\r\n" in r.text and r.text.startswith("BEGIN:VCALENDAR\r\n")
    fields = ics_fields(r.text)
    assert fields["UID"] == f["event"]["calendar_uid"]
    assert fields["SEQUENCE"] == "0" and fields["STATUS"] == "CONFIRMED"
    zone = ZoneInfo("Asia/Almaty")
    starts = datetime.fromisoformat(f["event"]["starts_at"]).astimezone(zone)
    assert fields["DTSTART;TZID=Asia/Almaty"] == starts.strftime("%Y%m%dT%H%M%S")
    assert "BEGIN:VTIMEZONE" in r.text and "TZOFFSETTO:+0500" in r.text
    assert fields["SUMMARY"] == "Campus Concert"
    assert fields["LOCATION"].startswith("BiletFlow Demo Hall")
    assert fields["URL"].endswith(f"/events/{eid}")
    # Repeated exports are byte-identical.
    assert client.get(API + f"/events/{eid}/calendar.ics").text == r.text
    assert "Bearer" not in r.text and "token" not in r.text.lower()


def test_update_and_cancel_keep_uid_and_raise_sequence(client, setup):
    f = published(client, setup)
    eid, headers = f["event"]["id"], f["headers"]
    first = ics_fields(client.get(API + f"/events/{eid}/calendar.ics").text)
    moved = shifted(f["data"])
    assert client.put(API + f"/events/{eid}", headers=headers, json=moved).status_code == 200
    second = ics_fields(client.get(API + f"/events/{eid}/calendar.ics").text)
    assert second["UID"] == first["UID"] and int(second["SEQUENCE"]) > int(first["SEQUENCE"])
    assert second["DTSTART;TZID=Asia/Almaty"] != first["DTSTART;TZID=Asia/Almaty"]
    assert client.post(API + f"/events/{eid}/cancel", headers=headers).status_code == 200
    # The public no longer sees a cancelled event; staff still get the cancellation.
    assert client.get(API + f"/events/{eid}/calendar.ics").status_code == 404
    r = client.get(API + f"/events/{eid}/calendar.ics", headers=headers)
    third = ics_fields(r.text)
    assert third["STATUS"] == "CANCELLED" and third["UID"] == first["UID"]
    assert int(third["SEQUENCE"]) > int(second["SEQUENCE"])


def test_draft_is_staff_only(client, setup, account):
    f = setup()
    eid = f["event"]["id"]
    url = API + f"/events/{eid}/calendar.ics"
    assert client.get(url).status_code == 404
    assert client.get(url, headers=account()[2]).status_code == 404
    assert client.get(url, headers=f["headers"]).status_code == 200
    missing = client.get(API + "/events/00000000-0000-0000-0000-000000000000/calendar.ics")
    assert missing.status_code == 404
    assert missing.json() == {"detail": {"code": "event_not_found"}}


def test_unlisted_and_private_visibility(client, setup, account):
    unlisted = published(client, setup, visibility="unlisted")
    url = API + f"/events/{unlisted['event']['id']}/calendar.ics"
    assert client.get(url).status_code == 404  # no tokenless URL for non-public events
    assert client.get(url, headers=account()[2]).status_code == 200

    private = published(client, setup, visibility="private")
    eid = private["event"]["id"]
    url = API + f"/events/{eid}/calendar.ics"
    _, _, other = account()
    assert client.get(url).status_code == 404
    assert client.get(url, headers=other).status_code == 404
    uid = client.get(API + "/me", headers=other).json()["id"]
    client.put(API + f"/events/{eid}/access", headers=private["headers"], json={"user_id": uid})
    assert client.get(url, headers=other).status_code == 200
    client.delete(API + f"/events/{eid}/access/{uid}", headers=private["headers"])
    assert client.get(url, headers=other).status_code == 404


def test_invalid_bearer_is_rejected(client, setup):
    f = published(client, setup)
    r = client.get(
        API + f"/events/{f['event']['id']}/calendar.ics", headers={"Authorization": "Bearer junk"}
    )
    assert r.status_code == 401


def test_service_links(client, setup, account):
    f = published(client, setup)
    eid = f["event"]["id"]
    r = client.get(API + f"/events/{eid}/calendar-links")
    assert r.status_code == 200, r.text
    links = r.json()
    assert links["google"].startswith("https://calendar.google.com/calendar/render?action=TEMPLATE")
    assert "Campus%20Concert" in links["google"] and "ctz=Asia%2FAlmaty" in links["google"]
    starts = datetime.fromisoformat(f["event"]["starts_at"]).strftime("%Y%m%dT%H%M%SZ")
    assert starts in links["google"]
    assert links["outlook"].startswith("https://outlook.live.com/calendar/0/deeplink/compose?")
    assert links["office365"].startswith("https://outlook.office.com/")
    assert links["ics_requires_sign_in"] is False
    assert links["ics_path"] == f"/api/v1/events/{eid}/calendar.ics"
    assert "token" not in "".join(v for v in links.values() if isinstance(v, str)).lower()
    unlisted = published(client, setup, visibility="unlisted")
    path = API + f"/events/{unlisted['event']['id']}/calendar-links"
    assert client.get(path).status_code == 404
    r = client.get(path, headers=account()[2])
    assert r.status_code == 200 and r.json()["ics_requires_sign_in"] is True
    client.post(API + f"/events/{eid}/cancel", headers=f["headers"])
    r = client.get(API + f"/events/{eid}/calendar-links", headers=f["headers"])
    assert r.status_code == 409 and r.json() == {"detail": {"code": "event_cancelled"}}


def test_ticket_holder_keeps_access_after_unpublish(client, setup, account):
    f = published(client, setup)
    eid = f["event"]["id"]
    email, _, buyer = account()
    held = client.post(
        API + f"/events/{eid}/holds",
        headers=buyer,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
    ).json()
    body = {
        "recipients": [{"allocation_id": held["allocations"][0]["id"], "name": "B", "email": email}]
    }
    confirm = client.post(API + f"/holds/{held['id']}/confirm", headers=buyer, json=body)
    assert confirm.status_code == 200, confirm.text
    client.post(API + f"/events/{eid}/unpublish", headers=f["headers"])
    url = API + f"/events/{eid}/calendar.ics"
    assert client.get(url, headers=buyer).status_code == 200
    assert client.get(url, headers=account()[2]).status_code == 404
    assert client.get(url).status_code == 404


def test_moderated_event_hidden_from_non_staff(client, setup, app):
    f = published(client, setup)
    with app.state.sessions.begin() as db:
        db.execute(update(Event).values(moderation_state="suspended"))
    assert client.get(API + f"/events/{f['event']['id']}/calendar.ics").status_code == 404


def test_timezone_conversion_across_dst_and_escaping():
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://x:y@localhost/z",
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
    )
    event = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        calendar_uid="abc@biletflow",
        calendar_sequence=3,
        title="Concert; with, specials \\ and Жеті " * 4,
        description="Line one\nLine two",
        publication_state="published",
        time_zone="America/New_York",
        starts_at=datetime.fromisoformat("2027-03-14T12:00:00+00:00"),
        ends_at=datetime.fromisoformat("2027-03-14T14:00:00+00:00"),
        created_at=datetime.fromisoformat("2027-01-01T00:00:00+00:00"),
        updated_at=datetime.fromisoformat("2027-02-01T10:30:00+00:00"),
    )
    venue = SimpleNamespace(name="Hall", address="1 Main St", city="NYC")
    text = build_ics(settings, event, venue)
    fields = ics_fields(text)
    # 12:00 UTC on 14 March 2027 is after the US spring-forward: UTC-4.
    assert fields["DTSTART;TZID=America/New_York"] == "20270314T080000"
    assert "BEGIN:STANDARD" in text and "BEGIN:DAYLIGHT" in text
    assert "TZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400" in text
    assert fields["DTSTAMP"] == "20270201T103000Z" and fields["SEQUENCE"] == "3"
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))
    assert "\\;" in text and "\\," in text and "\\n" in text


def test_escape_and_fold_helpers():
    assert escape("a;b,c\\d\ne") == "a\\;b\\,c\\\\d\\ne"
    value = "X:" + "Ж" * 100
    lines = fold(value)
    assert all(len(part.encode()) <= 75 for part in lines)
    rebuilt = lines[0] + "".join(part[1:] for part in lines[1:])
    assert rebuilt == value
