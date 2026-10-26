"""BF-17: iCalendar export and add-to-calendar links.

The export reads only existing event columns. UID is event.calendar_uid and SEQUENCE is
event.calendar_sequence, so repeated exports keep one identity and an edited or cancelled
event is recognised by calendar clients as a newer version of the same entry.
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

from sqlalchemy import exists, select

from .catalog_models import AccessGrant, Venue
from .catalog_service import event_caps
from .checkout_models import Ticket, TicketOrder
from .security import fail

PRODID = "-//BiletFlow//Event calendar//EN"
UTC = timezone.utc


def holds_ticket(db, user, event):
    """True for a ticket recipient or order buyer of this event (any ticket status)."""
    return bool(
        db.scalar(
            select(
                exists().where(Ticket.event_id == event.id, Ticket.recipient_user_id == user.id)
                | exists().where(
                    TicketOrder.event_id == event.id,
                    TicketOrder.buyer_user_id == user.id,
                    TicketOrder.status != "pending",
                )
            )
        )
    )


def calendar_event(db, user, event):
    """Raise event_not_found unless this viewer may export the event.

    Staff of the event always may. Ticket holders may export every state except a draft, so a
    cancellation still reaches them. Everyone else needs a published, unmoderated event; private
    events additionally need an access grant. Anonymous visitors get public events only.
    """
    if user and event_caps(db, user, event):
        return
    if user and event.publication_state != "draft" and holds_ticket(db, user, event):
        return
    if event.publication_state != "published" or event.moderation_state != "normal":
        fail("event_not_found", 404)
    if event.visibility == "public":
        return
    if not user:
        fail("event_not_found", 404)
    if event.visibility == "private" and not db.scalar(
        select(AccessGrant.id).where(
            AccessGrant.event_id == event.id,
            AccessGrant.user_id == user.id,
            AccessGrant.revoked_at.is_(None),
        )
    ):
        fail("event_not_found", 404)


def is_public(event):
    return (
        event.visibility == "public"
        and event.publication_state == "published"
        and event.moderation_state == "normal"
    )


def event_url(settings, event):
    return f"{settings.frontend_url.rstrip('/')}/events/{event.id}"


def location(venue):
    return ", ".join(part for part in (venue.name, venue.address, venue.city) if part)


def description_text(settings, event):
    return f"{event.description}\n\n{event_url(settings, event)}".strip()


def escape(value):
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def fold(line):
    """Fold at 75 octets without splitting a UTF-8 sequence (RFC 5545 section 3.1)."""
    if len(line.encode()) <= 75:
        return [line]
    parts, current, size = [], "", 0
    for char in line:
        width = len(char.encode())
        if size + width > (75 if not parts else 74):
            parts.append(current)
            current, size = "", 0
        current += char
        size += width
    parts.append(current)
    return [parts[0], *(" " + part for part in parts[1:])]


def utc_stamp(value):
    return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def local_stamp(value, zone):
    return value.astimezone(zone).strftime("%Y%m%dT%H%M%S")


def offset_text(delta):
    total = int(delta.total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    return f"{sign}{total // 3600:02d}{total % 3600 // 60:02d}"


def timezone_component(zone_name, start, end):
    """VTIMEZONE with explicit observances for the years the event spans.

    zoneinfo exposes no rule table, so transitions are found by scanning, which also stays
    correct for zones that dropped DST (Asia/Almaty has been fixed at +05 since 2024).
    """
    zone = ZoneInfo(zone_name)
    first = datetime(start.astimezone(zone).year, 1, 1, tzinfo=UTC)
    last = datetime(end.astimezone(zone).year + 1, 1, 1, tzinfo=UTC)
    points = [(first, first.astimezone(zone))]
    cursor = first
    while cursor < last:
        following = cursor + timedelta(days=1)
        if following.astimezone(zone).utcoffset() != cursor.astimezone(zone).utcoffset():
            probe = cursor
            while probe.astimezone(zone).utcoffset() == cursor.astimezone(zone).utcoffset():
                probe += timedelta(minutes=15)
            points.append((probe, probe.astimezone(zone)))
        cursor = following
    lines = ["BEGIN:VTIMEZONE", f"TZID:{zone_name}"]
    previous = None
    for instant, local in points:
        offset = local.utcoffset()
        before = previous if previous is not None else offset
        daylight = bool(local.dst())
        lines += [
            "BEGIN:DAYLIGHT" if daylight else "BEGIN:STANDARD",
            f"DTSTART:{local.replace(tzinfo=None).strftime('%Y%m%dT%H%M%S')}",
            f"TZOFFSETFROM:{offset_text(before)}",
            f"TZOFFSETTO:{offset_text(offset)}",
            f"TZNAME:{local.tzname()}",
            "END:DAYLIGHT" if daylight else "END:STANDARD",
        ]
        previous = offset
    lines.append("END:VTIMEZONE")
    return lines


def build_ics(settings, event, venue):
    zone = ZoneInfo(event.time_zone)
    cancelled = event.publication_state == "cancelled"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        *timezone_component(event.time_zone, event.starts_at, event.ends_at),
        "BEGIN:VEVENT",
        f"UID:{event.calendar_uid}",
        f"SEQUENCE:{event.calendar_sequence}",
        f"DTSTAMP:{utc_stamp(event.updated_at)}",
        f"CREATED:{utc_stamp(event.created_at)}",
        f"LAST-MODIFIED:{utc_stamp(event.updated_at)}",
        f"DTSTART;TZID={event.time_zone}:{local_stamp(event.starts_at, zone)}",
        f"DTEND;TZID={event.time_zone}:{local_stamp(event.ends_at, zone)}",
        f"SUMMARY:{escape(event.title)}",
        f"DESCRIPTION:{escape(description_text(settings, event))}",
        f"LOCATION:{escape(location(venue))}",
        f"URL:{event_url(settings, event)}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
        "TRANSP:OPAQUE",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(folded for line in lines for folded in fold(line)) + "\r\n"


def service_links(settings, event, venue):
    start, end = event.starts_at.astimezone(UTC), event.ends_at.astimezone(UTC)
    details = description_text(settings, event)[:1000]
    google = "https://calendar.google.com/calendar/render?" + urlencode(
        {
            "action": "TEMPLATE",
            "text": event.title,
            "dates": f"{utc_stamp(start)}/{utc_stamp(end)}",
            "ctz": event.time_zone,
            "details": details,
            "location": location(venue),
        },
        quote_via=quote,
    )
    outlook = {
        "path": "/calendar/action/compose",
        "rru": "addevent",
        "subject": event.title,
        "startdt": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "enddt": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "body": details,
        "location": location(venue),
    }
    return {
        "google": google,
        "outlook": "https://outlook.live.com/calendar/0/deeplink/compose?"
        + urlencode(outlook, quote_via=quote),
        "office365": "https://outlook.office.com/calendar/0/deeplink/compose?"
        + urlencode(outlook, quote_via=quote),
    }


def venue_of(db, event):
    return db.get(Venue, event.venue_id)
