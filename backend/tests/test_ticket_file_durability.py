"""Ticket PDF objects across uncertain commits, races and interruptions (#68; BF-10, BF-22).

Fault injection wraps the real session factory so the real SQL runs: the finalizing transaction
either rolls back after its writes are flushed, or commits and then raises as if the COMMIT
acknowledgement were lost. Process interruption is reproduced by leaving the exact durable state
a killed writer leaves (committed write intent, with or without its object); the real
process-kill scenarios are in tests/crash.
"""

import hashlib
import threading
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import select, update

from app import ticket_file_service as files
from app.checkout_models import Ticket
from app.file_models import StoredFile
from app.security import now
from app.storage import LocalFileStorage
from app.ticket_file_service import ensure_ticket_pdf, reconcile_ticket_pdfs
from app.worker import main
from tests.test_admission import free_ticket, published


@pytest.fixture
def storage(settings):
    return LocalFileStorage(settings.storage_root)


@pytest.fixture
def ticket_id(client, setup, account, factory):
    ticket, _ = free_ticket(client, account, published(client, setup, factory))
    return ticket["id"]


class Faulty:
    """The real factory, with one numbered `begin()` transaction failing in a chosen way.

    Transactions of one ensure_ticket_pdf call: 1 reserve, 2 finalize, 3 outcome check,
    4 cleanup record. `mode` is "rollback" (flush, then raise before COMMIT), "lost_ack"
    (COMMIT succeeds, then raise) or "down" (the database is unreachable).
    """

    def __init__(self, factory, faults):
        self.factory, self.faults, self.calls = factory, faults, 0

    def __call__(self):
        return self.factory()

    @contextmanager
    def begin(self):
        self.calls += 1
        mode = self.faults.get(self.calls)
        if mode == "down":
            raise ConnectionError("database unavailable")
        with self.factory.begin() as db:
            yield db
            if mode == "rollback":
                db.flush()
                raise ConnectionError("connection lost before COMMIT")
        if mode == "lost_ack":
            raise ConnectionError("connection lost after COMMIT")


def ticket_files(factory, ticket_id):
    with factory() as db:
        return list(
            db.scalars(
                select(StoredFile)
                .where(StoredFile.object_key.like(f"tickets/{ticket_id}/%"))
                .order_by(StoredFile.created_at, StoredFile.id)
            )
        )


def pointer(factory, ticket_id):
    with factory() as db:
        return db.get(Ticket, ticket_id).pdf_file_id


def objects(storage):
    return sorted(p.relative_to(storage.root).as_posix() for p in storage.root.rglob("*.pdf"))


def assert_one_canonical(factory, storage, ticket_id):
    """Exactly one clean row, referenced by the ticket, readable with its recorded checksum."""
    [clean] = [row for row in ticket_files(factory, ticket_id) if row.status == "clean"]
    assert pointer(factory, ticket_id) == clean.id
    data = storage.get(clean.object_key)
    assert data.startswith(b"%PDF")
    assert hashlib.sha256(data).hexdigest() == clean.sha256 and len(data) == clean.size_bytes
    return clean, data


def make_due(factory, file_id, created_at=None):
    with factory.begin() as db:
        values = {"cleanup_after": now() - timedelta(seconds=1)}
        if created_at is not None:
            values["created_at"] = created_at
        db.execute(update(StoredFile).where(StoredFile.id == file_id).values(**values))


# --------------------------------------------------------------------------------------------
# Uncertain commit outcomes
# --------------------------------------------------------------------------------------------


def test_precommit_rollback_deletes_the_unreferenced_object(factory, settings, storage, ticket_id):
    with pytest.raises(ConnectionError, match="before COMMIT"):
        ensure_ticket_pdf(Faulty(factory, {2: "rollback"}), settings, storage, ticket_id)
    [row] = ticket_files(factory, ticket_id)
    assert pointer(factory, ticket_id) is None
    assert row.status == "deleted" and objects(storage) == []
    # Deleted once; one final idempotent check stays scheduled for a late writer.
    assert row.cleanup_after == row.created_at + files.LATE_WRITE_CHECK

    # A retry creates the canonical document under a new key; the tombstone never comes back.
    data, _ = ensure_ticket_pdf(factory, settings, storage, ticket_id)
    clean, stored = assert_one_canonical(factory, storage, ticket_id)
    assert data == stored and clean.id != row.id
    assert objects(storage) == [clean.object_key]


def test_commit_then_raise_keeps_and_serves_the_committed_object(
    factory, settings, storage, ticket_id
):
    data, name = ensure_ticket_pdf(Faulty(factory, {2: "lost_ack"}), settings, storage, ticket_id)
    assert name == f"biletflow-ticket-{ticket_id}.pdf"
    clean, stored = assert_one_canonical(factory, storage, ticket_id)
    assert data == stored and clean.cleanup_after is None
    assert len(ticket_files(factory, ticket_id)) == 1
    # Later reads and retries use that same object; nothing is rewritten or added.
    again, _ = ensure_ticket_pdf(factory, settings, storage, ticket_id)
    assert again == stored and objects(storage) == [clean.object_key]
    assert reconcile_ticket_pdfs(factory, storage) == 0


def test_commit_then_raise_with_verification_down_never_deletes(
    factory, settings, storage, ticket_id
):
    with pytest.raises(ConnectionError, match="after COMMIT"):
        ensure_ticket_pdf(Faulty(factory, {2: "lost_ack", 3: "down"}), settings, storage, ticket_id)
    assert_one_canonical(factory, storage, ticket_id)
    assert reconcile_ticket_pdfs(factory, storage) == 0
    assert_one_canonical(factory, storage, ticket_id)


def test_rollback_with_verification_down_defers_to_the_sweep(factory, settings, storage, ticket_id):
    with pytest.raises(ConnectionError, match="before COMMIT"):
        ensure_ticket_pdf(Faulty(factory, {2: "rollback", 3: "down"}), settings, storage, ticket_id)
    [row] = ticket_files(factory, ticket_id)
    # Outcome unknown: the bytes and the pending intent stay until the grace period ends.
    assert row.status == "pending" and objects(storage) == [row.object_key]
    assert reconcile_ticket_pdfs(factory, storage) == 0
    assert objects(storage) == [row.object_key]
    make_due(factory, row.id)
    assert reconcile_ticket_pdfs(factory, storage) == 1
    assert objects(storage) == [] and ticket_files(factory, ticket_id)[0].status == "deleted"


def test_failed_cleanup_record_keeps_a_retry_schedule(factory, settings, storage, ticket_id):
    with pytest.raises(ConnectionError, match="before COMMIT"):
        ensure_ticket_pdf(Faulty(factory, {2: "rollback", 4: "down"}), settings, storage, ticket_id)
    [row] = ticket_files(factory, ticket_id)
    assert row.status == "deleted" and objects(storage) == []
    # The claim's short retry schedule survives; the next pass re-deletes idempotently.
    assert row.cleanup_after <= now() + files.CLEANUP_RETRY
    make_due(factory, row.id)
    assert reconcile_ticket_pdfs(factory, storage) == 1


# --------------------------------------------------------------------------------------------
# Concurrent writers
# --------------------------------------------------------------------------------------------


def test_concurrent_writers_keep_one_canonical_document(factory, settings, storage, ticket_id):
    both_written = threading.Barrier(2, timeout=20)

    class Lockstep:
        """Both writers reserve and write their own object before either finalizes."""

        def put(self, key, data):
            storage.put(key, data)
            both_written.wait()

        def get(self, key):
            return storage.get(key)

        def delete(self, key):
            storage.delete(key)

    results, errors = [], []

    def write():
        try:
            results.append(ensure_ticket_pdf(factory, settings, Lockstep(), ticket_id))
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=write) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    assert errors == [] and len(results) == 2
    clean, stored = assert_one_canonical(factory, storage, ticket_id)
    assert [data for data, _ in results] == [stored, stored]
    statuses = sorted(row.status for row in ticket_files(factory, ticket_id))
    assert statuses == ["clean", "deleted"]
    assert objects(storage) == [clean.object_key]
    assert reconcile_ticket_pdfs(factory, storage) == 0


# --------------------------------------------------------------------------------------------
# Process interruption and the reconcile sweep
# --------------------------------------------------------------------------------------------


def interrupted_write(factory, storage, ticket_id, put=True):
    """The durable state a writer killed after reserving (and optionally writing) leaves."""
    file_id = uuid4()
    key = f"tickets/{ticket_id}/{file_id}.pdf"
    data = b"%PDF-1.4\ninterrupted\n%%EOF\n"
    files.reserve(factory, ticket_id, file_id, key, data)
    if put:
        storage.put(key, data)
    return file_id, key


def test_interrupted_writes_are_swept_only_after_grace(factory, settings, storage, ticket_id):
    after_put = interrupted_write(factory, storage, ticket_id)
    before_put = interrupted_write(factory, storage, ticket_id, put=False)
    # The retry after restart stores the canonical document beside the abandoned intents.
    ensure_ticket_pdf(factory, settings, storage, ticket_id)
    clean, stored = assert_one_canonical(factory, storage, ticket_id)

    assert reconcile_ticket_pdfs(factory, storage) == 0  # within the grace period
    assert storage.get(after_put[1]).startswith(b"%PDF")

    make_due(factory, after_put[0])
    make_due(factory, before_put[0])
    assert reconcile_ticket_pdfs(factory, storage) == 2
    assert objects(storage) == [clean.object_key]
    assert storage.get(clean.object_key) == stored
    rows = {row.id: row for row in ticket_files(factory, ticket_id)}
    assert rows[after_put[0]].status == rows[before_put[0]].status == "deleted"
    assert rows[clean.id].status == "clean"
    assert reconcile_ticket_pdfs(factory, storage) == 0


def test_sweep_never_deletes_a_referenced_or_clean_object(factory, settings, storage, ticket_id):
    ensure_ticket_pdf(factory, settings, storage, ticket_id)
    clean, stored = assert_one_canonical(factory, storage, ticket_id)
    # Even a referenced row that somehow looks like a due pending intent is protected.
    with factory.begin() as db:
        db.execute(
            update(StoredFile)
            .where(StoredFile.id == clean.id)
            .values(status="pending", cleanup_after=now() - timedelta(hours=1))
        )
    assert reconcile_ticket_pdfs(factory, storage) == 0
    assert storage.get(clean.object_key) == stored
    with factory.begin() as db:
        db.execute(update(StoredFile).where(StoredFile.id == clean.id).values(status="clean"))
    # A clean row is never selected, even with a due schedule and no reference.
    with factory.begin() as db:
        db.execute(update(Ticket).where(Ticket.id == ticket_id).values(pdf_file_id=None))
    assert reconcile_ticket_pdfs(factory, storage) == 0
    assert storage.get(clean.object_key) == stored


def test_writer_stalled_past_grace_cannot_finalize_a_swept_intent(
    factory, settings, storage, ticket_id
):
    class Stalled:
        """The sweep fences this writer's intent between its reservation and its put."""

        def put(self, key, data):
            [row] = ticket_files(factory, ticket_id)
            make_due(factory, row.id)
            assert reconcile_ticket_pdfs(factory, storage) == 1
            storage.put(key, data)  # a late write after the cleanup pass

        def get(self, key):
            return storage.get(key)

        def delete(self, key):
            storage.delete(key)

    data, _ = ensure_ticket_pdf(factory, settings, Stalled(), ticket_id)
    assert data.startswith(b"%PDF")  # served from memory for this delivery
    [row] = ticket_files(factory, ticket_id)
    assert row.status == "deleted" and pointer(factory, ticket_id) is None
    assert objects(storage) == []  # the late writer removed its own object
    ensure_ticket_pdf(factory, settings, storage, ticket_id)
    assert_one_canonical(factory, storage, ticket_id)


def test_failed_delete_retries_then_a_final_late_write_check(
    factory, settings, storage, ticket_id, monkeypatch
):
    file_id, key = interrupted_write(factory, storage, ticket_id)
    make_due(factory, file_id)
    monkeypatch.setattr(storage, "delete", MagicMock(side_effect=OSError("/private/path")))
    assert reconcile_ticket_pdfs(factory, storage) == 1
    [row] = ticket_files(factory, ticket_id)
    assert row.status == "deleted" and storage.get(key)
    assert now() < row.cleanup_after <= now() + files.CLEANUP_RETRY
    monkeypatch.undo()

    make_due(factory, file_id)
    assert reconcile_ticket_pdfs(factory, storage) == 1
    assert objects(storage) == []
    [row] = ticket_files(factory, ticket_id)
    assert row.cleanup_after == row.created_at + files.LATE_WRITE_CHECK

    # A write that lands after the cleanup is caught by the final check, then nothing remains.
    storage.put(key, b"%PDF-late")
    make_due(factory, file_id, created_at=now() - files.LATE_WRITE_CHECK - timedelta(hours=1))
    assert reconcile_ticket_pdfs(factory, storage) == 1
    assert objects(storage) == []
    [row] = ticket_files(factory, ticket_id)
    assert row.status == "deleted" and row.cleanup_after is None
    assert reconcile_ticket_pdfs(factory, storage) == 0


def test_sweep_batches_are_bounded(factory, storage, ticket_id):
    written = [interrupted_write(factory, storage, ticket_id) for _ in range(3)]
    for file_id, _ in written:
        make_due(factory, file_id)
    assert reconcile_ticket_pdfs(factory, storage, batch_size=2) == 2
    assert len(objects(storage)) == 1
    assert reconcile_ticket_pdfs(factory, storage, batch_size=2) == 1
    assert objects(storage) == []


def test_worker_loop_runs_the_ticket_pdf_sweep(monkeypatch, tmp_path):
    storage = MagicMock()
    sweep = MagicMock(return_value=0)
    monkeypatch.setattr("app.worker.HEARTBEAT_FILE", tmp_path / "heartbeat")
    monkeypatch.setattr("app.worker.Settings", MagicMock())
    database = (MagicMock(), MagicMock())
    monkeypatch.setattr("app.worker.database", lambda url: database)
    monkeypatch.setattr("app.worker.storage_from_settings", lambda settings: storage)
    monkeypatch.setattr("app.worker.reconcile_ticket_pdfs", sweep)
    for idle in (
        "sweep_expired_holds",
        "reconcile_images",
        "initialize_once",
        "dispatch_refund_once",
        "process_received_once",
        "deliver_once",
        "deliver_notifications_once",
    ):
        monkeypatch.setattr(f"app.worker.{idle}", MagicMock(return_value=False))
    monkeypatch.setattr("app.worker.time.sleep", MagicMock(side_effect=KeyboardInterrupt))
    with pytest.raises(KeyboardInterrupt):
        main()
    sweep.assert_called_once_with(database[1], storage)
