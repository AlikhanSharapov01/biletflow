"""BF-16 support attachments: validated, malware-scanned private uploads and signed downloads.

Bytes live in a FileStorage under `support/<case_id>/<file_id>`; the database holds only metadata.
A file is uploaded first, then linked to one message of the same case by its uploader within an
hour. Download links are short-lived HMAC tokens that only identify the attachment and the user;
every download re-checks that the user still belongs to the case.

Upload screening (#75), before any transaction: the bytes must be a structurally valid file of
the declared type (file_content.py), then the malware scanner (malware_scanner.py) decides.
Malformed or infected files are kept as `rejected` rows and their bytes are never stored. When the
scanner gives no verdict the file is stored as `quarantined` (fail closed: never linkable or
downloadable) and an `attachment_scan` outbox job retries the scan from the worker until a verdict
or the end of the link window. Only `clean` files can be linked, listed or downloaded.
"""

import hashlib
import hmac
import logging
from datetime import UTC, datetime, timedelta
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError

from .file_content import valid_content
from .file_models import StoredFile, SupportAttachment
from .malware_scanner import ScannerUnavailable
from .models import AuditLog, OutboxJob, User
from .platform_settings import upload_limit
from .security import fail, now
from .service import valid_session
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
SCAN_KIND = "attachment_scan"
SCAN_LEASE = timedelta(minutes=2)
# Scan retries back off 2, 4, 8 ... seconds, at most this long apart.
SCAN_RETRY_MAX_SECONDS = 60
SCANNER_ACTOR = "attachment_scanner"
logger = logging.getLogger(__name__)


def clean_filename(filename):
    name = "".join(
        "_" if ch in "/\\" or ord(ch) < 32 or ord(ch) == 127 else ch for ch in filename.strip()
    ).strip()
    if not 1 <= len(name) <= MAX_FILENAME:
        fail("invalid_input", 422)
    return name


def object_key(case_id, file_id):
    return f"support/{case_id}/{file_id}"


def scan(scanner, data):
    """(outcome, signature): "clean", "infected" with the signature, or "quarantined"."""
    try:
        signature = scanner.scan(data)
    except ScannerUnavailable:
        return "quarantined", None
    return ("infected", signature) if signature else ("clean", None)


def screen(scanner, content_type, data):
    """Content validation, then the malware scan. No database work and no locks held."""
    if not valid_content(content_type, data):
        return "malformed", None
    return scan(scanner, data)


def check_upload(db, settings, ids, case_id, data):
    user, _ = valid_session(db, *ids)
    case, _ = get_case(db, user, case_id)  # participants only; outsiders get 404
    if len(data) > upload_limit(db, settings):
        fail("attachment_too_large", 413)
    return user, case


def upload_view(file):
    return {
        "file_id": file.id,
        "mime_type": file.mime_type,
        "size_bytes": file.size_bytes,
        "sha256": file.sha256,
        "status": file.status,
        "expires_at": link_expires_at(file),
    }


def queue_scan(db, case, file):
    db.add(
        OutboxJob(
            event_id=case.event_id,
            kind=SCAN_KIND,
            deduplication_key=f"attachment-scan:{file.id}",
            payload={"version": 1, "file_id": str(file.id), "case_id": str(case.id)},
        )
    )


def upload_attachment(
    factory, storage, scanner, settings, ids, case_id, filename, content_type, data
):
    name = clean_filename(filename)
    if not data:
        fail("attachment_empty", 422)
    with factory() as db:
        check_upload(db, settings, ids, case_id, data)  # nothing is scanned for strangers
    outcome, signature = screen(scanner, content_type, data)
    file_id = uuid4()
    with factory.begin() as db:
        user, case = check_upload(db, settings, ids, case_id, data)
        file = StoredFile(
            id=file_id,
            uploaded_by_user_id=user.id,
            object_key=object_key(case.id, file_id),
            purpose="support_attachment",
            mime_type=content_type,
            size_bytes=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
            original_filename=name,
            status="pending",
        )
        db.add(file)
        if outcome in ("malformed", "infected"):
            # Kept for audit; no bytes are ever stored for a rejected file.
            file.status = "rejected"
            if outcome == "infected":
                file.scanned_at = now()
                support_audit(
                    db,
                    user,
                    "support.attachment_uploaded",
                    case,
                    file_id=file.id,
                    size_bytes=file.size_bytes,
                    mime_type=file.mime_type,
                    status=file.status,
                    malware=signature,
                )
            result = None
        else:
            db.flush()
            # No row lock is held while the object is written.
            storage.put(file.object_key, data)
            try:
                file.status = "clean" if outcome == "clean" else "quarantined"
                file.scanned_at = now() if outcome == "clean" and scanner.enabled else None
                if outcome == "quarantined":
                    queue_scan(db, case, file)
                support_audit(
                    db,
                    user,
                    "support.attachment_uploaded",
                    case,
                    file_id=file.id,
                    size_bytes=file.size_bytes,
                    mime_type=file.mime_type,
                    status=file.status,
                    scanned=file.scanned_at is not None,
                )
                db.flush()
                result = upload_view(file)
            except BaseException:
                storage.delete(file.object_key)  # never leave an object without a row
                raise
    if outcome == "malformed":
        fail("attachment_rejected", 422)
    if outcome == "infected":
        fail("attachment_infected", 422)
    return result


def upload_status(db, user, case_id, file_id):
    """The uploader's view of one of their uploads to this case (e.g. while quarantined)."""
    case, _ = get_case(db, user, case_id)
    file = db.get(StoredFile, file_id)
    if (
        not file
        or file.purpose != "support_attachment"
        or file.uploaded_by_user_id != user.id
        or file.object_key != object_key(case.id, file.id)
    ):
        fail("attachment_not_found", 404)
    return upload_view(file)


def scan_audit(db, case, file, signature=None):
    change = {"case_id": str(case.id), "file_id": str(file.id), "status": file.status}
    if signature:
        change["malware"] = signature
    db.add(
        AuditLog(
            service_actor=SCANNER_ACTOR,
            organization_id=case.organization_id,
            event_id=case.event_id,
            action="support.attachment_scanned",
            entity_type="support_case",
            entity_id=case.id,
            description="support.attachment_scanned",
            safe_change=change,
            correlation_id=case.id,
        )
    )


def scan_attachments_once(factory, storage, scanner):
    """Worker step: retry the malware scan of one quarantined attachment.

    The job is leased in a short transaction; the object is read and scanned with no lock held;
    the verdict is recorded only while the lease is still ours and the file still quarantined.
    No verdict (scanner or storage unavailable) re-queues the job with back-off, so the file stays
    quarantined. A file that left quarantine or whose link window ended needs no scan.
    """
    with factory.begin() as db:
        job = db.scalar(
            select(OutboxJob)
            .where(
                OutboxJob.kind == SCAN_KIND,
                or_(
                    and_(OutboxJob.status == "pending", OutboxJob.available_at <= now()),
                    and_(OutboxJob.status == "leased", OutboxJob.lease_until <= now()),
                ),
            )
            .order_by(OutboxJob.available_at, OutboxJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not job:
            return False
        job.status, job.lease_token = "leased", uuid4()
        job.lease_until = now() + SCAN_LEASE
        job.attempt_count += 1
        job_id, lease = job.id, job.lease_token
        file_id, case_id = UUID(job.payload["file_id"]), UUID(job.payload["case_id"])
        file = db.get(StoredFile, file_id)
        key = (
            file.object_key
            if file and file.status == "quarantined" and link_expires_at(file) > now()
            else None
        )
    outcome = signature = None
    if key:
        try:
            outcome, signature = scan(scanner, storage.get(key))
        except OSError:
            outcome = "quarantined"  # storage unavailable: no verdict either
    infected_key = None
    with factory.begin() as db:
        job = db.scalar(select(OutboxJob).where(OutboxJob.id == job_id).with_for_update())
        if job.status != "leased" or job.lease_token != lease:
            return True  # another worker took over after our lease expired
        job.lease_token = job.lease_until = None
        if outcome == "quarantined":
            job.status = "pending"
            job.available_at = now() + timedelta(
                seconds=min(SCAN_RETRY_MAX_SECONDS, 2**job.attempt_count)
            )
            job.last_error = "scanner_unavailable"
            return True
        job.status, job.completed_at, job.last_error = "done", now(), None
        if outcome is None:
            return True
        file = db.scalar(select(StoredFile).where(StoredFile.id == file_id).with_for_update())
        if file.status != "quarantined":
            return True
        if outcome == "clean":
            file.status, file.scanned_at = "clean", now() if scanner.enabled else None
        else:
            file.status, file.scanned_at = "rejected", now()
            infected_key = file.object_key
        scan_audit(db, db.get(SupportCase, case_id), file, signature)
    if infected_key:
        try:
            storage.delete(infected_key)
        except OSError:
            logger.warning("Infected attachment object not deleted; it is never served")
    return True


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
