from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, update

from app.attachment_service import make_download_token
from app.catalog_models import StaffPermission
from app.file_models import StoredFile, SupportAttachment
from app.models import AuditLog
from app.security import now
from app.storage import LocalFileStorage
from tests.test_admission import free_ticket, published, staff
from tests.test_support import SUPPORT, me, open_case

PNG = b"\x89PNG\r\n\x1a\n" + b"png-body" * 20
JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-body" * 20
PDF = b"%PDF-1.7\n" + b"pdf-body" * 20


@pytest.fixture
def settings(settings, tmp_path):
    # create_app builds the storage from settings.storage_root, and the support router captures
    # that object. The conftest `app` fixture deep-copies whatever `settings` resolves to, so
    # overriding `settings` per test gives every test a private storage directory and small
    # limits without touching conftest.py.
    return settings.model_copy(
        update={"storage_root": str(tmp_path / "storage"), "attachment_max_bytes": 2048}
    )


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


def upload(client, headers, case_id, data=PNG, content_type="image/png", name="receipt.png"):
    return client.post(
        SUPPORT + f"/cases/{case_id}/attachments",
        params={"filename": name},
        content=data,
        headers={**headers, "Content-Type": content_type},
    )


def send(client, headers, case_id, file_ids, cmid=None, text="see attached"):
    return client.post(
        SUPPORT + f"/cases/{case_id}/messages",
        headers=headers,
        json={
            "client_message_id": cmid or str(uuid4()),
            "body": text,
            "attachment_ids": file_ids,
        },
    )


def new_case(client, w):
    r = open_case(client, w["buyer"], w["f"])
    assert r.status_code == 201, r.text
    return r.json()["case"]["id"]


def test_upload_attach_and_download_round_trip(client, app, world):
    w = world
    case_id = new_case(client, w)
    up = upload(client, w["buyer"], case_id, name="my receipt.png")
    assert up.status_code == 201, up.text
    file = up.json()
    assert file["mime_type"] == "image/png" and file["size_bytes"] == len(PNG)
    assert file["status"] == "clean" and len(file["sha256"]) == 64 and "expires_at" in file
    assert "object_key" not in file

    sent = send(client, w["buyer"], case_id, [file["file_id"]])
    assert sent.status_code == 201, sent.text
    attachment = sent.json()["attachments"][0]
    assert attachment["file_id"] == file["file_id"]
    assert attachment["original_filename"] == "my receipt.png"
    assert attachment["mime_type"] == "image/png" and attachment["size_bytes"] == len(PNG)

    # Message lists and /updates (also used by WebSocket delivery) carry the attachment.
    listed = client.get(SUPPORT + f"/cases/{case_id}/messages", headers=w["support"])
    updates = client.get(SUPPORT + f"/cases/{case_id}/updates", headers=w["buyer"])
    for page in (listed, updates):
        assert page.status_code == 200
        item = [i for i in page.json()["items"] if i["id"] == sent.json()["id"]][0]
        assert [a["id"] for a in item["attachments"]] == [attachment["id"]]
        assert item["attachments"][0]["original_filename"] == "my receipt.png"
    first = client.get(SUPPORT + f"/cases/{case_id}/messages", headers=w["buyer"]).json()["items"]
    assert first[0]["attachments"] == []

    # Both participants get a short-lived link whose bytes are identical to the upload.
    for headers in (w["buyer"], w["support"]):
        link = client.get(
            SUPPORT + f"/cases/{case_id}/attachments/{attachment['id']}/download-link",
            headers=headers,
        )
        assert link.status_code == 200, link.text
        assert link.json()["url"].startswith(
            f"/api/v1/support/attachments/{attachment['id']}/content?token="
        )
        got = client.get(link.json()["url"])  # no bearer header: the token is the credential
        assert got.status_code == 200 and got.content == PNG
        assert got.headers["content-type"] == "image/png"
        assert got.headers["content-disposition"].startswith(
            'attachment; filename="my receipt.png"'
        )
        assert "filename*=UTF-8''my%20receipt.png" in got.headers["content-disposition"]
        assert "no-store" in got.headers["cache-control"]
        assert got.headers["x-content-type-options"] == "nosniff"

    # The private object key never leaves the server, and the bytes sit under it on disk.
    with app.state.sessions() as db:
        key = db.scalar(select(StoredFile.object_key))
    assert key == f"support/{case_id}/{file['file_id']}"
    assert app.state.storage.get(key) == PNG
    for body in (up.text, sent.text, listed.text, updates.text, link.text):
        assert key not in body and "object_key" not in body

    # Replay: same retry key and attachments returns the message; other attachments conflict.
    again = send(
        client, w["buyer"], case_id, [file["file_id"]], cmid=sent.json()["client_message_id"]
    )
    assert again.status_code == 200 and again.json()["replayed"] is True
    assert again.json()["attachments"][0]["id"] == attachment["id"]
    different = send(client, w["buyer"], case_id, [], cmid=sent.json()["client_message_id"])
    assert different.status_code == 409
    assert different.json()["detail"]["code"] == "client_message_conflict"


def test_staff_attachment_pdf_jpeg_and_audit(client, app, world, factory):
    w = world
    case_id = new_case(client, w)
    ids = []
    for data, ctype, name in (
        (PDF, "application/pdf", "../x\\evil\n.pdf"),
        (JPEG, "image/jpeg", "p.jpg"),
    ):
        up = upload(client, w["support"], case_id, data, ctype, name)
        assert up.status_code == 201, up.text
        ids.append(up.json()["file_id"])
    sent = send(client, w["support"], case_id, ids)
    assert sent.status_code == 201, sent.text
    assert [a["mime_type"] for a in sent.json()["attachments"]] == ["application/pdf", "image/jpeg"]
    assert sent.json()["attachments"][0]["original_filename"] == ".._x_evil_.pdf"
    with factory() as db:
        uploaded = db.scalars(
            select(AuditLog).where(AuditLog.action == "support.attachment_uploaded")
        ).all()
    assert len(uploaded) == 2 and {a.safe_change["mime_type"] for a in uploaded} == {
        "application/pdf",
        "image/jpeg",
    }
    assert all("object_key" not in a.safe_change for a in uploaded)


def test_open_case_with_attachment_ids_is_not_available(client, world):
    w = world
    r = open_case(client, w["buyer"], w["f"], attachment_ids=[str(uuid4())])
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "attachment_not_available"
    assert "file_id" in r.json()["detail"]


def test_content_mismatch_is_rejected_and_recorded(client, app, world, factory):
    w = world
    case_id = new_case(client, w)
    r = upload(client, w["buyer"], case_id, JPEG, "image/png")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "attachment_rejected"
    with factory() as db:
        row = db.scalars(select(StoredFile)).one()
        assert row.status == "rejected" and row.size_bytes == len(JPEG)
        assert row.purpose == "support_attachment" and len(row.sha256) == 64
        key = row.object_key
    with pytest.raises(FileNotFoundError):
        app.state.storage.get(key)
    # A rejected file can never be linked.
    with factory() as db:
        rejected_id = str(row.id)
    linked = send(client, w["buyer"], case_id, [rejected_id])
    assert linked.status_code == 409 and linked.json()["detail"]["file_id"] == rejected_id


def test_size_type_and_empty_limits(client, world, factory):
    w = world
    case_id = new_case(client, w)
    big = upload(client, w["buyer"], case_id, PNG + b"x" * 3000)
    assert big.status_code == 413 and big.json()["detail"]["code"] == "attachment_too_large"
    # Without a Content-Length header the limit is enforced while the body streams in.
    chunked = upload(client, w["buyer"], case_id, iter([PNG, b"x" * 3000]))
    assert chunked.status_code == 413 and chunked.json()["detail"]["code"] == "attachment_too_large"
    text = upload(client, w["buyer"], case_id, b"hello", "text/plain", "a.txt")
    assert text.status_code == 415 and text.json()["detail"]["code"] == "unsupported_media_type"
    nothing = client.post(
        SUPPORT + f"/cases/{case_id}/attachments",
        params={"filename": "a.png"},
        headers={**w["buyer"], "Content-Type": "image/png"},
    )
    assert nothing.status_code == 422 and nothing.json()["detail"]["code"] == "attachment_empty"
    nameless = upload(client, w["buyer"], case_id, name="  ")
    assert nameless.status_code == 422
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(StoredFile)) == 0


def test_linking_rules(client, world, factory):
    w = world
    case_id, other_case = new_case(client, w), new_case(client, w)
    mine = upload(client, w["buyer"], case_id).json()["file_id"]
    theirs = upload(client, w["support"], case_id).json()["file_id"]
    elsewhere = upload(client, w["buyer"], other_case).json()["file_id"]

    def unavailable(r, file_id):
        assert r.status_code == 409, r.text
        assert r.json()["detail"] == {"code": "attachment_not_available", "file_id": file_id}

    unavailable(send(client, w["buyer"], case_id, [theirs]), theirs)  # somebody else's upload
    unavailable(send(client, w["buyer"], case_id, [elsewhere]), elsewhere)  # another case
    unknown = str(uuid4())
    unavailable(send(client, w["buyer"], case_id, [unknown]), unknown)
    assert send(client, w["buyer"], case_id, [mine]).status_code == 201
    unavailable(send(client, w["buyer"], case_id, [mine]), mine)  # twice
    unavailable(send(client, w["buyer"], other_case, [mine]), mine)

    # An hour after the upload the file can no longer be linked.
    stale = upload(client, w["buyer"], case_id).json()["file_id"]
    with factory.begin() as db:
        db.execute(
            update(StoredFile)
            .where(StoredFile.id == stale)
            .values(created_at=now() - timedelta(hours=2))
        )
    unavailable(send(client, w["buyer"], case_id, [stale]), stale)

    # Validation: duplicates and more than the configured maximum are invalid input.
    fresh = [upload(client, w["buyer"], case_id).json()["file_id"] for _ in range(6)]
    dup = send(client, w["buyer"], case_id, [fresh[0], fresh[0]])
    assert dup.status_code == 422 and dup.json()["detail"]["code"] == "invalid_input"
    many = send(client, w["buyer"], case_id, fresh)
    assert many.status_code == 422 and many.json()["detail"]["code"] == "invalid_input"
    assert send(client, w["buyer"], case_id, fresh[:5]).status_code == 201
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(SupportAttachment)) == 6


def test_strangers_and_tokens(client, app, world, factory, settings):
    w = world
    case_id = new_case(client, w)
    file_id = upload(client, w["buyer"], case_id).json()["file_id"]
    message = send(client, w["buyer"], case_id, [file_id]).json()
    attachment_id = message["attachments"][0]["id"]
    link_url = SUPPORT + f"/cases/{case_id}/attachments/{attachment_id}/download-link"

    denied = upload(client, w["other"], case_id)
    assert denied.status_code == 404 and denied.json()["detail"]["code"] == "case_not_found"
    assert client.get(link_url, headers=w["other"]).status_code == 404
    assert upload(client, {}, case_id).status_code == 401
    assert client.get(link_url).status_code == 401

    content = SUPPORT + f"/attachments/{attachment_id}/content"
    buyer_id = me(client, w["buyer"])
    support_id = me(client, w["support"])
    forged = client.get(content, params={"token": "AAAA.BBBB"})
    assert forged.status_code == 401 and forged.json()["detail"]["code"] == "download_link_invalid"
    assert client.get(content, params={"token": "garbage"}).status_code == 401
    good = client.get(link_url, headers=w["support"]).json()["url"]
    token = good.split("token=")[1]
    tampered = token[:-2] + ("AA" if not token.endswith("AA") else "BB")
    assert client.get(content, params={"token": tampered}).status_code == 401
    other_attachment = f"{SUPPORT}/attachments/{uuid4()}/content"  # token for a different id
    assert client.get(other_attachment, params={"token": token}).status_code == 401

    soon = now() + timedelta(seconds=60)
    past = now() - timedelta(seconds=5)
    expired = make_download_token(settings, attachment_id, support_id, past)
    r = client.get(content, params={"token": expired})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "download_link_expired"
    # A genuine token for a user who never belonged to the case opens nothing.
    stranger = make_download_token(settings, attachment_id, me(client, w["other"]), soon)
    assert client.get(content, params={"token": stranger}).status_code == 404
    assert (
        client.get(
            content, params={"token": make_download_token(settings, attachment_id, buyer_id, soon)}
        ).status_code
        == 200
    )

    # The support member held a valid link, then lost the support permission: access ends.
    assert client.get(content, params={"token": token}).status_code == 200
    with factory.begin() as db:
        db.execute(update(StaffPermission).values(revoked_at=func.now()))
    revoked = client.get(content, params={"token": token})
    assert revoked.status_code == 404 and revoked.json()["detail"]["code"] == "attachment_not_found"
    assert client.get(link_url, headers=w["support"]).status_code == 404
    # The requester is unaffected.
    assert client.get(client.get(link_url, headers=w["buyer"]).json()["url"]).status_code == 200


def test_missing_object_and_wrong_case(client, app, world):
    w = world
    case_id, other_case = new_case(client, w), new_case(client, w)
    file_id = upload(client, w["buyer"], case_id).json()["file_id"]
    attachment_id = send(client, w["buyer"], case_id, [file_id]).json()["attachments"][0]["id"]
    # An attachment is only reachable through its own case.
    wrong = client.get(
        SUPPORT + f"/cases/{other_case}/attachments/{attachment_id}/download-link",
        headers=w["buyer"],
    )
    assert wrong.status_code == 404 and wrong.json()["detail"]["code"] == "attachment_not_found"
    url = client.get(
        SUPPORT + f"/cases/{case_id}/attachments/{attachment_id}/download-link", headers=w["buyer"]
    ).json()["url"]
    app.state.storage.delete(f"support/{case_id}/{file_id}")
    gone = client.get(url)
    assert gone.status_code == 404 and gone.json()["detail"]["code"] == "attachment_not_found"


def test_upload_rate_limit(client, world):
    w = world
    case_id = new_case(client, w)
    codes = [upload(client, w["buyer"], case_id).status_code for _ in range(21)]
    assert codes[:20] == [201] * 20 and codes[20] == 429


def test_local_storage_round_trip_and_key_validation(tmp_path):
    storage = LocalFileStorage(tmp_path / "root")
    storage.put("a/b/c", b"one")
    assert storage.get("a/b/c") == b"one"
    storage.put("a/b/c", b"two")  # atomic overwrite
    assert storage.get("a/b/c") == b"two"
    assert [p.name for p in (tmp_path / "root" / "a" / "b").iterdir()] == ["c"]
    storage.delete("a/b/c")
    storage.delete("a/b/c")  # idempotent
    with pytest.raises(FileNotFoundError):
        storage.get("a/b/c")
    for key in ("../x", "a/../x", "/abs", "a//b", "", "a/./b", "a\\b", "a/"):
        for call in (lambda k: storage.put(k, b"x"), storage.get, storage.delete):
            with pytest.raises(ValueError):
                call(key)
    assert not (tmp_path / "x").exists()
