"""Print-ready A4 ticket PDF (BF-10).

Pure black on white so it survives grayscale printing. The document carries only the
canonical ticket QR (the same payload the web ticket shows) and public ticket facts: no
price, payment or card data.
"""

import io
import logging
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.graphics.barcode import qrencoder
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

QUIET_MODULES = 4
QR_BOX = 320  # points, quiet zone included (about 113 mm)
# DejaVu Sans 2.37 ships with the code (app/fonts, see fonts/LICENSE), so every install renders
# Kazakh and Russian text the same way. Distribution font directories are only a fallback.
FONT_DIRS = [
    Path(__file__).resolve().parent / "fonts",
    Path("/usr/share/fonts/truetype/dejavu"),
    Path("/usr/share/fonts/dejavu"),
    Path("/usr/share/fonts/TTF"),
]
FONT_UNAVAILABLE = "ticket_pdf_font_unavailable"


class TicketFontUnavailable(RuntimeError):
    """No Unicode font could be loaded: refuse to render rather than print corrupted text."""


@lru_cache(maxsize=1)
def fonts():
    """Register DejaVu Sans (covers Kazakh and Russian Cyrillic) and return (regular, bold).

    There is deliberately no Latin-1 fallback: built-in Helvetica would turn Kazakh and Russian
    attendee or event names into "?". Failures are not cached, so a repaired install recovers.
    """
    for directory in FONT_DIRS:
        regular, bold = directory / "DejaVuSans.ttf", directory / "DejaVuSans-Bold.ttf"
        if not (regular.is_file() and bold.is_file()):
            continue
        try:
            pdfmetrics.registerFont(TTFont("BiletFlowSans", str(regular)))
            pdfmetrics.registerFont(TTFont("BiletFlowSans-Bold", str(bold)))
        except Exception:
            logger.warning("Unreadable ticket PDF font in %s; trying the next location", directory)
            continue
        return "BiletFlowSans", "BiletFlowSans-Bold"
    logger.error(
        "%s: no readable DejaVuSans.ttf and DejaVuSans-Bold.ttf pair in %s; ticket PDFs are "
        "not rendered until the bundled app/fonts directory is restored",
        FONT_UNAVAILABLE,
        ", ".join(str(d) for d in FONT_DIRS),
    )
    raise TicketFontUnavailable(FONT_UNAVAILABLE)


def qr_matrix(payload):
    code = qrencoder.QRCode(None, qrencoder.QRErrorCorrectLevel.M)
    code.addData(payload)
    code.make()
    count = code.getModuleCount()
    return [[code.isDark(r, c) for c in range(count)] for r in range(count)]


def event_times(snapshot):
    zone = ZoneInfo(snapshot["time_zone"])
    starts = datetime.fromisoformat(snapshot["starts_at"]).astimezone(zone)
    ends = datetime.fromisoformat(snapshot["ends_at"]).astimezone(zone)
    offset = starts.strftime("%z")
    offset = f"UTC{offset[:3]}:{offset[3:]}"
    span = f"{starts:%H:%M} - {ends:%H:%M}"
    if ends.date() != starts.date():
        span = f"{starts:%H:%M} - {ends:%d %b %H:%M}"
    return f"{starts:%A, %d %B %Y}", f"{span} ({snapshot['time_zone']}, {offset})"


def render_ticket_pdf(*, ticket, item, snapshot, payload):
    regular, bold = fonts()
    buffer = io.BytesIO()
    width, height = A4
    # The initial font is DejaVu too, so the page references no Latin-1-only font at all.
    pdf = canvas.Canvas(buffer, pagesize=A4, invariant=1, initialFontName=regular)
    pdf.setTitle(f"Ticket {ticket.id}")
    pdf.setAuthor("BiletFlow")
    pdf.setFillGray(0)
    pdf.setStrokeGray(0)
    left = 40
    text_width = width - 2 * left
    y = height - 50

    pdf.setFont(bold, 12)
    pdf.drawString(left, y, "BiletFlow")
    pdf.drawRightString(
        width - left, y, "VALID" if ticket.status == "valid" else "VALID (checked in)"
    )
    pdf.setLineWidth(1.5)
    pdf.line(left, y - 8, width - left, y - 8)
    y -= 42

    pdf.setFont(bold, 26)
    for line in simpleSplit(str(snapshot["title"]), bold, 26, text_width)[:3]:
        pdf.drawString(left, y, line)
        y -= 32
    day, span = event_times(snapshot)
    pdf.setFont(bold, 14)
    pdf.drawString(left, y - 4, day)
    pdf.setFont(regular, 13)
    pdf.drawString(left, y - 24, span)
    y -= 54

    rows = [("Venue", f"{snapshot['venue_name']}, {snapshot['venue_city']}")]
    seat = item.seat_snapshot
    if seat:
        rows.append(
            (
                "Seat",
                f"Section {seat['section_label']}, row {seat['row_label']}, seat {seat['seat_label']}",
            )
        )
    rows += [("Ticket type", item.ticket_type_name), ("Attendee", item.recipient_name)]
    for label, value in rows:
        pdf.setFont(regular, 10)
        pdf.drawString(left, y, label.upper())
        pdf.setFont(bold, 14)
        lines = simpleSplit(str(value), bold, 14, text_width - 110)[:2]
        for number, line in enumerate(lines):
            pdf.drawString(left + 110, y - number * 17, line)
        y -= 17 * len(lines) + 9

    # QR with a four-module quiet zone, drawn as plain black squares on white.
    matrix = qr_matrix(payload)
    count = len(matrix)
    module = QR_BOX / (count + 2 * QUIET_MODULES)
    box_x = (width - QR_BOX) / 2
    box_y = y - 20 - QR_BOX
    pdf.addLiteral("% qr-begin")
    pdf.setFillGray(1)
    pdf.rect(box_x, box_y, QR_BOX, QR_BOX, stroke=0, fill=1)
    pdf.setFillGray(0)
    origin_x = box_x + QUIET_MODULES * module
    origin_y = box_y + QR_BOX - QUIET_MODULES * module
    for r, row in enumerate(matrix):
        for c, dark in enumerate(row):
            if dark:
                pdf.rect(origin_x + c * module, origin_y - (r + 1) * module, module, module, 0, 1)
    pdf.addLiteral("% qr-end")
    pdf.setLineWidth(0.75)
    pdf.rect(box_x - 2, box_y - 2, QR_BOX + 4, QR_BOX + 4, stroke=1, fill=0)

    y = box_y - 28
    pdf.setFont(regular, 10)
    pdf.drawString(left, y, "TICKET ID")
    pdf.setFont(bold, 12)
    pdf.drawString(left + 110, y, str(ticket.id))
    pdf.setFont(regular, 8.5)
    notes = [
        "Entry requires this ticket's QR code together with the ticket holder's signed-in "
        "BiletFlow account. A printed copy alone is not sufficient.",
        "Every copy of this PDF identifies the same single ticket. Do not share it: anyone "
        "holding the QR code can attempt entry, but it admits one person once.",
    ]
    y -= 24
    for note in notes:
        for line in simpleSplit(note, regular, 8.5, text_width):
            pdf.drawString(left, y, line)
            y -= 11
        y -= 3
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
