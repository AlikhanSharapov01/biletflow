"""Stored ticket PDFs (BF-10): render once, keep in private storage, reuse for email and API.

Object lifecycle (#68; BF-22, AC-26/27). Storage writes cannot join a PostgreSQL transaction, so
every new object follows write intent -> object -> reference:

1. `reserve` commits a `pending` stored_file row (the write intent) with a `cleanup_after`
   deadline before any byte is written. A process stop after this point leaves a row the worker
   can find, never an untracked object.
2. `storage.put` writes the object under the reserved key, outside any transaction.
3. `write_row` locks the ticket and the intent row, then either finalizes the intent (`clean`,
   referenced by `ticket.pdf_file_id`) or, when another writer already won, tombstones it.

When step 2 or 3 raises, the commit outcome is unknown (a lost COMMIT acknowledgement looks like
any other error). `_resolve_failed_write` re-reads the intent in a fresh transaction under a row
lock, which waits for any in-flight transaction on that row to finish. A committed, referenced
object is kept and served; only an unreferenced pending/deleted intent is fenced as `deleted`
and its object removed. If the check itself fails, nothing is deleted and the worker's
`reconcile_ticket_pdfs` pass removes the intent after its grace period.

No storage I/O ever happens while a row lock is held: candidates are claimed in a short
transaction, the locks are released, the claim is re-checked, and only then are objects deleted.
"""

import hashlib
import logging
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import case, exists, select, update

from .checkout_models import Ticket
from .checkout_service import qr_payload, ticket_rows
from .file_models import EventMedia, StoredFile, SupportAttachment
from .security import now
from .ticket_pdf import render_ticket_pdf

PDF_STATES = ("valid", "checked_in")
# A write intent older than this is abandoned: rendering and one object write take milliseconds.
WRITE_GRACE = timedelta(hours=1)
# A claimed tombstone is retried after this delay if its delete fails or the worker stops.
CLEANUP_RETRY = timedelta(minutes=5)
# One last idempotent delete this long after the intent, for a stalled writer that resumes late.
LATE_WRITE_CHECK = timedelta(hours=24)
CLEANUP_BATCH = 50
logger = logging.getLogger(__name__)


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
    Safe to call repeatedly and concurrently: one referenced clean stored_file per ticket; losing
    writers tombstone their own intent and serve the winner's object.
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
        previous_id = ticket.pdf_file_id
        if stored and stored.status == "clean":
            # Missing object under a clean, referenced row: rewrite the same key, keep the row.
            file_id, key, created = stored.id, stored.object_key, False
        else:
            # No row, or a retired one (never resurrected): a new file and key; the old row stays.
            file_id = uuid4()
            key, created = f"tickets/{ticket_id}/{file_id}.pdf", True
    if created:
        # Raises before any object exists; a lost acknowledgement leaves only a pending row.
        reserve(factory, ticket_id, file_id, key, data)
    try:
        storage.put(key, data)
        return write_row(factory, storage, ticket_id, file_id, key, data, previous_id), name
    except BaseException as exc:
        # An existing referenced key is never ours to drop.
        if created and _resolve_failed_write(factory, storage, file_id):
            if isinstance(exc, Exception):
                # The finalizing commit landed; only its acknowledgement was lost.
                return data, name
        raise


def reserve(factory, ticket_id, file_id, key, data):
    """Commit the write intent before the object exists (status pending, cleanup scheduled)."""
    with factory.begin() as db:
        db.add(
            StoredFile(
                id=file_id,
                uploaded_by_user_id=None,
                object_key=key,
                purpose="ticket_pdf",
                mime_type="application/pdf",
                original_filename=attachment_name(ticket_id),
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                status="pending",
                cleanup_after=now() + WRITE_GRACE,
            )
        )


def write_row(factory, storage, ticket_id, file_id, key, data, previous_id=None):
    """Finalize this writer's object as the ticket's PDF, or yield to an earlier winner."""
    winner_key = None
    abandoned = False
    with factory.begin() as db:
        ticket = db.scalar(select(Ticket).where(Ticket.id == ticket_id).with_for_update())
        stored = db.scalar(select(StoredFile).where(StoredFile.id == file_id).with_for_update())
        if ticket.pdf_file_id == file_id:
            # Rewrite of the referenced key: refresh its checksum.
            stored.size_bytes, stored.sha256 = len(data), hashlib.sha256(data).hexdigest()
            stored.status, stored.scanned_at, stored.cleanup_after = "clean", now(), None
        elif ticket.pdf_file_id not in (None, previous_id):
            # Another writer stored a PDF first: tombstone our intent, read theirs after unlock.
            winner_key = db.get(StoredFile, ticket.pdf_file_id).object_key
            if stored.status == "pending":
                stored.status, stored.cleanup_after = "deleted", now() + CLEANUP_RETRY
            abandoned = True
        elif stored.status != "pending":
            # The reconcile pass fenced this intent (a writer stalled past the grace period).
            # It can never become clean; serve the rendered bytes without storing them.
            abandoned = True
        else:
            stored.size_bytes, stored.sha256 = len(data), hashlib.sha256(data).hexdigest()
            stored.status, stored.scanned_at, stored.cleanup_after = "clean", now(), None
            ticket.pdf_file_id = file_id
    if abandoned:
        # Outside the row locks; the fenced status and a fresh reference check gate the delete.
        _delete_and_settle(factory, storage, [file_id])
    if winner_key:
        return storage.get(winner_key)
    return data


def _unreferenced():
    """No ticket, gallery image or support attachment points at the stored_file row."""
    return (
        ~exists(select(Ticket.id).where(Ticket.pdf_file_id == StoredFile.id))
        & ~exists(select(EventMedia.id).where(EventMedia.file_id == StoredFile.id))
        & ~exists(select(SupportAttachment.id).where(SupportAttachment.file_id == StoredFile.id))
    )


def _resolve_failed_write(factory, storage, file_id):
    """After an error, settle the commit outcome before touching the object.

    Returns True when the intent is committed as the ticket's clean PDF (keep and serve it).
    Otherwise deletes the object only after a positively acknowledged fence commit.
    """
    try:
        with factory.begin() as db:
            # The lock waits for an in-flight finalizing transaction to commit or roll back.
            stored = db.scalar(select(StoredFile).where(StoredFile.id == file_id).with_for_update())
            if stored is None:
                return False
            if not db.scalar(select(_unreferenced()).where(StoredFile.id == file_id)):
                return stored.status == "clean"
            if stored.status not in ("pending", "deleted"):
                return False
            stored.status, stored.cleanup_after = "deleted", now() + CLEANUP_RETRY
        # Returning from the block means the fence commit was acknowledged.
        _delete_and_settle(factory, storage, [file_id])
    except Exception:
        # No exception text is kept. The pending intent stays scheduled for the worker.
        logger.warning("Ticket PDF write outcome unverified; cleanup deferred to reconciliation")
    return False


def _delete_and_settle(factory, storage, file_ids):
    """Delete fenced objects with no lock held, then record the outcome.

    Re-checks that each row is still a deleted, unreferenced ticket PDF right before deleting.
    A successful delete leaves one final check at created_at + LATE_WRITE_CHECK (or none once
    that has passed); a failed one keeps the CLEANUP_RETRY schedule set by the claim.
    """
    if not file_ids:
        return 0
    with factory() as db:
        keys = db.execute(
            select(StoredFile.id, StoredFile.object_key).where(
                StoredFile.id.in_(file_ids),
                StoredFile.purpose == "ticket_pdf",
                StoredFile.status == "deleted",
                _unreferenced(),
            )
        ).all()
    deleted = []
    for file_id, key in keys:
        try:
            storage.delete(key)
            deleted.append(file_id)
        except Exception:
            logger.warning("Ticket PDF cleanup failed; durable retry remains scheduled")
    if deleted:
        final = StoredFile.created_at + LATE_WRITE_CHECK
        try:
            with factory.begin() as db:
                db.execute(
                    update(StoredFile)
                    .where(StoredFile.id.in_(deleted), StoredFile.status == "deleted")
                    .values(cleanup_after=case((final > now(), final), else_=None))
                )
        except Exception:
            logger.warning("Ticket PDF cleanup not recorded; the retry delete is idempotent")
    return len(deleted)


def reconcile_ticket_pdfs(factory, storage, batch_size=CLEANUP_BATCH):
    """Worker pass: remove abandoned ticket PDF writes whose cleanup time has come.

    Claims at most `batch_size` due, unreferenced pending/deleted rows in one short transaction
    (fencing pending intents as deleted so they can never be finalized), then deletes their
    objects after the locks are released. Clean or referenced files are never selected.
    """
    current = now()
    with factory.begin() as db:
        files = list(
            db.scalars(
                select(StoredFile)
                .where(
                    StoredFile.purpose == "ticket_pdf",
                    StoredFile.status.in_(["pending", "deleted"]),
                    StoredFile.cleanup_after.is_not(None),
                    StoredFile.cleanup_after <= current,
                    _unreferenced(),
                )
                .order_by(StoredFile.cleanup_after, StoredFile.id)
                .limit(max(1, min(batch_size, CLEANUP_BATCH)))
                .with_for_update(skip_locked=True)
            )
        )
        claimed = []
        for file in files:
            file.status, file.cleanup_after = "deleted", current + CLEANUP_RETRY
            claimed.append(file.id)
    _delete_and_settle(factory, storage, claimed)
    return len(claimed)
