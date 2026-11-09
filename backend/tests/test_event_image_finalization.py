from contextlib import contextmanager
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app import event_image_service as images
from app.file_models import EventMedia, StoredFile
from tests.test_event_image_recovery import due_again
from tests.test_event_images import picture, upload


@pytest.mark.parametrize("verification_fails", [False, True])
def test_lost_finalize_ack_preserves_committed_gallery(
    client, setup, app, factory, monkeypatch, verification_fails
):
    f = setup()
    real_upload = images.upload
    transactions = 0

    @contextmanager
    def begin():
        nonlocal transactions
        transactions += 1
        number = transactions
        if number == 3 and verification_fails:
            raise SQLAlchemyError("fresh verification unavailable")
        with factory.begin() as db:
            yield db
        if number == 2:
            # PostgreSQL actually committed clean metadata and the link before ack loss.
            raise SQLAlchemyError("finalization acknowledgment lost")

    def uncertain_upload(_factory, *args):
        return real_upload(SimpleNamespace(begin=begin), *args)

    monkeypatch.setattr(images, "upload", uncertain_upload)
    assert upload(client, f).status_code == 503
    with factory() as db:
        file = db.scalar(select(StoredFile))
        media = db.scalar(select(EventMedia))
        assert file.status == "clean" and file.cleanup_after is None
        assert media.file_id == file.id
        content_url = images.image_record(media)["url"]
    assert client.get(content_url, headers=f["headers"]).content == picture()
    assert images.reconcile_images(factory, app.state.storage) == 0
    assert client.get(content_url, headers=f["headers"]).content == picture()


@pytest.mark.parametrize("fence_committed", [False, True])
def test_uncertain_compensation_defers_bytes_until_durable_recovery(
    client, setup, app, factory, monkeypatch, fence_committed
):
    f = setup()
    real_upload = images.upload
    transactions = 0

    @contextmanager
    def begin():
        nonlocal transactions
        transactions += 1
        number = transactions
        if number == 3 and not fence_committed:
            raise SQLAlchemyError("fresh verification unavailable")
        with factory.begin() as db:
            yield db
            if number == 2:
                # This path really rolls back, distinct from the committed-ack-loss test.
                raise SQLAlchemyError("finalization rolled back")
        if number == 3:
            raise SQLAlchemyError("orphan fence acknowledgment lost")

    def uncertain_upload(_factory, *args):
        return real_upload(SimpleNamespace(begin=begin), *args)

    monkeypatch.setattr(images, "upload", uncertain_upload)
    assert upload(client, f).status_code == 503
    with factory() as db:
        file = db.scalar(select(StoredFile))
        identifier, key = file.id, file.object_key
        assert file.status == ("deleted" if fence_committed else "pending")
        assert file.cleanup_after is not None
        assert db.scalar(select(EventMedia)) is None
    assert app.state.storage.get(key) == picture()
    due_again(factory, identifier)
    assert images.reconcile_images(factory, app.state.storage) == 1
    assert not app.state.storage.path(key).exists()


@pytest.mark.parametrize("transparency", [0, bytes([0, 128])])
def test_palette_transparency_survives_api_upload(client, setup, app, factory, transparency):
    f = setup()
    image = Image.new("P", (2, 1), 0)
    image.putpalette([255, 0, 0, 0, 0, 255] + [0] * 762)
    image.putpixel((1, 0), 1)
    metadata = PngInfo()
    metadata.add_text("Author", "private source metadata")
    output = BytesIO()
    image.save(output, format="PNG", transparency=transparency, pnginfo=metadata)
    response = upload(client, f, output.getvalue())
    assert response.status_code == 201, response.text
    returned = client.get(response.json()["url"], headers=f["headers"])
    assert returned.status_code == 200
    with factory() as db:
        stored = app.state.storage.get(db.scalar(select(StoredFile.object_key)))
    assert returned.content == stored
    with Image.open(BytesIO(stored)) as decoded:
        rgba = decoded.convert("RGBA")
        assert rgba.getpixel((0, 0)) == (255, 0, 0, 0)
        assert rgba.getpixel((1, 0)) == (0, 0, 255, 255 if transparency == 0 else 128)
        assert "Author" not in decoded.info and not decoded.getexif()
