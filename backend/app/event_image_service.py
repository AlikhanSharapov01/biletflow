"""Event gallery metadata; object writes happen outside business transactions."""

import hashlib
import logging
import warnings
from io import BytesIO
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from .admin_service import effective_setting
from .attachment_service import ALLOWED_TYPES, clean_filename
from .catalog_models import Organization
from .catalog_service import catalog_audit, changed, editable, event_guard
from .file_models import EventMedia, StoredFile
from .security import fail, now
from .service import valid_session

MAX_IMAGES = 10
MAX_PIXELS = 16_000_000
IMAGE_TYPES = {key: ALLOWED_TYPES[key] for key in ("image/png", "image/jpeg")}
logger = logging.getLogger(__name__)


def image_limit(db, settings):
    return min(settings.attachment_max_bytes, effective_setting(db, "upload_max_mb") * 1024 * 1024)


def validated_image(data, content_type, limit):
    if not data:
        fail("image_empty", 422)
    if len(data) > limit:
        fail("image_too_large", 413)
    if not any(data.startswith(sig) for sig in IMAGE_TYPES[content_type]):
        fail("image_rejected", 422)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                expected = "PNG" if content_type == "image/png" else "JPEG"
                if (
                    image.format != expected
                    or image.width * image.height > MAX_PIXELS
                    or getattr(image, "n_frames", 1) != 1
                ):
                    fail("image_rejected", 422)
                image.load()
                image = ImageOps.exif_transpose(image)
                # Re-encode decoded pixels: discard metadata and appended active content.
                output = BytesIO()
                image.convert(
                    "RGBA" if expected == "PNG" and "A" in image.getbands() else "RGB"
                ).save(output, format=expected)
                result = output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        fail("image_rejected", 422)
    if len(result) > limit:
        fail("image_too_large", 413)
    return result


def image_record(row):
    return {
        "id": row.id,
        "url": f"/api/v1/events/{row.event_id}/images/{row.id}/content",
        "alt_text": row.alt_text,
        "sort_order": row.sort_order,
        "is_cover": row.sort_order == 0,
        "mime_type": row.file.mime_type,
        "size_bytes": row.file.size_bytes,
    }


def gallery(db, event_id):
    return list(
        db.scalars(
            select(EventMedia)
            .where(EventMedia.event_id == event_id)
            .order_by(EventMedia.sort_order)
        )
    )


def image_records(db, event_id):
    return [image_record(row) for row in gallery(db, event_id)]


def editor(db, ids, event_id, lock=False):
    user, _ = valid_session(db, *ids, lock=lock)
    event = event_guard(db, user, event_id, "event_edit", lock=lock)
    editable(event)
    return user, event


def audit(db, user, event, action, row=None):
    changed(event)
    catalog_audit(db, user, action, db.get(Organization, event.organization_id), event, target=row)


def upload(factory, storage, settings, ids, event_id, filename, alt_text, content_type, data):
    # Reserve durable metadata before IO; a process interruption leaves a reconcilable pending key.
    file_id = uuid4()
    key = f"events/{event_id}/{file_id}"
    with factory.begin() as db:
        user, _ = editor(db, ids, event_id)
        data = validated_image(data, content_type, image_limit(db, settings))
        db.add(
            StoredFile(
                id=file_id,
                uploaded_by_user_id=user.id,
                object_key=key,
                purpose="event_image",
                mime_type=content_type,
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                original_filename=clean_filename(filename),
                status="pending",
            )
        )
    try:
        storage.put(key, data)
        with factory.begin() as db:
            user, event = editor(db, ids, event_id, lock=True)
            rows = gallery(db, event_id)
            if len(rows) >= MAX_IMAGES:
                fail("image_limit_reached", 409)
            file = db.get(StoredFile, file_id)
            file.status, file.scanned_at = "clean", now()
            row = EventMedia(
                event_id=event_id, file_id=file_id, sort_order=len(rows), alt_text=alt_text
            )
            db.add(row)
            db.flush()
            audit(db, user, event, "event.image_uploaded", row)
            result = image_record(row)
        return result
    except BaseException as exc:
        # Only this upload's object is compensated, never an existing gallery image.
        try:
            with factory.begin() as db:
                db.get(StoredFile, file_id).status = "deleted"
        except SQLAlchemyError:
            logger.warning(
                "Event image metadata cleanup failed; pending key retained for reconciliation"
            )
        try:
            storage.delete(key)
        except OSError:
            logger.warning(
                "Event image cleanup failed; deleted metadata retained for reconciliation"
            )
        if isinstance(exc, OSError):
            fail("storage_unavailable", 503)
        raise


def reorder(db, user, event, image_ids):
    rows = gallery(db, event.id)
    by_id = {row.id: row for row in rows}
    if len(image_ids) != len(by_id) or set(image_ids) != set(by_id):
        fail("invalid_image_order", 422)
    for position, identifier in enumerate(image_ids):
        by_id[identifier].sort_order = position
    audit(db, user, event, "event.images_reordered")
    db.flush()
    return [image_record(by_id[identifier]) for identifier in image_ids]


def remove(db, user, event, image_id):
    rows = gallery(db, event.id)
    row = next((row for row in rows if row.id == image_id), None)
    if row is None:
        fail("image_not_found", 404)
    file = db.get(StoredFile, row.file_id)
    file.status = "deleted"
    db.delete(row)
    for position, remaining in enumerate(item for item in rows if item.id != image_id):
        remaining.sort_order = position
    audit(db, user, event, "event.image_deleted", row)
    return file.object_key
