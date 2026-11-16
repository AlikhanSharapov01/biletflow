"""Support uploads across storage failures, uncertain commits, revocation and restarts (#76).

An upload commits a `pending` write intent (with a cleanup deadline) before any object I/O,
writes the object outside any transaction, then re-checks the uploader's access and finalizes the
intent in a second transaction. Fault injection reuses the real-SQL `Faulty` factory of the ticket
PDF tests; upload transactions are numbered 1 intent, 2 finalize, 3 failure check (fence),
4 cleanup record. A process stop is reproduced by leaving the durable state a killed request
leaves; the worker's `reconcile_attachments` pass must then recover it.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event as Signal
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, update

from app import attachment_service as attachments
from app.attachment_service import (
    LINK_WINDOW,
    reconcile_attachments,
    scan_attachments_once,
    upload_attachment,
)
from app.catalog_models import StaffPermission
from app.file_models import StoredFile, SupportAttachment
from app.models import AuditLog, AuthSession, OutboxJob, User
from app.security import decode_access, now
from tests.test_admission import free_ticket, published, staff
from tests.test_support_attachments import PNG, new_case, send, upload
from tests.test_ticket_file_durability import Faulty


@pytest.fixture
def settings(settings):
    return settings.model_copy(update={"attachment_max_bytes": 2048})


@pytest.fixture
def world(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    _, buyer = free_ticket(client, account, f)
    return {
        "f": f,
        "buyer": buyer,
        "other": account()[2],
        "support": staff(client, settings, account, f, ["support"]),
    }


def ids_of(settings, headers):
    return decode_access(settings, headers["Authorization"].split()[1])


def direct_upload(factory, app, settings, headers, case_id, scanner, data=PNG):
    return upload_attachment(
        factory,
        app.state.storage,
        scanner,
        settings,
        ids_of(settings, headers),
        UUID(case_id),
        "receipt.png",
        "image/png",
        data,
    )


def support_files(factory):
    with factory() as db:
        return list(
            db.scalars(
                select(StoredFile)
                .where(StoredFile.purpose == "support_attachment")
                .order_by(StoredFile.created_at, StoredFile.id)
            )
        )


def exists(storage, key):
    try:
        storage.get(key)
    except FileNotFoundError:
        return False
    return True


def count(factory, model, *where):
    with factory() as db:
        return db.scalar(select(func.count()).select_from(model).where(*where))


def make_due(factory, file_id, **values):
    with factory.begin() as db:
        db.execute(
            update(StoredFile)
            .where(StoredFile.id == file_id)
            .values(cleanup_after=now() - timedelta(seconds=1), **values)
        )


def interrupted(factory, storage, user_id, case_id, status="pending", with_object=True, age=2):
    """The durable state a process stopped mid-upload leaves: a committed intent (+ object?)."""
    file_id = uuid4()
    key = f"support/{case_id}/{file_id}"
    created = now() - timedelta(hours=age)
    with factory.begin() as db:
        db.add(
            StoredFile(
                id=file_id,
                uploaded_by_user_id=user_id,
                object_key=key,
                purpose="support_attachment",
                mime_type="image/png",
                size_bytes=len(PNG),
                sha256="0" * 64,
                original_filename="receipt.png",
                status=status,
                created_at=created,
                cleanup_after=created + LINK_WINDOW,
            )
        )
    if with_object:
        storage.put(key, PNG)
    return file_id, key


def offline(*args):
    raise OSError("storage offline")


def user_id(factory, settings, headers):
    return ids_of(settings, headers)[0]


# --------------------------------------------------------------------------------------------
# Intent before object I/O
# --------------------------------------------------------------------------------------------


def test_intent_is_committed_before_the_object_is_written(client, app, world, factory, monkeypatch):
    w = world
    case_id = new_case(client, w)
    storage, real_put, seen = app.state.storage, app.state.storage.put, []

    def observed_put(key, data):
        # A separate session sees the committed intent while the object is being written.
        with factory() as db:
            row = db.scalar(select(StoredFile).where(StoredFile.object_key == key))
            seen.append((row.status, row.cleanup_after - row.created_at))
        real_put(key, data)

    monkeypatch.setattr(storage, "put", observed_put)
    r = upload(client, w["buyer"], case_id)
    assert r.status_code == 201, r.text
    assert seen == [("pending", LINK_WINDOW)]
    [row] = support_files(factory)
    # A clean, unlinked upload is scheduled for retirement when its link window ends.
    assert row.status == "clean" and row.cleanup_after == row.created_at + LINK_WINDOW
    sent = send(client, w["buyer"], case_id, [r.json()["file_id"]])
    assert sent.status_code == 201
    [row] = support_files(factory)
    assert row.cleanup_after is None  # linked: no longer anyone's to clean up


# --------------------------------------------------------------------------------------------
# Storage failures
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("partial", [False, True])
def test_storage_failure_fences_the_intent(client, app, world, factory, monkeypatch, partial):
    w = world
    case_id = new_case(client, w)
    storage, real_put = app.state.storage, app.state.storage.put

    def failing_put(key, data):
        if partial:
            real_put(key, data)  # e.g. the object landed but the acknowledgement was lost
        raise OSError("storage offline")

    monkeypatch.setattr(storage, "put", failing_put)
    r = upload(client, w["buyer"], case_id)
    assert r.status_code == 503 and r.json()["detail"]["code"] == "storage_unavailable"
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(storage, row.object_key)
    # Deleted once; one final idempotent check stays scheduled for a late writer.
    assert row.cleanup_after == row.created_at + attachments.LATE_WRITE_CHECK
    assert count(factory, OutboxJob, OutboxJob.kind == attachments.SCAN_KIND) == 0
    assert count(factory, AuditLog, AuditLog.action == "support.attachment_uploaded") == 0


def test_failed_cleanup_delete_stays_scheduled(client, app, world, factory, monkeypatch):
    w = world
    case_id = new_case(client, w)
    storage, real_delete = app.state.storage, app.state.storage.delete
    monkeypatch.setattr(storage, "put", offline)
    monkeypatch.setattr(storage, "delete", offline)
    assert upload(client, w["buyer"], case_id).status_code == 503
    [row] = support_files(factory)
    assert row.status == "deleted" and row.cleanup_after > now()
    assert row.cleanup_after <= now() + attachments.CLEANUP_RETRY
    monkeypatch.setattr(storage, "delete", real_delete)
    make_due(factory, row.id)
    assert reconcile_attachments(factory, storage) == 1
    # The retried delete succeeded: still a tombstone, now with only the late-write check left.
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(storage, row.object_key)
    assert row.cleanup_after == row.created_at + attachments.LATE_WRITE_CHECK


def test_cleanup_pass_stops_at_the_first_storage_failure(
    client, app, world, factory, settings, monkeypatch
):
    # A hanging store costs its timeout per delete: one failure ends the pass, not fifty.
    w = world
    case_id = new_case(client, w)
    storage, real_delete, attempts = app.state.storage, app.state.storage.delete, []
    buyer = user_id(factory, settings, w["buyer"])
    stale = [interrupted(factory, storage, buyer, case_id) for _ in range(3)]

    def failed_delete(key):
        attempts.append(key)
        offline()

    monkeypatch.setattr(storage, "delete", failed_delete)
    assert reconcile_attachments(factory, storage) == 3
    assert len(attempts) == 1 and all(exists(storage, key) for _, key in stale)
    rows = support_files(factory)
    assert all(row.status == "deleted" and row.cleanup_after > now() for row in rows)
    monkeypatch.setattr(storage, "delete", real_delete)
    for file_id, _ in stale:
        make_due(factory, file_id)
    assert reconcile_attachments(factory, storage) == 3
    assert not any(exists(storage, key) for _, key in stale)


# --------------------------------------------------------------------------------------------
# Uncertain commit outcomes
# --------------------------------------------------------------------------------------------


def test_finalize_rollback_removes_the_unreferenced_object(
    client, app, world, factory, settings, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    with pytest.raises(ConnectionError, match="before COMMIT"):
        direct_upload(Faulty(factory, {2: "rollback"}), app, settings, w["buyer"], case_id,
                      malware_scanner)  # fmt: skip
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(app.state.storage, row.object_key)
    assert count(factory, AuditLog, AuditLog.action == "support.attachment_uploaded") == 0


def test_quarantined_finalize_rollback_leaves_no_scan_job(
    client, app, world, factory, settings, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    malware_scanner.down = True
    with pytest.raises(ConnectionError):
        direct_upload(Faulty(factory, {2: "rollback"}), app, settings, w["buyer"], case_id,
                      malware_scanner)  # fmt: skip
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(app.state.storage, row.object_key)
    assert count(factory, OutboxJob, OutboxJob.kind == attachments.SCAN_KIND) == 0


def test_lost_commit_acknowledgement_keeps_the_finalized_upload(
    client, app, world, factory, settings, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    with pytest.raises(ConnectionError, match="after COMMIT"):
        direct_upload(Faulty(factory, {2: "lost_ack"}), app, settings, w["buyer"], case_id,
                      malware_scanner)  # fmt: skip
    [row] = support_files(factory)
    # The commit landed: the clean file and its bytes stay, and it is linkable.
    assert row.status == "clean" and exists(app.state.storage, row.object_key)
    assert send(client, w["buyer"], case_id, [str(row.id)]).status_code == 201


def test_unverifiable_outcome_defers_to_reconciliation(
    client, app, world, factory, settings, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    storage = app.state.storage
    with pytest.raises(ConnectionError, match="before COMMIT"):
        direct_upload(Faulty(factory, {2: "rollback", 3: "down"}), app, settings, w["buyer"],
                      case_id, malware_scanner)  # fmt: skip
    [row] = support_files(factory)
    assert row.status == "pending" and exists(storage, row.object_key)  # nothing guessed
    assert reconcile_attachments(factory, storage) == 0  # within the grace period
    make_due(factory, row.id)
    assert reconcile_attachments(factory, storage) == 1
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(storage, row.object_key)


def test_lost_intent_acknowledgement_is_retired_later(
    client, app, world, factory, settings, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    with pytest.raises(ConnectionError, match="after COMMIT"):
        direct_upload(Faulty(factory, {1: "lost_ack"}), app, settings, w["buyer"], case_id,
                      malware_scanner)  # fmt: skip
    [row] = support_files(factory)
    assert row.status == "pending" and not exists(app.state.storage, row.object_key)
    make_due(factory, row.id)
    assert reconcile_attachments(factory, app.state.storage) == 1
    assert support_files(factory)[0].status == "deleted"


# --------------------------------------------------------------------------------------------
# Authorization is re-checked at finalization
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("change", ["permission", "session", "suspended"])
def test_access_lost_during_the_upload_discards_it(
    client, app, world, factory, settings, monkeypatch, change
):
    w = world
    case_id = new_case(client, w)
    storage, real_put = app.state.storage, app.state.storage.put
    support_id = user_id(factory, settings, w["support"])

    def put_then_revoke(key, data):
        real_put(key, data)
        with factory.begin() as db:
            if change == "permission":
                db.execute(update(StaffPermission).values(revoked_at=func.now()))
            elif change == "session":
                db.execute(
                    update(AuthSession)
                    .where(AuthSession.user_id == support_id)
                    .values(revoked_at=func.now())
                )
            else:
                db.execute(update(User).where(User.id == support_id).values(status="suspended"))

    monkeypatch.setattr(storage, "put", put_then_revoke)
    r = upload(client, w["support"], case_id)
    assert r.status_code == (404 if change == "permission" else 401), r.text
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(storage, row.object_key)
    assert count(factory, AuditLog, AuditLog.action == "support.attachment_uploaded") == 0


def test_access_check_failure_in_service_raises_http_error(
    client, app, world, factory, settings, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    with pytest.raises(HTTPException) as denied:
        direct_upload(factory, app, settings, w["other"], case_id, malware_scanner)
    assert denied.value.status_code == 404
    assert support_files(factory) == [] and malware_scanner.scanned == []


# --------------------------------------------------------------------------------------------
# Cleanup of interrupted and abandoned uploads
# --------------------------------------------------------------------------------------------


def test_restart_recovers_interrupted_uploads_in_bounded_batches(
    client, app, world, factory, settings
):
    w = world
    case_id = new_case(client, w)
    storage = app.state.storage
    buyer = user_id(factory, settings, w["buyer"])
    stopped = [
        interrupted(factory, storage, buyer, case_id),  # stopped after the object write
        interrupted(factory, storage, buyer, case_id, with_object=False),  # before it
        interrupted(factory, storage, buyer, case_id, "clean"),  # finalized, never linked
    ]
    fresh_id, fresh_key = interrupted(factory, storage, buyer, case_id, age=0)  # still uploading
    assert reconcile_attachments(factory, storage, batch_size=2) == 2
    assert reconcile_attachments(factory, storage, batch_size=2) == 1
    assert reconcile_attachments(factory, storage, batch_size=2) == 0
    for file_id, key in stopped:
        with factory() as db:
            assert db.get(StoredFile, file_id).status == "deleted"
        assert not exists(storage, key)
    with factory() as db:
        assert db.get(StoredFile, fresh_id).status == "pending"
    assert exists(storage, fresh_key)


def test_abandoned_upload_is_retired_after_the_link_window_but_linked_files_stay(
    client, app, world, factory
):
    w = world
    case_id = new_case(client, w)
    storage = app.state.storage
    linked = upload(client, w["buyer"], case_id).json()["file_id"]
    abandoned = upload(client, w["buyer"], case_id).json()["file_id"]
    attachment = send(client, w["buyer"], case_id, [linked]).json()["attachments"][0]
    assert reconcile_attachments(factory, storage) == 0  # the link window is still open
    for file_id in (linked, abandoned):
        # Even inconsistent historical metadata must never erase a live reference.
        make_due(factory, file_id, status="deleted" if file_id == linked else "clean")
    assert reconcile_attachments(factory, storage) == 1
    files = {str(row.id): row for row in support_files(factory)}
    assert files[abandoned].status == "deleted"
    assert not exists(storage, files[abandoned].object_key)
    assert exists(storage, files[linked].object_key)
    assert send(client, w["buyer"], case_id, [abandoned]).status_code == 409
    with factory.begin() as db:
        db.execute(update(StoredFile).where(StoredFile.id == linked).values(status="clean"))
    url = client.get(
        f"/api/v1/support/cases/{case_id}/attachments/{attachment['id']}/download-link",
        headers=w["buyer"],
    ).json()["url"]
    assert client.get(url).content == PNG


def test_quarantined_upload_survives_a_restart_and_expires_unscanned(
    client, app, world, factory, malware_scanner
):
    w = world
    case_id = new_case(client, w)
    storage = app.state.storage
    malware_scanner.down = True
    first = upload(client, w["buyer"], case_id).json()["file_id"]
    second = upload(client, w["buyer"], case_id).json()["file_id"]
    # After a restart the durable job scans the first file once the scanner answers.
    malware_scanner.down = False
    assert scan_attachments_once(factory, storage, malware_scanner) is True
    assert {row.status for row in support_files(factory)} == {"clean", "quarantined"}
    # The second never gets a verdict in time: its job ends and the sweeper retires the file.
    pending = [row for row in support_files(factory) if row.status == "quarantined"][0]
    assert str(pending.id) == second
    with factory.begin() as db:
        db.execute(
            update(StoredFile)
            .where(StoredFile.id == pending.id)
            .values(created_at=now() - LINK_WINDOW - timedelta(seconds=1))
        )
    assert scan_attachments_once(factory, storage, malware_scanner) is True
    with factory() as db:
        job = db.scalar(select(OutboxJob).where(OutboxJob.payload["file_id"].astext == second))
        assert job.status == "done"
    make_due(factory, pending.id)
    assert reconcile_attachments(factory, storage) == 1
    files = {str(row.id): row for row in support_files(factory)}
    assert files[second].status == "deleted" and not exists(storage, files[second].object_key)
    assert files[first].status == "clean"


def test_infected_verdict_from_the_worker_deletes_bytes_through_the_schedule(
    client, app, world, factory, malware_scanner, monkeypatch
):
    w = world
    case_id = new_case(client, w)
    storage, real_delete = app.state.storage, app.state.storage.delete
    malware_scanner.down = True
    assert upload(client, w["buyer"], case_id).status_code == 202
    malware_scanner.down, malware_scanner.signature = False, "Eicar-Test-Signature"
    monkeypatch.setattr(storage, "delete", offline)
    assert scan_attachments_once(factory, storage, malware_scanner) is True
    [row] = support_files(factory)
    assert row.status == "rejected" and exists(storage, row.object_key)  # delete failed
    assert row.cleanup_after is not None  # but stays scheduled
    monkeypatch.setattr(storage, "delete", real_delete)
    make_due(factory, row.id)
    assert reconcile_attachments(factory, storage) == 1
    [row] = support_files(factory)
    assert row.status == "rejected" and not exists(storage, row.object_key)


def test_cleanup_fences_a_stalled_uploader(client, app, world, factory, monkeypatch):
    w = world
    case_id = new_case(client, w)
    storage, real_put = app.state.storage, app.state.storage.put

    def stalled_put(key, data):
        real_put(key, data)
        # The upload stalls past its grace period: the worker fences the intent meanwhile.
        with factory.begin() as db:
            row = db.scalar(select(StoredFile).where(StoredFile.object_key == key))
            row.cleanup_after = now() - timedelta(seconds=1)
        assert reconcile_attachments(factory, storage) == 1
        real_put(key, data)  # the object-store write finishes after cleanup

    monkeypatch.setattr(storage, "put", stalled_put)
    r = upload(client, w["buyer"], case_id)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "attachment_upload_expired"
    [row] = support_files(factory)
    assert row.status == "deleted" and not exists(storage, row.object_key)
    assert count(factory, SupportAttachment) == 0


def test_finalize_and_cleanup_have_one_winner(client, app, world, factory, monkeypatch):
    w = world
    case_id = new_case(client, w)
    written, finish = Signal(), Signal()
    storage, real_put = app.state.storage, app.state.storage.put

    def paused_put(key, data):
        real_put(key, data)
        written.set()
        assert finish.wait(10)

    monkeypatch.setattr(storage, "put", paused_put)
    with ThreadPoolExecutor(max_workers=2) as pool:
        request = pool.submit(upload, client, w["buyer"], case_id)
        assert written.wait(10)
        assert reconcile_attachments(factory, storage) == 0  # the grace period protects normal IO
        [row] = support_files(factory)
        make_due(factory, row.id)
        cleanup = pool.submit(reconcile_attachments, factory, storage)
        finish.set()
        response, cleaned = request.result(), cleanup.result()
    [row] = support_files(factory)
    assert response.status_code in (201, 409), response.text
    if response.status_code == 201:
        # Finalized first: the file is clean and kept (its new schedule is the link window).
        assert cleaned == 0 and row.status == "clean" and exists(storage, row.object_key)
        assert send(client, w["buyer"], case_id, [str(row.id)]).status_code == 201
    else:
        assert response.json()["detail"]["code"] == "attachment_upload_expired"
        assert cleaned == 1 and row.status == "deleted" and not exists(storage, row.object_key)


def test_worker_loop_runs_the_attachment_sweep(client, app, world, factory, settings, monkeypatch,
                                               tmp_path):  # fmt: skip
    from app import worker

    w = world
    case_id = new_case(client, w)
    file_id, key = interrupted(
        factory, app.state.storage, user_id(factory, settings, w["buyer"]), case_id
    )
    monkeypatch.setattr(worker, "Settings", lambda: app.state.settings)
    monkeypatch.setattr(worker, "database", lambda url: (app.state.engine, factory))
    monkeypatch.setattr(worker, "HEARTBEAT_FILE", tmp_path / "heartbeat")
    for name in [
        "sweep_expired_holds",
        "reconcile_images",
        "reconcile_ticket_pdfs",
        "initialize_once",
        "dispatch_refund_once",
        "process_received_once",
        "deliver_once",
        "deliver_notifications_once",
    ]:
        monkeypatch.setattr(worker, name, lambda *args, **kwargs: False)

    def stop(_):
        raise RuntimeError("end worker test")

    monkeypatch.setattr(worker.time, "sleep", stop)
    with pytest.raises(RuntimeError, match="end worker test"):
        worker.main()
    assert not exists(app.state.storage, key)
    with factory() as db:
        assert db.get(StoredFile, file_id).status == "deleted"
