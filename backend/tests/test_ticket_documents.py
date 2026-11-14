import io
import logging
import re
from datetime import timedelta
from pathlib import Path
from uuid import UUID

import pytest
from pypdf import PdfReader
from reportlab.graphics.barcode import qrencoder
from reportlab.pdfbase import pdfmetrics
from sqlalchemy import func, select, update

from app import ticket_pdf
from app.catalog_models import Event, TicketType
from app.checkout_models import Ticket
from app.checkout_service import qr_payload
from app.models import AuditLog, OutboxJob
from app.security import digest, now
from app.worker import deliver_once

API = "/api/v1"


def published(client, setup):
    f = setup()
    r = client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert r.status_code == 200, r.text
    return f


def buy(client, f, account, recipient=None, name="Aru Attendee"):
    email, _, headers = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={"items": [{"ticket_type_id": f["ticket"]["id"], "quantity": 1}]},
    )
    assert held.status_code == 201, held.text
    body = {
        "recipients": [
            {
                "allocation_id": held.json()["allocations"][0]["id"],
                "name": name,
                "email": recipient or email,
            }
        ]
    }
    order = client.post(API + f"/holds/{held.json()['id']}/confirm", headers=headers, json=body)
    assert order.status_code == 200, order.text
    return order.json()["items"][0]["ticket"], headers, email


def pdf_text(content):
    reader = PdfReader(io.BytesIO(content))
    assert len(reader.pages) == 1
    return reader.pages[0], "\n".join(page.extract_text() for page in reader.pages)


def drawn_modules(page):
    """Rebuild the QR grid from the filled squares in the page content stream."""
    stream = page.get_contents().get_data().decode("latin-1")
    section = stream[stream.index("% qr-begin") : stream.index("% qr-end")]
    squares = [
        tuple(float(v) for v in m.groups())
        for m in re.finditer(r"([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re", section)
    ]
    box_x, box_y, box, _ = squares[0]  # white background including the quiet zone
    modules = squares[1:]
    size = modules[0][2]
    assert all(abs(w - size) < 1e-3 and abs(h - size) < 1e-3 for _, _, w, h in modules)
    quiet = 4 * size
    cells = {
        (round((box_y + box - quiet - (y + size)) / size), round((x - box_x - quiet) / size))
        for x, y, _, _ in modules
    }
    return cells, size


def expected_modules(payload):
    code = qrencoder.QRCode(None, qrencoder.QRErrorCorrectLevel.M)
    code.addData(payload)
    code.make()
    count = code.getModuleCount()
    return {(r, c) for r in range(count) for c in range(count) if code.isDark(r, c)}, count


def test_pdf_is_a4_valid_and_qr_matches_canonical_payload(client, setup, account, settings):
    f = published(client, setup)
    ticket, headers, email = buy(client, f, account)
    r = client.get(API + f"/tickets/{ticket['id']}/pdf", headers=headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert (
        "attachment" in r.headers["content-disposition"]
        and ticket["id"] in (r.headers["content-disposition"])
    )
    assert r.headers["cache-control"] == "no-store"
    assert r.content.startswith(b"%PDF-")
    page, text = pdf_text(r.content)
    assert (round(float(page.mediabox.width)), round(float(page.mediabox.height))) == (595, 842)
    for expected in ("Campus Concert", "General admission", "Aru Attendee", ticket["id"]):
        assert expected in text, text
    assert re.search(r"\((Asia|Europe|UTC)[A-Za-z/_]*, UTC[+-]\d\d:\d\d\)", text), text
    assert "VALID" in text and "NOT VALID" not in text
    # Never print the QR token as text and never include payment/price data.
    assert qr_payload(settings, ticket["id"]) not in text
    assert "KZT" not in text and "Payment" not in text

    # The drawn QR is the canonical payload and nothing else.
    cells, count = expected_modules(ticket["qr_payload"])
    assert ticket["qr_payload"] == qr_payload(settings, UUID(ticket["id"]))
    drawn, size = drawn_modules(page)
    assert drawn == cells
    assert size * (count + 8) >= 300  # large: about 110 mm square with its quiet zone

    # Pure black and white: grayscale-safe, no colour operators.
    stream = page.get_contents().get_data().decode("latin-1")
    for r, g, b, _ in re.findall(r"([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)", stream):
        assert r == g == b

    # Downloading twice returns the same ticket and never rotates the token.
    again = client.get(API + f"/tickets/{ticket['id']}/pdf", headers=headers)
    assert again.status_code == 200
    assert drawn_modules(pdf_text(again.content)[0])[0] == cells
    with client.app.state.sessions() as db:
        row = db.get(Ticket, UUID(ticket["id"]))
        assert row.token_version == 1
        assert row.qr_token_hash == digest(ticket["qr_payload"].removeprefix("biletflow:ticket:"))


def test_pdf_keeps_unicode_attendee_names(client, setup, account):
    f = published(client, setup)
    ticket, headers, _ = buy(client, f, account, name="Zhanar Қасымова")
    _, text = pdf_text(client.get(API + f"/tickets/{ticket['id']}/pdf", headers=headers).content)
    assert "Қасымова" in text  # Unicode names survive


KAZAKH_LETTERS = "әғқңөұүһі"


def test_pdf_keeps_kazakh_and_russian_event_and_attendee_text(client, setup, account, factory):
    """Every Kazakh-specific letter, in both cases, survives in event and attendee text."""
    f = published(client, setup)
    title = f"Түнгі концерт {KAZAKH_LETTERS}"
    ticket_type = "Входной билет, партер"
    with factory.begin() as db:
        db.execute(update(Event).where(Event.id == UUID(f["event"]["id"])).values(title=title))
        db.execute(
            update(TicketType)
            .where(TicketType.id == UUID(f["ticket"]["id"]))
            .values(name=ticket_type)
        )
    name = f"Ажар Қасымова {KAZAKH_LETTERS.upper()}"
    ticket, headers, _ = buy(client, f, account, name=name)
    r = client.get(API + f"/tickets/{ticket['id']}/pdf", headers=headers)
    assert r.status_code == 200, r.text
    page, text = pdf_text(r.content)
    for expected in (title, ticket_type, name):
        assert expected in text, text
    assert "?" not in text  # no Latin-1 replacement anywhere
    fonts = {str(font["/BaseFont"]) for font in page["/Resources"]["/Font"].values()}
    assert fonts and all("DejaVuSans" in font for font in fonts), fonts  # embedded, not Helvetica


def test_pdf_refused_with_stable_code_when_no_unicode_font(
    client, setup, account, monkeypatch, tmp_path, caplog
):
    """Without a Unicode font no PDF is produced: never one with "?" for Cyrillic text."""
    f = published(client, setup)
    ticket, headers, _ = buy(client, f, account, name="Zhanar Қасымова")
    url = API + f"/tickets/{ticket['id']}/pdf"
    bundled = ticket_pdf.FONT_DIRS
    monkeypatch.setattr(ticket_pdf, "FONT_DIRS", [tmp_path])  # an empty directory
    ticket_pdf.fonts.cache_clear()
    try:
        with caplog.at_level(logging.ERROR, logger="app.ticket_pdf"):
            r = client.get(url, headers=headers)
        assert r.status_code == 503, r.text
        assert r.json() == {"detail": {"code": "ticket_pdf_unavailable"}}
        assert b"%PDF" not in r.content
        assert ticket_pdf.FONT_UNAVAILABLE in caplog.text
        with pytest.raises(ticket_pdf.TicketFontUnavailable):
            ticket_pdf.fonts()

        # The failure is not cached: once the font is back, the same request succeeds.
        monkeypatch.setattr(ticket_pdf, "FONT_DIRS", bundled)
        again = client.get(url, headers=headers)
        assert again.status_code == 200, again.text
        assert "Қасымова" in pdf_text(again.content)[1]
    finally:
        ticket_pdf.fonts.cache_clear()


def test_bundled_font_is_used_without_system_fonts(monkeypatch):
    """The checked-in DejaVu pair alone is enough on any OS and covers Kazakh letters."""
    bundled = Path(ticket_pdf.__file__).resolve().parent / "fonts"
    assert (bundled / "LICENSE").is_file()
    monkeypatch.setattr(ticket_pdf, "FONT_DIRS", [bundled])
    ticket_pdf.fonts.cache_clear()
    try:
        regular, bold = ticket_pdf.fonts()
        letters = KAZAKH_LETTERS + KAZAKH_LETTERS.upper() + "ЁёЩщЪъЫыЭэ"
        for name in (regular, bold):
            glyphs = pdfmetrics.getFont(name).face.charToGlyph
            assert [c for c in letters if ord(c) not in glyphs] == [], name
    finally:
        ticket_pdf.fonts.cache_clear()


def test_pdf_authorization_is_recipient_only(client, setup, account, factory):
    f = published(client, setup)
    friend_email, _, friend = account()
    ticket, buyer, _ = buy(client, f, account, recipient=friend_email)
    _, _, stranger = account()
    url = API + f"/tickets/{ticket['id']}/pdf"
    # Not yet claimed: the buyer holds the order but is not the recipient.
    assert client.get(url, headers=buyer).status_code == 404
    assert client.get(url, headers=stranger).status_code == 404
    assert client.get(url, headers=f["headers"]).status_code == 404  # organizer
    assert client.get(url).status_code == 401
    assert client.post(API + "/tickets/claim", headers=friend).json() == {"claimed": 1}
    assert client.get(url, headers=friend).status_code == 200
    assert client.get(url, headers=buyer).status_code == 404
    assert client.get(API + "/tickets/not-a-uuid/pdf", headers=friend).status_code == 422


def test_pdf_refused_for_invalid_tickets(client, setup, account, factory):
    f = published(client, setup)
    ticket, headers, _ = buy(client, f, account)
    url = API + f"/tickets/{ticket['id']}/pdf"
    for status in ("refund_pending", "refunded", "cancelled"):
        with factory.begin() as db:
            db.execute(update(Ticket).where(Ticket.id == UUID(ticket["id"])).values(status=status))
        r = client.get(url, headers=headers)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "ticket_not_valid", status
    with factory.begin() as db:
        db.execute(
            update(Ticket).where(Ticket.id == UUID(ticket["id"])).values(status="checked_in")
        )
    assert client.get(url, headers=headers).status_code == 200


def test_delivery_status_for_buyer_and_recipient(client, setup, account, factory, settings):
    f = published(client, setup)
    friend_email, _, friend = account()
    ticket, buyer, _ = buy(client, f, account, recipient=friend_email)
    _, _, stranger = account()
    url = API + f"/tickets/{ticket['id']}/delivery"
    r = client.get(url, headers=buyer)
    assert r.status_code == 200, r.text
    view = r.json()
    assert view["status"] == "queued" and view["resend_count"] == 0
    assert view["ticket_id"] == ticket["id"] and view["recipient_email"] == friend_email
    assert "qr_payload" not in view
    assert client.get(url, headers=stranger).status_code == 404
    assert client.get(url, headers=f["headers"]).status_code == 404
    sent = []
    while deliver_once(factory, settings, send=sent.append):
        pass
    assert client.get(url, headers=buyer).json()["status"] == "delivered"
    client.post(API + "/tickets/claim", headers=friend)
    assert client.get(url, headers=friend).json()["status"] == "delivered"
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "ticket_delivery_email")
            .values(
                status="dead",
                completed_at=None,
                last_error="email_delivery_failed",
                created_at=now() - timedelta(hours=1),
            )
        )
    failed = client.get(url, headers=buyer).json()
    assert failed["status"] == "failed" and failed["can_resend"] is True


def test_resend_enqueues_one_audited_job_without_rotating_token(
    client, setup, account, factory, settings
):
    f = published(client, setup)
    ticket, buyer, email = buy(client, f, account)
    url = API + f"/tickets/{ticket['id']}/delivery/resend"
    sent = []
    while deliver_once(factory, settings, send=sent.append):
        pass
    assert len(sent) == 1
    with factory.begin() as db:
        db.execute(update(OutboxJob).values(created_at=now() - timedelta(hours=1)))

    # Cooldown protects against repeated resends of an already delivered ticket.
    r = client.post(url, headers=buyer)
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "queued" and r.json()["resend_count"] == 1
    assert r.json()["can_resend"] is False
    again = client.post(url, headers=buyer)
    assert again.status_code == 429 and again.json()["detail"]["code"] == "resend_too_soon"
    with factory() as db:
        jobs = list(db.scalars(select(OutboxJob).where(OutboxJob.kind == "ticket_delivery_email")))
        assert len(jobs) == 2
        assert {j.payload["ticket_id"] for j in jobs} == {ticket["id"]}
        assert db.scalar(select(func.count(Ticket.id))) == 1
        row = db.get(Ticket, UUID(ticket["id"]))
        assert row.token_version == 1
        assert row.qr_token_hash == digest(ticket["qr_payload"].removeprefix("biletflow:ticket:"))
        assert (
            db.scalar(
                select(func.count(AuditLog.id)).where(AuditLog.action == "ticket.delivery_resent")
            )
            == 1
        )

    while deliver_once(factory, settings, send=sent.append):
        pass
    assert len(sent) == 2
    body = sent[1].get_body().get_content()
    assert sent[1]["To"] == email
    assert f"/tickets/{ticket['id']}" in body and "biletflow:ticket:" not in body
    assert "token" not in body.lower()
    # The ticket QR is unchanged after the resend.
    fresh = client.get(API + f"/tickets/{ticket['id']}", headers=buyer).json()
    assert fresh["qr_payload"] == ticket["qr_payload"]


def test_resend_authorization_state_and_limits(client, setup, account, factory):
    f = published(client, setup)
    friend_email, _, friend = account()
    ticket, buyer, _ = buy(client, f, account, recipient=friend_email)
    _, _, stranger = account()
    url = API + f"/tickets/{ticket['id']}/delivery/resend"
    assert client.post(url).status_code == 401
    assert client.post(url, headers=stranger).status_code == 404
    assert client.post(url, headers=f["headers"]).status_code == 404
    # The original job was just queued; the cooldown stops an immediate duplicate.
    r = client.post(url, headers=buyer)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "resend_too_soon"

    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "ticket_delivery_email")
            .values(status="done", completed_at=now(), created_at=now() - timedelta(hours=1))
        )
    r = client.post(url, headers=friend)  # unclaimed recipient is not yet linked
    assert r.status_code == 404
    assert client.post(url, headers=buyer).status_code == 202

    # Hard cap on resends per ticket.
    for number in range(2, 20):
        with factory.begin() as db:
            db.execute(
                update(OutboxJob)
                .where(OutboxJob.kind == "ticket_delivery_email")
                .values(status="done", completed_at=now(), created_at=now() - timedelta(hours=1))
            )
        r = client.post(url, headers=buyer)
        if r.status_code != 202:
            assert r.status_code == 429 and r.json()["detail"]["code"] == "resend_limit_reached"
            assert number > 3
            break
    else:
        raise AssertionError("resend cap never applied")

    with factory.begin() as db:
        db.execute(update(Ticket).where(Ticket.id == UUID(ticket["id"])).values(status="refunded"))
    r = client.post(url, headers=buyer)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ticket_not_valid"
