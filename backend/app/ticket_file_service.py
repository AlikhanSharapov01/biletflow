"""Stored ticket PDFs (BF-10): render once, keep in private storage, reuse for email and API."""

import contextlib
import hashlib
from uuid import uuid4

from sqlalchemy import select

from .checkout_models import Ticket
from .checkout_service import qr_payload, ticket_rows
from .file_models import StoredFile
from .security import now
from .ticket_pdf import render_ticket_pdf

PDF_STATES = ("valid", "checked_in")


def attachment_name(ticket_id):
    return f"biletflow-ticket-{ticket_id}.pdf"


def stored_ticket_pdf(db, storage, ticket):
    """The stored bytes for a valid ticket whose PDF is a clean file with a readable object.

    Checked-in tickets are never served from storage: the rendered status mark differs, so a
    stored copy would freeze it at "VALID". Any storage error means "render instead".
    """
    if ticket.status != "valid" or not ticket.pdf_file_id:
        return None
    stored = db.get(StoredFile, ticket.pdf_file_id)
    if not stored or stored.status != "clean":
        return None
    try:
        return storage.get(stored.object_key)
    except Exception:
        # No exception text is kept: storage errors may echo paths.
        return None


def ensure_ticket_pdf(factory, settings, storage, ticket_id):
    """Return (bytes, filename) for a valid ticket, storing the PDF on first use.

    Runs outside any outbox lease transaction: rendering and storage I/O must not hold row locks.
    Safe to call repeatedly and concurrently: one stored_file row per ticket, losers clean up.
    """
    with factory() as db:
        row = db.execute(ticket_rows(Ticket.id == ticket_id)).first()
        if not row or row[0].status != "valid":
            return None
        ticket, item, order = row
        name = attachment_name(ticket_id)
        existing = stored_ticket_pdf(db, storage, ticket)
        if existing is not None:
            return existing, name
        stored = db.get(StoredFile, ticket.pdf_file_id) if ticket.pdf_file_id else None
        data = render_ticket_pdf(
            ticket=ticket,
            item=item,
            snapshot=order.event_snapshot,
            payload=qr_payload(settings, ticket.id),
        )
        if stored:
            # Missing object (or a file no longer clean): rewrite the same key, keep the row.
            file_id, key, created = stored.id, stored.object_key, False
        else:
            file_id = uuid4()
            key, created = f"tickets/{ticket_id}/{file_id}.pdf", True
    try:
        storage.put(key, data)
        return write_row(factory, storage, ticket_id, file_id, key, data), name
    except BaseException:
        if created:
            # Never leave a brand-new object without a row; an existing key is not ours to drop.
            with contextlib.suppress(Exception):
                storage.delete(key)
        raise


def write_row(factory, storage, ticket_id, file_id, key, data):
    name = attachment_name(ticket_id)
    with factory.begin() as db:
        ticket = db.scalar(select(Ticket).where(Ticket.id == ticket_id).with_for_update())
        if ticket.pdf_file_id is None:
            db.add(
                StoredFile(
                    id=file_id,
                    uploaded_by_user_id=None,
                    object_key=key,
                    purpose="ticket_pdf",
                    mime_type="application/pdf",
                    original_filename=name,
                    size_bytes=len(data),
                    sha256=hashlib.sha256(data).hexdigest(),
                    status="clean",
                    scanned_at=now(),
                )
            )
            db.flush()
            ticket.pdf_file_id = file_id
        elif ticket.pdf_file_id != file_id:
            # Another worker stored a PDF first: drop our orphan object and serve theirs.
            winner = db.get(StoredFile, ticket.pdf_file_id)
            storage.delete(key)
            data = storage.get(winner.object_key)
        else:
            stored = db.get(StoredFile, file_id)
            stored.size_bytes, stored.sha256 = len(data), hashlib.sha256(data).hexdigest()
            stored.status, stored.scanned_at = "clean", now()
    return data
