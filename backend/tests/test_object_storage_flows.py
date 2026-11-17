"""Event images, ticket PDFs and support attachments against the S3 adapter (#77).

Every test here runs the real API and worker with `S3FileStorage` talking to the in-memory
`FakeS3` (tests/test_object_storage.py) instead of the local filesystem: uploads land in the
bucket under their private keys, downloads read them back with the usual authorization checks,
and an unreachable object store answers 503 instead of a 500 or a wrong 404. Uploads work again
once the store is back.
"""

import hashlib
from uuid import UUID

import pytest
from sqlalchemy import select

from app import main
from app.file_models import StoredFile
from app.storage import S3FileStorage
from tests.test_admission import free_ticket, published, staff
from tests.test_event_images import picture
from tests.test_event_images import upload as upload_image
from tests.test_object_storage import FakeS3
from tests.test_support_attachments import PNG, new_case, send
from tests.test_support_attachments import upload as upload_attachment
from tests.test_ticket_files import deliver_all, stored_rows

API = "/api/v1"
SUPPORT = API + "/support"


@pytest.fixture
def s3():
    return FakeS3()


@pytest.fixture(autouse=True)
def s3_backend(s3, monkeypatch):
    """Runs before conftest's `app`, so create_app wires the S3 adapter into every router."""
    monkeypatch.setattr(main, "storage_from_settings", lambda settings: s3.storage())


@pytest.fixture
def world(client, setup, account, factory, settings):
    f = published(client, setup, factory)
    _, buyer = free_ticket(client, account, f)
    return {"f": f, "buyer": buyer, "support": staff(client, settings, account, f, ["support"])}


def object_key(factory, purpose):
    with factory() as db:
        return db.scalar(select(StoredFile.object_key).where(StoredFile.purpose == purpose))


def download_url(client, headers, case_id, attachment_id):
    link = client.get(
        SUPPORT + f"/cases/{case_id}/attachments/{attachment_id}/download-link", headers=headers
    )
    assert link.status_code == 200, link.text
    return link.json()["url"]


def test_app_uses_the_s3_adapter(app):
    assert isinstance(app.state.storage, S3FileStorage)


def test_event_image_upload_read_and_delete_go_through_the_bucket(client, setup, factory, s3):
    f = setup()
    created = upload_image(client, f)
    assert created.status_code == 201, created.text
    image = created.json()
    key = object_key(factory, "event_image")
    assert s3.objects[key] == picture()
    assert key not in created.text
    assert client.get(image["url"]).status_code == 404  # draft event: still private
    assert client.get(image["url"], headers=f["headers"]).content == picture()

    url = API + f"/events/{f['event']['id']}/images/{image['id']}"
    assert client.delete(url, headers=f["headers"]).status_code == 204
    assert key not in s3.objects
    assert client.get(image["url"], headers=f["headers"]).status_code == 404


def test_event_image_storage_outage_answers_503_and_recovers(client, setup, factory, s3):
    f = setup()
    image = upload_image(client, f).json()
    s3.down = True
    read = client.get(image["url"], headers=f["headers"])
    assert read.status_code == 503 and read.json()["detail"]["code"] == "storage_unavailable"
    failed = upload_image(client, f)
    assert failed.status_code == 503 and failed.json()["detail"]["code"] == "storage_unavailable"

    s3.down = False
    assert client.get(image["url"], headers=f["headers"]).content == picture()
    assert upload_image(client, f).status_code == 201
    with factory() as db:
        clean = db.scalars(
            select(StoredFile.object_key).where(
                StoredFile.purpose == "event_image", StoredFile.status == "clean"
            )
        ).all()
    assert sorted(clean) == sorted(s3.objects)


def test_ticket_pdf_is_stored_in_the_bucket_and_served_from_it(
    client, setup, account, factory, settings, app, s3
):
    f = published(client, setup, factory)
    ticket, headers = free_ticket(client, account, f)
    deliver_all(factory, settings, app.state.storage, [])
    [row] = stored_rows(factory)
    assert row.object_key == f"tickets/{ticket['id']}/{row.id}.pdf"
    stored = s3.objects[row.object_key]
    assert hashlib.sha256(stored).hexdigest() == row.sha256 and len(stored) == row.size_bytes

    marker = b"%PDF-1.4\nstored-in-the-bucket\n%%EOF\n"
    s3.objects[row.object_key] = marker  # only a read from the bucket can return this
    served = client.get(f"{API}/tickets/{ticket['id']}/pdf", headers=headers)
    assert served.status_code == 200 and served.content == marker

    # Store down: the PDF is rendered instead, never a 500.
    s3.down = True
    rendered = client.get(f"{API}/tickets/{ticket['id']}/pdf", headers=headers)
    assert rendered.status_code == 200 and rendered.content.startswith(b"%PDF")
    assert rendered.content != marker


def test_missing_ticket_pdf_object_is_rendered_again(
    client, setup, account, factory, settings, app, s3
):
    f = published(client, setup, factory)
    ticket, headers = free_ticket(client, account, f)
    deliver_all(factory, settings, app.state.storage, [])
    [row] = stored_rows(factory)
    del s3.objects[row.object_key]  # e.g. restored from an online backup that lacked it
    served = client.get(f"{API}/tickets/{ticket['id']}/pdf", headers=headers)
    assert served.status_code == 200 and served.content.startswith(b"%PDF")


def test_support_attachment_upload_and_protected_download(client, factory, world, s3):
    w = world
    case_id = new_case(client, w)
    up = upload_attachment(client, w["buyer"], case_id)
    assert up.status_code == 201, up.text
    key = object_key(factory, "support_attachment")
    assert key == f"support/{case_id}/{up.json()['file_id']}" and s3.objects[key] == PNG
    attachment = send(client, w["buyer"], case_id, [up.json()["file_id"]]).json()["attachments"][0]

    for headers in (w["buyer"], w["support"]):
        got = client.get(download_url(client, headers, case_id, attachment["id"]))
        assert got.status_code == 200 and got.content == PNG
    # Authorization is unchanged: the link still needs a valid token, the object key is private.
    denied = client.get(f"{SUPPORT}/attachments/{attachment['id']}/content", params={"token": "x"})
    assert denied.status_code == 401
    assert key not in up.text

    # A missing object is a missing attachment, as with local storage.
    url = download_url(client, w["buyer"], case_id, attachment["id"])
    del s3.objects[key]
    gone = client.get(url)
    assert gone.status_code == 404 and gone.json()["detail"]["code"] == "attachment_not_found"


def test_support_storage_outage_answers_503_and_recovers(client, factory, world, s3):
    w = world
    case_id = new_case(client, w)
    file_id = upload_attachment(client, w["buyer"], case_id).json()["file_id"]
    attachment = send(client, w["buyer"], case_id, [file_id]).json()["attachments"][0]
    url = download_url(client, w["buyer"], case_id, attachment["id"])

    s3.down = True
    read = client.get(url)
    assert read.status_code == 503 and read.json()["detail"]["code"] == "storage_unavailable"
    failed = upload_attachment(client, w["buyer"], case_id)
    assert failed.status_code == 503 and failed.json()["detail"]["code"] == "storage_unavailable"
    with factory() as db:
        # The failed upload's write intent is fenced as deleted (#76); it can never be linked.
        rows = dict(db.execute(select(StoredFile.id, StoredFile.status)).all())
        assert rows.pop(UUID(file_id)) == "clean"
        assert list(rows.values()) == ["deleted"]

    s3.down = False
    assert client.get(url).content == PNG
    assert upload_attachment(client, w["buyer"], case_id).status_code == 201
