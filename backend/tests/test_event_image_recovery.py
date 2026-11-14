from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event as Signal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app import event_image_service as images
from app.file_models import EventMedia, StoredFile
from app.security import now
from tests.test_event_images import upload


def orphan(factory, storage, status="pending", due=True):
    identifier = uuid4()
    key = f"events/{uuid4()}/{identifier}"
    with factory.begin() as db:
        file = StoredFile(
            id=identifier,
            object_key=key,
            purpose="event_image",
            mime_type="image/png",
            size_bytes=3,
            sha256="0" * 64,
            status=status,
            created_at=now() - timedelta(hours=2),
        )
        file.cleanup_after = now() + timedelta(hours=-1 if due else 1)
        db.add(file)
    storage.put(key, b"png")
    return identifier, key


def due_again(factory, identifier):
    with factory.begin() as db:
        db.get(StoredFile, identifier).cleanup_after = now() - timedelta(seconds=1)


def test_interrupted_pending_and_deleted_recover_in_bounded_batches(factory, app):
    storage = app.state.storage
    rows = [orphan(factory, storage, status) for status in ["pending", "deleted", "pending"]]
    with factory.begin() as db:
        db.get(StoredFile, rows[0][0]).cleanup_after = None  # pre-0016 interrupted metadata
    fresh_id, fresh_key = orphan(factory, storage, due=False)
    clean_id, clean_key = orphan(factory, storage, "clean")
    assert images.reconcile_images(factory, storage, batch_size=2) == 2
    assert sum(storage.path(key).exists() for _, key in rows) == 1
    assert images.reconcile_images(factory, storage, batch_size=2) == 1
    assert not any(storage.path(key).exists() for _, key in rows)
    assert storage.get(fresh_key) == storage.get(clean_key) == b"png"
    with factory() as db:
        assert db.get(StoredFile, fresh_id).status == "pending"
        assert db.get(StoredFile, clean_id).status == "clean"


def test_failed_delete_retry_and_late_writer_reconciliation(factory, app, monkeypatch):
    storage = app.state.storage
    identifier, key = orphan(factory, storage, "deleted")
    real_delete = storage.delete

    def failed_delete(key):
        raise OSError("offline storage")

    monkeypatch.setattr(storage, "delete", failed_delete)
    assert images.reconcile_images(factory, storage) == 1
    with factory() as db:
        assert db.get(StoredFile, identifier).cleanup_after > now()
    assert storage.get(key) == b"png"
    monkeypatch.setattr(storage, "delete", real_delete)
    due_again(factory, identifier)
    assert images.reconcile_images(factory, storage) == 1
    assert not storage.path(key).exists()
    # Persisted tombstone also catches a write that completed after the cleanup worker.
    storage.put(key, b"late interrupted writer")
    due_again(factory, identifier)
    assert images.reconcile_images(factory, storage) == 1
    assert not storage.path(key).exists()


def test_live_reference_and_clean_image_are_preserved(client, setup, factory, app):
    f = setup()
    image = upload(client, f).json()
    with factory.begin() as db:
        file = db.get(StoredFile, db.get(EventMedia, UUID(image["id"])).file_id)
        identifier, key = file.id, file.object_key
        file.cleanup_after = now() - timedelta(seconds=1)
    assert images.reconcile_images(factory, app.state.storage) == 0
    with factory.begin() as db:
        file = db.get(StoredFile, identifier)
        file.status = "deleted"  # inconsistent historical metadata must not erase a live reference
    assert images.reconcile_images(factory, app.state.storage) == 0
    assert app.state.storage.get(key)


def test_finalize_and_cleanup_have_one_winner(client, setup, factory, app, monkeypatch):
    f = setup()
    written, finish = Signal(), Signal()
    storage, real_put = app.state.storage, app.state.storage.put

    def paused_put(key, data):
        real_put(key, data)
        written.set()
        assert finish.wait(10)

    monkeypatch.setattr(storage, "put", paused_put)
    with ThreadPoolExecutor(max_workers=2) as pool:
        request = pool.submit(upload, client, f)
        assert written.wait(10)
        assert images.reconcile_images(factory, storage) == 0  # active grace protects ordinary IO
        with factory.begin() as db:
            file = db.scalar(select(StoredFile).where(StoredFile.purpose == "event_image"))
            identifier, key = file.id, file.object_key
            file.cleanup_after = now() - timedelta(seconds=1)
        cleanup = pool.submit(images.reconcile_images, factory, storage)
        finish.set()
        response, cleaned = request.result(), cleanup.result()
    assert response.status_code in (201, 409), response.text
    if response.status_code == 201:
        assert cleaned == 0
        assert client.get(response.json()["url"], headers=f["headers"]).status_code == 200
        assert storage.get(key)
    else:
        assert cleaned == 1
        with factory() as db:
            assert db.get(StoredFile, identifier).status == "deleted"
            assert db.scalar(select(EventMedia)) is None


def test_cleanup_winner_fences_slow_uploader(client, setup, factory, app, monkeypatch):
    f = setup()
    storage, real_put = app.state.storage, app.state.storage.put

    def slow_put(key, data):
        real_put(key, data)
        with factory.begin() as db:
            file = db.scalar(select(StoredFile).where(StoredFile.object_key == key))
            file.cleanup_after = now() - timedelta(seconds=1)
        assert images.reconcile_images(factory, storage) == 1
        real_put(key, data)  # unfenced object-store write finishes after cleanup

    monkeypatch.setattr(storage, "put", slow_put)
    response = upload(client, f)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "image_upload_expired"
    with factory() as db:
        assert db.scalar(select(StoredFile)).status == "deleted"
        assert db.scalar(select(EventMedia)) is None


def test_cleanup_claim_commits_before_io_and_other_worker_skips(factory, app, monkeypatch):
    storage = app.state.storage
    identifier, _ = orphan(factory, storage)
    deleting, finish = Signal(), Signal()
    real_delete = storage.delete

    def slow_delete(key):
        deleting.set()
        assert finish.wait(10)
        real_delete(key)

    monkeypatch.setattr(storage, "delete", slow_delete)
    with ThreadPoolExecutor(max_workers=1) as pool:
        cleanup = pool.submit(images.reconcile_images, factory, storage)
        assert deleting.wait(10)
        with factory.begin() as db:
            file = db.scalar(
                select(StoredFile).where(StoredFile.id == identifier).with_for_update(nowait=True)
            )
            assert file.status == "deleted" and file.cleanup_after > now()
        assert images.reconcile_images(factory, storage) == 0
        finish.set()
        assert cleanup.result() == 1


def test_existing_worker_sweep_recovers_interrupted_image(factory, app, monkeypatch, tmp_path):
    from app import worker

    identifier, key = orphan(factory, app.state.storage)
    monkeypatch.setattr(worker, "Settings", lambda: app.state.settings)
    monkeypatch.setattr(worker, "database", lambda url: (app.state.engine, factory))
    monkeypatch.setattr(worker, "HEARTBEAT_FILE", tmp_path / "heartbeat")
    for name in [
        "sweep_expired_holds",
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
    assert not app.state.storage.path(key).exists()
    with factory() as db:
        assert db.get(StoredFile, identifier).status == "deleted"
