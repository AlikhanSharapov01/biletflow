"""Print-ready A4 ticket PDF (BF-10).

Pure black on white so it survives grayscale printing. The document carries only the
canonical ticket QR (the same payload the web ticket shows) and public ticket facts: no
price, payment or card data.
"""

import io
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

QUIET_MODULES = 4
QR_BOX = 320  # points, quiet zone included (about 113 mm)
FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/usr/share/fonts/TTF",
]


@lru_cache(maxsize=1)
def fonts():
    """DejaVu covers Kazakh/Russian; fall back to built-in Helvetica (Latin-1 only)."""
    for directory in FONT_DIRS:
        regular, bold = Path(directory, "DejaVuSans.ttf"), Path(directory, "DejaVuSans-Bold.ttf")
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont("BiletFlowSans", str(regular)))
            pdfmetrics.registerFont(TTFont("BiletFlowSans-Bold", str(bold)))
            return "BiletFlowSans", "BiletFlowSans-Bold", True
    return "Helvetica", "Helvetica-Bold", False


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
    regular, bold, unicode_ok = fonts()

    def clean(value):
        value = str(value)
        return value if unicode_ok else value.encode("latin-1", "replace").decode("latin-1")

    buffer = io.BytesIO()
    width, height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4, invariant=1)
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
    for line in simpleSplit(clean(snapshot["title"]), bold, 26, text_width)[:3]:
        pdf.drawString(left, y, line)
        y -= 32
    day, span = event_times(snapshot)
    pdf.setFont(bold, 14)
    pdf.drawString(left, y - 4, clean(day))
    pdf.setFont(regular, 13)
    pdf.drawString(left, y - 24, clean(span))
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
        lines = simpleSplit(clean(value), bold, 14, text_width - 110)[:2]
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
