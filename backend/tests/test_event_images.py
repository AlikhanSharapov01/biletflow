from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from uuid import UUID

import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import func, select, text

from app.admin_models import SettingVersion
from app.catalog_models import Event
from app.event_image_service import validated_image
from app.file_models import EventMedia, StoredFile
from app.security import now
from tests.test_admission import staff

API = "/api/v1"


def test_phone_orientation_survives_metadata_removal():
    output = BytesIO()
    image = Image.new("RGB", (3, 2), "red")
    exif = Image.Exif()
    exif[274] = 6
    image.save(output, format="JPEG", exif=exif)
    stored = validated_image(output.getvalue(), "image/jpeg", 2048)
    with Image.open(BytesIO(stored)) as decoded:
        assert decoded.size == (2, 3)
        assert not decoded.getexif()


def test_png_transparency_survives_metadata_removal():
    output = BytesIO()
    image = Image.new("P", (2, 2), 0)
    exif = Image.Exif()
    exif[315] = "private author"
    image.save(output, format="PNG", transparency=0, exif=exif)
    stored = validated_image(output.getvalue(), "image/png", 2048)
    with Image.open(BytesIO(stored)) as decoded:
        assert decoded.convert("RGBA").getpixel((0, 0))[3] == 0
        assert not decoded.getexif()


def test_animated_and_pixel_limit_images_rejected(monkeypatch):
    output = BytesIO()
    Image.new("RGB", (3, 2), "red").save(
        output, format="PNG", save_all=True, append_images=[Image.new("RGB", (3, 2), "blue")]
    )
    with pytest.raises(HTTPException) as error:
        validated_image(output.getvalue(), "image/png", 2048)
    assert error.value.detail["code"] == "image_rejected"
    monkeypatch.setattr("app.event_image_service.MAX_PIXELS", 5)
    with pytest.raises(HTTPException) as error:
        validated_image(picture(), "image/png", 2048)
    assert error.value.detail["code"] == "image_rejected"


def picture(kind="PNG"):
    output = BytesIO()
    Image.new("RGB", (3, 2), "red").save(output, format=kind)
    return output.getvalue()


def upload(client, f, data=None, content_type="image/png", headers=None):
    return client.post(
        API + f"/events/{f['event']['id']}/images",
        params={"alt_text": "Stage", "filename": "../../stage.png"},
        content=picture() if data is None else data,
        headers={**(headers or f["headers"]), "Content-Type": content_type},
    )


def test_gallery_cover_order_delete_and_catalog(client, setup):
    f = setup()
    url = API + f"/events/{f['event']['id']}/images"
    first = upload(client, f)
    assert first.status_code == 201, first.text
    a = first.json()
    b = upload(client, f, picture("JPEG"), "image/jpeg").json()
    assert a["is_cover"] and a["sort_order"] == 0
    assert client.get(a["url"]).status_code == 404
    assert client.get(a["url"], headers=f["headers"]).content == picture()
    assert client.put(url + f"/{b['id']}/cover", headers=f["headers"]).status_code == 200
    reordered = client.put(
        url + "/order", headers=f["headers"], json={"image_ids": [a["id"], b["id"]]}
    )
    assert reordered.status_code == 200, reordered.text
    assert [row["id"] for row in reordered.json()] == [a["id"], b["id"]]
    client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    detail = client.get(API + f"/events/{f['event']['id']}").json()
    assert detail["cover_image_url"] == a["url"]
    assert detail["images"] == client.get(API + "/events").json()[0]["images"]
    assert client.get(a["url"]).headers["x-content-type-options"] == "nosniff"
    assert client.delete(url + f"/{a['id']}", headers=f["headers"]).status_code == 204
    assert client.get(a["url"]).status_code == 404
    assert client.get(API + f"/events/{f['event']['id']}").json()["cover_image_url"] == b["url"]


@pytest.mark.parametrize(
    "data,mime,status",
    [
        (b"", "image/png", 422),
        (b"\x89PNG\r\n\x1a\nBAD", "image/png", 422),
        (b"<svg/>", "image/svg+xml", 415),
        (picture(), "image/jpeg", 422),
    ],
)
def test_invalid_images(client, setup, data, mime, status):
    assert upload(client, setup(), data, mime).status_code == status


def test_limits_and_same_event_order(client, setup, settings):
    f, other = setup(), setup()
    url = API + f"/events/{f['event']['id']}/images"
    assert upload(client, f, b"x" * (settings.attachment_max_bytes + 1)).status_code == 413
    images = [upload(client, f).json()["id"] for _ in range(10)]
    assert upload(client, f).status_code == 409
    foreign = upload(client, other).json()["id"]
    for ids in [images[:-1], images[:-1] + [foreign], [images[0]] * 10, images + [foreign]]:
        assert (
            client.put(url + "/order", headers=f["headers"], json={"image_ids": ids}).status_code
            == 422
        )


def test_editor_permissions_and_private_reads(client, setup, account, settings, factory):
    f = setup(visibility="private")
    editor = staff(client, settings, account, f, ["event_edit"])
    scanner = staff(client, settings, account, f, ["scan"])
    stranger = account()[2]
    assert upload(client, f, headers=scanner).status_code == 403
    assert upload(client, f, headers=stranger).status_code == 404
    image = upload(client, f, headers=editor).json()
    url = API + f"/events/{f['event']['id']}/images/{image['id']}"
    assert client.delete(url, headers=scanner).status_code == 403
    assert client.put(url + "/cover", headers=stranger).status_code == 404
    client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    assert client.get(image["url"]).status_code == 404
    assert client.get(image["url"], headers=stranger).status_code == 404
    assert client.get(image["url"], headers=editor).status_code == 200
    with factory.begin() as db:
        db.get(Event, UUID(f["event"]["id"])).visibility = "unlisted"
    assert client.get(image["url"]).status_code == 200
    assert client.get(API + "/events").json() == []
    client.post(API + f"/events/{f['event']['id']}/unpublish", headers=f["headers"])
    assert client.get(image["url"]).status_code == 404


def test_storage_failure_and_finalize_rollback(client, setup, app, factory, monkeypatch):
    f = setup()
    storage = app.state.storage
    real_put = storage.put

    def failed_put(key, data):
        real_put(key, data)
        raise OSError("disk failed after write")

    monkeypatch.setattr(storage, "put", failed_put)
    assert upload(client, f).status_code == 503
    assert list(storage.root.rglob("*")) == [] or not any(
        p.is_file() for p in storage.root.rglob("*")
    )
    with factory() as db:
        assert (
            db.scalar(
                select(func.count()).select_from(StoredFile).where(StoredFile.status == "clean")
            )
            == 0
        )

    def revoke_during_put(key, data):
        real_put(key, data)
        with factory.begin() as db:
            db.get(Event, UUID(f["event"]["id"])).moderation_state = "suspended"

    monkeypatch.setattr(storage, "put", revoke_during_put)
    assert upload(client, f).status_code == 409
    assert not any(p.is_file() for p in storage.root.rglob("*"))


def test_parallel_upload_cap(client, setup):
    f = setup()
    with ThreadPoolExecutor(max_workers=5) as pool:
        statuses = list(pool.map(lambda _: upload(client, f).status_code, range(12)))
    assert statuses.count(201) == 10 and statuses.count(409) == 2


def test_existing_client_upload_contract(client, setup):
    f = setup()
    response = client.post(
        API + f"/events/{f['event']['id']}/images",
        params={"filename": "stage.png"},
        content=picture(),
        headers={**f["headers"], "Content-Type": "image/png"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["mime_type"] == "image/png"
    assert response.json()["size_bytes"] == len(picture())


def test_database_commit_failure_preserves_previous_image(client, setup, app, factory):
    f = setup()
    original = upload(client, f).json()
    with factory.begin() as db:
        db.execute(
            text("""CREATE FUNCTION biletflow.reject_test_image() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test commit rejection'; END $$""")
        )
        db.execute(
            text("""CREATE CONSTRAINT TRIGGER reject_test_image AFTER INSERT ON biletflow.event_media
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION biletflow.reject_test_image()""")
        )
    try:
        assert upload(client, f).status_code == 503
    finally:
        with factory.begin() as db:
            db.execute(text("DROP TRIGGER reject_test_image ON biletflow.event_media"))
            db.execute(text("DROP FUNCTION biletflow.reject_test_image()"))
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(EventMedia)) == 1
        assert (
            db.scalar(
                select(func.count()).select_from(StoredFile).where(StoredFile.status == "deleted")
            )
            == 1
        )
    assert client.get(original["url"], headers=f["headers"]).status_code == 200
    assert len([p for p in app.state.storage.root.rglob("*") if p.is_file()]) == 1


def test_private_grant_revocation_and_cross_event_ids(client, setup, account):
    f, other = setup(visibility="private"), setup()
    image = upload(client, f).json()
    client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    headers = account()[2]
    uid = client.get(API + "/me", headers=headers).json()["id"]
    grant_url = API + f"/events/{f['event']['id']}/access"
    assert client.put(grant_url, headers=f["headers"], json={"user_id": uid}).status_code == 200
    assert client.get(image["url"], headers=headers).status_code == 200
    assert client.delete(grant_url + f"/{uid}", headers=f["headers"]).status_code == 200
    assert client.get(image["url"], headers=headers).status_code == 404
    wrong = API + f"/events/{other['event']['id']}/images/{image['id']}"
    assert client.get(wrong + "/content", headers=other["headers"]).status_code == 404
    assert client.put(wrong + "/cover", headers=other["headers"]).status_code == 404
    assert client.delete(wrong, headers=other["headers"]).status_code == 404


def test_body_validation_sanitization_and_effective_limit(client, setup, app, factory):
    f = setup()
    url = API + f"/events/{f['event']['id']}/images"
    for value in ["bad", "0"]:
        result = client.post(
            url,
            content=picture(),
            headers={**f["headers"], "Content-Type": "image/png", "Content-Length": value},
        )
        assert result.status_code == 422
    result = client.post(
        url,
        content=iter([picture(), b"<script>evil</script>"]),
        headers={**f["headers"], "Content-Type": "image/png"},
    )
    assert result.status_code == 201, result.text
    assert client.get(result.json()["url"], headers=f["headers"]).content == picture()
    with factory() as db:
        file = db.scalar(select(StoredFile))
        assert file.object_key.startswith(f"events/{f['event']['id']}/")
        assert ".." not in file.object_key
    with factory.begin() as db:
        db.add(
            SettingVersion(
                setting_key="upload_max_mb",
                version=1,
                value=1,
                effective_at=now(),
                actor_user_id=UUID(f["org"]["owner_user_id"]),
            )
        )
    assert upload(client, f, b"x" * (1024 * 1024 + 1)).status_code == 413
    app.state.settings.attachment_max_bytes = 100
    response = client.post(
        url,
        content=iter([b"a" * 60, b"b" * 60]),
        headers={**f["headers"], "Content-Type": "image/png"},
    )
    assert response.status_code == 413


def test_delete_failure_never_serves_retained_object(client, setup, app, monkeypatch, factory):
    f = setup()
    image = upload(client, f).json()

    def failed_delete(key):
        raise OSError("disk unavailable")

    monkeypatch.setattr(app.state.storage, "delete", failed_delete)
    url = API + f"/events/{f['event']['id']}/images/{image['id']}"
    assert client.delete(url, headers=f["headers"]).status_code == 204
    assert client.get(image["url"], headers=f["headers"]).status_code == 404
    with factory() as db:
        assert db.scalar(select(StoredFile)).status == "deleted"
