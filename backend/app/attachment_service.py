"""BF-16 support attachments: content-validated private uploads and signed, re-authorized downloads.

Bytes live in a FileStorage under `support/<case_id>/<file_id>`; the database holds only metadata.
A file is uploaded first (status pending -> clean), then linked to one message of the same case
by its uploader within an hour. Download links are short-lived HMAC tokens that only identify the
attachment and the user; every download re-checks that the user still belongs to the case.
"""

import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .file_models import StoredFile, SupportAttachment
from .models import User
from .security import fail, now
from .signing import b64, unb64
from .support_models import SupportCase
from .support_service import case_roles, get_case, support_audit

ALLOWED_TYPES = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "application/pdf": (b"%PDF-",),
}
# How long an uploaded file stays linkable to a message.
LINK_WINDOW = timedelta(hours=1)
MAX_FILENAME = 200
DOWNLOAD_PURPOSE = "support_attachment"
DOWNLOAD_PATH = "/api/v1/support/attachments"


def clean_filename(filename):
    name = "".join(
        "_" if ch in "/\\" or ord(ch) < 32 or ord(ch) == 127 else ch for ch in filename.strip()
    ).strip()
    if not 1 <= len(name) <= MAX_FILENAME:
        fail("invalid_input", 422)
    return name


def object_key(case_id, file_id):
    return f"support/{case_id}/{file_id}"


def sniff(db, user, case_id, file_id, filename, content_type, data):
    """Return the declared type when the bytes match it; otherwise keep a rejected record."""
    if any(data.startswith(signature) for signature in ALLOWED_TYPES.get(content_type, ())):
        return content_type
    # Own short transaction: the caller's one is rolled back by the failure raised below.
    with Session(db.get_bind()) as separate, separate.begin():
        separate.add(
            StoredFile(
                id=file_id,
                uploaded_by_user_id=user.id,
                object_key=object_key(case_id, file_id),
                purpose="support_attachment",
                mime_type=content_type,
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                original_filename=filename,
                status="rejected",
            )
        )
    fail("attachment_rejected", 422)


def upload_attachment(db, storage, settings, user, case_id, filename, content_type, data):
    case, _ = get_case(db, user, case_id)  # participants only; outsiders get 404
    name = clean_filename(filename)
    if not data:
        fail("attachment_empty", 422)
    if len(data) > settings.attachment_max_bytes:
        fail("attachment_too_large", 413)
    file_id = uuid4()
    mime_type = sniff(db, user, case.id, file_id, name, content_type, data)
    file = StoredFile(
        id=file_id,
        uploaded_by_user_id=user.id,
        object_key=object_key(case.id, file_id),
        purpose="support_attachment",
        mime_type=mime_type,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        original_filename=name,
        status="pending",
    )
    db.add(file)
    db.flush()
    # No row lock is held while the object is written. A scanner would sit between these steps.
    storage.put(file.object_key, data)
    try:
        file.status = "clean"
        file.scanned_at = now()
        support_audit(
            db,
            user,
            "support.attachment_uploaded",
            case,
            file_id=file.id,
            size_bytes=file.size_bytes,
            mime_type=file.mime_type,
        )
        db.flush()
    except BaseException:
        storage.delete(file.object_key)  # never leave an object without a row
        raise
    return file


def link_expires_at(file):
    return file.created_at + LINK_WINDOW


def unavailable(file_id):
    raise HTTPException(409, detail={"code": "attachment_not_available", "file_id": str(file_id)})


def attach_files(db, user, case, message, file_ids):
    if not file_ids:
        return []
    files = {
        f.id: f
        for f in db.scalars(
            select(StoredFile)
            .where(StoredFile.id.in_(file_ids))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    }
    already = set(
        db.scalars(select(SupportAttachment.file_id).where(SupportAttachment.file_id.in_(file_ids)))
    )
    cutoff = now() - LINK_WINDOW
    for file_id in file_ids:
        file = files.get(file_id)
        if (
            file is None
            or file.purpose != "support_attachment"
            or file.status != "clean"
            or file.uploaded_by_user_id != user.id
            or not file.object_key.startswith(f"support/{case.id}/")
            or file.created_at <= cutoff
            or file_id in already
        ):
            unavailable(file_id)
    # Distinct timestamps keep the order the sender chose (the transaction time is shared).
    started = now()
    rows = [
        SupportAttachment(
            case_id=case.id,
            message_id=message.id,
            file_id=file_id,
            original_filename=files[file_id].original_filename or "attachment",
            created_at=started + timedelta(microseconds=position),
        )
        for position, file_id in enumerate(file_ids)
    ]
    try:
        with db.begin_nested():
            db.add_all(rows)
    except IntegrityError:
        # Backstop for a concurrent link of the same file: UNIQUE (file_id).
        unavailable(file_ids[0])
    return rows


# --- signed download links -----------------------------------------------------------------


def signature(settings, payload):
    key = settings.challenge_secret.get_secret_value().encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).digest()


def make_download_token(settings, attachment_id, user_id, expires_at):
    payload = f"{DOWNLOAD_PURPOSE}:{attachment_id}:{user_id}:{int(expires_at.timestamp())}"
    return f"{b64(payload.encode())}.{b64(signature(settings, payload))}"


def read_download_token(settings, token):
    """(attachment_id, user_id, expires_at) of a genuine token, or None. Expiry is not checked."""
    try:
        body, mac = token.split(".", 1)
        payload = unb64(body).decode()
        if not hmac.compare_digest(unb64(mac), signature(settings, payload)):
            return None
        purpose, attachment_id, user_id, expiry = payload.split(":")
        if purpose != DOWNLOAD_PURPOSE:
            return None
        return UUID(attachment_id), UUID(user_id), datetime.fromtimestamp(int(expiry), UTC)
    except (ValueError, TypeError):
        return None


def download_link(db, settings, user, case_id, attachment_id):
    case, _ = get_case(db, user, case_id)
    attachment = db.get(SupportAttachment, attachment_id)
    if not attachment or attachment.case_id != case.id:
        fail("attachment_not_found", 404)
    file = db.get(StoredFile, attachment.file_id)
    if not file or file.status != "clean":
        fail("attachment_not_found", 404)
    expires_at = now() + timedelta(seconds=settings.attachment_link_seconds)
    token = make_download_token(settings, attachment.id, user.id, expires_at)
    return {
        "url": f"{DOWNLOAD_PATH}/{attachment.id}/content?token={token}",
        "expires_at": expires_at,
    }


def download_content(db, storage, settings, token, attachment_id):
    claims = read_download_token(settings, token)
    if claims is None or claims[0] != attachment_id:
        fail("download_link_invalid", 401)
    _, user_id, expires_at = claims
    if expires_at <= now():
        fail("download_link_expired", 401)
    # The link is only a convenience: access is decided again, now.
    user = db.get(User, user_id)
    attachment = db.get(SupportAttachment, attachment_id)
    case = db.get(SupportCase, attachment.case_id) if attachment else None
    file = db.get(StoredFile, attachment.file_id) if attachment else None
    if (
        not user
        or user.status != "active"
        or not case
        or not case_roles(db, user, case)
        or file.status != "clean"
    ):
        fail("attachment_not_found", 404)
    try:
        data = storage.get(file.object_key)
    except FileNotFoundError:
        fail("attachment_not_found", 404)
    return data, file.mime_type, attachment.original_filename


def content_disposition(filename):
    fallback = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\%;' else "_" for ch in filename)
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"
