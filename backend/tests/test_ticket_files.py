import hashlib
import io

import pytest
from pypdf import PdfReader
from sqlalchemy import func, select, update

from app.checkout_models import Ticket
from app.file_models import StoredFile
from app.models import OutboxJob
from app.storage import LocalFileStorage
from app.ticket_file_service import ensure_ticket_pdf
from app.worker import deliver_once
from tests.test_admission import free_ticket, published


@pytest.fixture
def storage(settings):
    # Same root as the app's storage, so the API and the worker see the same objects.
    return LocalFileStorage(settings.storage_root)


def deliver_all(factory, settings, storage, messages):
    while deliver_once(factory, settings, messages.append, storage=storage):
        pass


def ticket_email(messages):
    return [m for m in messages if m["Subject"].startswith("Your BiletFlow ticket")]


def attachments(message):
    return [p for p in message.iter_attachments() if p.get_content_type() == "application/pdf"]


def pdf_text(data):
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(data)).pages)


def stored_rows(factory):
    with factory() as db:
        return list(db.scalars(select(StoredFile).where(StoredFile.purpose == "ticket_pdf")))


def resend_job(factory, ticket_id):
    with factory.begin() as db:
        first = db.scalar(select(OutboxJob).where(OutboxJob.kind == "ticket_delivery_email"))
        db.add(
            OutboxJob(
                event_id=first.event_id,
                kind="ticket_delivery_email",
                deduplication_key=f"ticket-delivery:{ticket_id}:resend:1",
                payload=first.payload,
            )
        )


@pytest.fixture
def issued(client, setup, account, factory):
    f = published(client, setup, factory)
    ticket, headers = free_ticket(client, account, f)
    return ticket, headers


def test_delivery_attaches_stored_pdf_and_resend_reuses_it(
    issued, factory, settings, storage, tmp_path
):
    ticket, _ = issued
    messages = []
    deliver_all(factory, settings, storage, messages)
    [message] = ticket_email(messages)
    [attached] = attachments(message)
    assert attached.get_filename() == f"biletflow-ticket-{ticket['id']}.pdf"
    assert ticket["id"] in pdf_text(attached.get_content())
    assert "Your printable ticket is attached" in message.get_body().get_content()
    [row] = stored_rows(factory)
    with factory() as db:
        assert db.get(Ticket, ticket["id"]).pdf_file_id == row.id
    on_disk = storage.get(row.object_key)
    assert row.status == "clean" and row.uploaded_by_user_id is None
    assert row.object_key == f"tickets/{ticket['id']}/{row.id}.pdf"
    assert row.sha256 == hashlib.sha256(on_disk).hexdigest() and row.size_bytes == len(on_disk)
    assert row.mime_type == "application/pdf"

    resend_job(factory, ticket["id"])
    deliver_all(factory, settings, storage, messages)
    again = ticket_email(messages)
    assert len(again) == 2
    assert attachments(again[1])[0].get_content() == attached.get_content()
    assert [r.id for r in stored_rows(factory)] == [row.id]


MARKER = b"%PDF-1.4\nstored-copy-marker\n%%EOF\n"


def test_api_and_resend_read_the_stored_object(client, issued, factory, settings, storage):
    ticket, headers = issued
    messages = []
    deliver_all(factory, settings, storage, messages)
    [row] = stored_rows(factory)
    response = client.get(f"/api/v1/tickets/{ticket['id']}/pdf", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert hashlib.sha256(response.content).hexdigest() == row.sha256
    assert ticket["id"] in pdf_text(response.content)
    # Replace the object with recognisable bytes: only a read from storage can return them.
    storage.put(row.object_key, MARKER)
    served = client.get(f"/api/v1/tickets/{ticket['id']}/pdf", headers=headers)
    assert served.status_code == 200 and served.content == MARKER
    resend_job(factory, ticket["id"])
    deliver_all(factory, settings, storage, messages)
    assert attachments(ticket_email(messages)[-1])[0].get_content() == MARKER


def test_checked_in_ticket_is_rendered_not_served_from_storage(
    client, issued, factory, settings, storage
):
    ticket, headers = issued
    deliver_all(factory, settings, storage, [])
    [row] = stored_rows(factory)
    before = storage.get(row.object_key)
    with factory.begin() as db:
        db.execute(update(Ticket).where(Ticket.id == ticket["id"]).values(status="checked_in"))
    response = client.get(f"/api/v1/tickets/{ticket['id']}/pdf", headers=headers)
    assert response.status_code == 200
    assert "checked in" in pdf_text(response.content)
    assert "checked in" not in pdf_text(before)
    assert storage.get(row.object_key) == before
    assert ensure_ticket_pdf(factory, settings, storage, ticket["id"]) is None


def test_checked_in_ticket_stores_nothing(issued, factory, settings, storage):
    ticket, _ = issued
    with factory.begin() as db:
        db.execute(update(Ticket).where(Ticket.id == ticket["id"]).values(status="checked_in"))
    assert ensure_ticket_pdf(factory, settings, storage, ticket["id"]) is None
    assert stored_rows(factory) == []
    assert list(storage.root.rglob("*.pdf")) == []


def test_storage_read_error_falls_back_to_rendering(
    client, app, issued, factory, settings, storage, monkeypatch
):
    ticket, headers = issued
    deliver_all(factory, settings, storage, [])
    assert len(stored_rows(factory)) == 1

    def broken(key):
        raise OSError("/secret/path unreadable")

    monkeypatch.setattr(app.state.storage, "get", broken)
    response = client.get(f"/api/v1/tickets/{ticket['id']}/pdf", headers=headers)
    assert response.status_code == 200 and response.headers["content-type"] == "application/pdf"
    assert ticket["id"] in pdf_text(response.content)


def test_failed_row_write_removes_the_new_object(issued, factory, settings, storage):
    ticket, _ = issued

    class FailingWrite:
        def __call__(self):
            return factory()

        def begin(self):
            raise RuntimeError("database unavailable")

    with pytest.raises(RuntimeError):
        ensure_ticket_pdf(FailingWrite(), settings, storage, ticket["id"])
    assert list(storage.root.rglob("*.pdf")) == []
    assert stored_rows(factory) == []


def test_failed_row_write_keeps_an_existing_object(issued, factory, settings, storage):
    ticket, _ = issued
    deliver_all(factory, settings, storage, [])
    [row] = stored_rows(factory)
    storage.delete(row.object_key)

    class FailingWrite:
        def __call__(self):
            return factory()

        def begin(self):
            raise RuntimeError("database unavailable")

    with pytest.raises(RuntimeError):
        ensure_ticket_pdf(FailingWrite(), settings, storage, ticket["id"])
    # The key belongs to the existing stored_file row: it was rewritten, not dropped.
    assert storage.get(row.object_key).startswith(b"%PDF")


def test_pdf_endpoint_renders_when_nothing_is_stored(client, issued, factory):
    ticket, headers = issued
    response = client.get(f"/api/v1/tickets/{ticket['id']}/pdf", headers=headers)
    assert response.status_code == 200 and ticket["id"] in pdf_text(response.content)
    assert stored_rows(factory) == []


def test_missing_object_is_rerendered_under_the_same_key(issued, factory, settings, storage):
    ticket, _ = issued
    messages = []
    deliver_all(factory, settings, storage, messages)
    [row] = stored_rows(factory)
    storage.delete(row.object_key)
    with pytest.raises(FileNotFoundError):
        storage.get(row.object_key)
    resend_job(factory, ticket["id"])
    deliver_all(factory, settings, storage, messages)
    rows = stored_rows(factory)
    assert [(r.id, r.object_key) for r in rows] == [(row.id, row.object_key)]
    assert ticket["id"] in pdf_text(storage.get(row.object_key))
    last = ticket_email(messages)[-1]
    assert ticket["id"] in pdf_text(attachments(last)[0].get_content())
    assert rows[0].sha256 == hashlib.sha256(storage.get(row.object_key)).hexdigest()


def test_retired_stored_file_is_replaced_not_resurrected(issued, factory, settings, storage):
    ticket, _ = issued
    messages = []
    deliver_all(factory, settings, storage, messages)
    [old] = stored_rows(factory)
    with factory.begin() as db:
        db.execute(update(StoredFile).where(StoredFile.id == old.id).values(status="deleted"))
    resend_job(factory, ticket["id"])
    deliver_all(factory, settings, storage, messages)
    rows = {r.id: r for r in stored_rows(factory)}
    [new] = [r for r in rows.values() if r.id != old.id]
    assert len(rows) == 2 and new.object_key != old.object_key and new.status == "clean"
    assert rows[old.id].status == "deleted"
    with factory() as db:
        assert db.get(Ticket, ticket["id"]).pdf_file_id == new.id
    assert ticket["id"] in pdf_text(attachments(ticket_email(messages)[-1])[0].get_content())


def test_refunded_ticket_gets_no_email_and_no_file(issued, factory, settings, storage):
    ticket, _ = issued
    with factory.begin() as db:
        db.execute(update(Ticket).where(Ticket.id == ticket["id"]).values(status="refunded"))
    messages = []
    deliver_all(factory, settings, storage, messages)
    assert ticket_email(messages) == []
    assert stored_rows(factory) == []
    with factory() as db:
        assert db.get(Ticket, ticket["id"]).pdf_file_id is None
        assert db.scalar(select(func.count()).select_from(StoredFile)) == 0
        job = db.scalar(select(OutboxJob).where(OutboxJob.kind == "ticket_delivery_email"))
        assert job.status == "done"


def test_storage_failure_still_sends_the_email_without_attachment(
    issued, factory, settings, storage
):
    ticket, _ = issued

    class Broken:
        def put(self, key, data):
            raise OSError("/secret/path disk full")

        def get(self, key):
            raise FileNotFoundError(key)

        def delete(self, key):
            pass

    messages = []
    deliver_all(factory, settings, Broken(), messages)
    [message] = ticket_email(messages)
    assert attachments(message) == []
    assert ticket["id"] in message.get_content()
    assert "attached" not in message.get_content()
    with factory() as db:
        job = db.scalar(select(OutboxJob).where(OutboxJob.kind == "ticket_delivery_email"))
        assert job.status == "done" and job.last_error is None
        assert db.get(Ticket, ticket["id"]).pdf_file_id is None
    assert stored_rows(factory) == []


def test_ensure_is_idempotent(issued, factory, settings, storage):
    ticket, _ = issued
    first = ensure_ticket_pdf(factory, settings, storage, ticket["id"])
    second = ensure_ticket_pdf(factory, settings, storage, ticket["id"])
    assert first == second and first[1] == f"biletflow-ticket-{ticket['id']}.pdf"
    [row] = stored_rows(factory)
    assert len(list(storage.root.rglob("*.pdf"))) == 1 and row.status == "clean"


def test_race_loser_deletes_its_orphan_and_uses_the_winner(issued, factory, settings, storage):
    ticket, _ = issued

    class Racing:
        """Another worker finishes ensure_ticket_pdf while this one is writing its object."""

        raced = False

        def put(self, key, data):
            if not self.raced:
                self.raced = True
                ensure_ticket_pdf(factory, settings, storage, ticket["id"])
            storage.put(key, data)

        def get(self, key):
            return storage.get(key)

        def delete(self, key):
            storage.delete(key)

    data, _ = ensure_ticket_pdf(factory, settings, Racing(), ticket["id"])
    [row] = stored_rows(factory)
    assert hashlib.sha256(data).hexdigest() == row.sha256
    assert [p.name for p in storage.root.rglob("*.pdf")] == [f"{row.id}.pdf"]
