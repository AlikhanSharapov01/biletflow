"""BF-12: scanner devices, offline verification packages and idempotent batch sync."""

import hashlib
from datetime import timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from .admission_models import CheckIn
from .admission_service import admit, apply_reversal, counts, payload_ticket
from .catalog_models import Event, Organization
from .catalog_service import catalog_audit, event_guard
from .checkout_models import OrderItem, Ticket
from .checkout_schemas import QR_PREFIX
from .models import AuthSession
from .offline_models import OfflineOperation, OfflinePackage, ScannerDevice, SyncConflict
from .security import fail, now
from .signing import (
    ENTRY_PURPOSE,
    PACKAGE_PURPOSE,
    canonical,
    key_id,
    public_key_b64,
    sign,
    unverified_claims,
)

REVOKED_STATUSES = ("refund_pending", "refunded", "cancelled")
# Admission failures that mean "the central state disagrees with the device": organizer review.
CONFLICT_CODES = {"already_checked_in", "ticket_not_valid"}


def device_view(device):
    return {
        "id": device.id,
        "device_key": device.device_key,
        "label": device.label,
        "created_at": device.created_at,
        "revoked_at": device.revoked_at,
    }


def register_device(db, user, data):
    label = data.label.strip()
    device = db.scalar(select(ScannerDevice).where(ScannerDevice.device_key == data.device_key))
    if device is None:
        statement = (
            insert(ScannerDevice)
            .values(owner_user_id=user.id, device_key=data.device_key, label=label)
            .on_conflict_do_nothing(index_elements=[ScannerDevice.device_key])
            .returning(ScannerDevice.id)
        )
        created = db.scalar(statement)
        device = db.scalar(select(ScannerDevice).where(ScannerDevice.device_key == data.device_key))
        if created:
            return device, True
    # The key is an installation identifier, not a credential: it never grants another
    # account the device, and a revoked device cannot be revived by registering again.
    if device.owner_user_id != user.id:
        fail("device_key_taken", 409)
    if device.revoked_at is not None:
        fail("device_revoked", 403)
    if device.label != label:
        device.label = label
    return device, False


def revoke_device(db, user, device_id):
    device = db.scalar(
        select(ScannerDevice)
        .where(ScannerDevice.id == device_id, ScannerDevice.owner_user_id == user.id)
        .with_for_update()
    )
    if not device:
        fail("device_not_found", 404)
    if device.revoked_at is None:
        device.revoked_at = now()
        db.execute(
            update(OfflinePackage)
            .where(OfflinePackage.device_id == device.id, OfflinePackage.revoked_at.is_(None))
            .values(revoked_at=device.revoked_at)
            .execution_options(synchronize_session=False)
        )
    return device


def signing_keys(settings):
    return {
        "algorithm": "Ed25519",
        "entry_confirmation": {
            "purpose": ENTRY_PURPOSE,
            "key_id": key_id(settings, ENTRY_PURPOSE),
            "public_key": public_key_b64(settings, ENTRY_PURPOSE),
        },
        "offline_package": {
            "purpose": PACKAGE_PURPOSE,
            "key_id": key_id(settings, PACKAGE_PURPOSE),
            "public_key": public_key_b64(settings, PACKAGE_PURPOSE),
        },
    }


def holder_label(name):
    # Package data is limited: first name and last initial only.
    parts = name.split()
    return parts[0] if len(parts) < 2 else f"{parts[0]} {parts[-1][0]}."


def event_state(db, event):
    revocations = [
        {"ticket_id": str(ticket_id), "status": status}
        for ticket_id, status in db.execute(
            select(Ticket.id, Ticket.status)
            .where(Ticket.event_id == event.id, Ticket.status.in_(REVOKED_STATUSES))
            .order_by(Ticket.id)
        )
    ]
    admitted = [
        str(ticket_id)
        for ticket_id in db.scalars(
            select(CheckIn.ticket_id)
            .where(CheckIn.event_id == event.id, CheckIn.reversed_at.is_(None))
            .order_by(CheckIn.ticket_id)
        )
    ]
    return revocations, admitted


def build_package(db, settings, user, session_id, event_id, device_id):
    event = event_guard(db, user, event_id, "scan")
    if event.publication_state != "published" or event.moderation_state != "normal":
        fail("admission_closed", 409)
    current = now()
    if current >= event.admission_closes_at:
        fail("admission_closed", 409)
    device = db.scalar(
        select(ScannerDevice).where(
            ScannerDevice.id == device_id, ScannerDevice.owner_user_id == user.id
        )
    )
    if not device:
        fail("device_not_found", 404)
    if device.revoked_at is not None:
        fail("device_revoked", 403)
    session = db.get(AuthSession, session_id)
    expires = min(
        current + timedelta(minutes=settings.offline_package_minutes),
        event.admission_closes_at + timedelta(hours=1),
        session.expires_at,
    )
    event = db.scalar(
        select(Event).where(Event.id == event.id).execution_options(populate_existing=True)
    )
    tickets = [
        {
            "ticket_id": str(ticket.id),
            "qr_hash": ticket.qr_token_hash,
            "ticket_type_name": item.ticket_type_name,
            "holder": holder_label(item.recipient_name),
            "seat": item.seat_snapshot,
            "status": ticket.status,
        }
        for ticket, item in db.execute(
            select(Ticket, OrderItem)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(
                Ticket.event_id == event.id,
                Ticket.recipient_user_id.is_not(None),
                Ticket.status.in_(("valid", "checked_in")),
            )
            .order_by(Ticket.id)
        )
    ]
    revocations, admitted = event_state(db, event)
    package = OfflinePackage(
        event_id=event.id,
        scanner_user_id=user.id,
        session_id=session_id,
        device_id=device.id,
        snapshot_version=event.availability_version,
        expires_at=expires,
        content_hash="pending",
        signing_key_id=key_id(settings, PACKAGE_PURPOSE),
        created_at=current,
    )
    db.add(package)
    db.flush()
    manifest = {
        "format": "biletflow.offline-package.v1",
        "package_id": str(package.id),
        "event": {
            "id": str(event.id),
            "title": event.title,
            "time_zone": event.time_zone,
            "starts_at": event.starts_at.isoformat(),
            "ends_at": event.ends_at.isoformat(),
            "admission_opens_at": event.admission_opens_at.isoformat(),
            "admission_closes_at": event.admission_closes_at.isoformat(),
        },
        "device_id": str(device.id),
        "snapshot_version": event.availability_version,
        "generated_at": current.isoformat(),
        "expires_at": expires.isoformat(),
        "ticket_qr": {
            "prefix": QR_PREFIX,
            "hash": "sha256 hex of the payload after the prefix",
        },
        "entry_confirmation": {
            "algorithm": "Ed25519",
            "prefix": "biletflow:entry:",
            "signed_bytes": "purpose + NUL + base64url-decoded claims",
            "purpose": ENTRY_PURPOSE,
            "key_id": key_id(settings, ENTRY_PURPOSE),
            "public_key": public_key_b64(settings, ENTRY_PURPOSE),
        },
        "tickets": tickets,
        "revocations": revocations,
        "admitted_ticket_ids": admitted,
    }
    body = canonical(manifest)
    package.content_hash = hashlib.sha256(body).hexdigest()
    db.flush()
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "admission.offline_package_issued", org, event, package)
    return {
        "package_id": package.id,
        "snapshot_version": package.snapshot_version,
        "expires_at": expires,
        "server_time": current,
        "content_hash": package.content_hash,
        "signing_key_id": package.signing_key_id,
        "signature": sign(settings, PACKAGE_PURPOSE, body),
        "manifest": manifest,
    }


# ---------------------------------------------------------------- batch sync


def payload_hash(package_id, op):
    return hashlib.sha256(
        canonical(
            {
                "package_id": str(package_id),
                "sequence_number": op.sequence_number,
                "kind": op.kind,
                "captured_at": op.captured_at.isoformat(),
                "qr_payload": op.qr_payload,
                "entry_confirmation": op.entry_confirmation,
                "entry_code": op.entry_code,
                "parent_operation_id": str(op.parent_operation_id)
                if op.parent_operation_id
                else None,
                "reason": op.reason,
            }
        )
    ).hexdigest()


def claimed_ids(op):
    ticket_id = confirmation_id = None
    if op.qr_payload and op.qr_payload.startswith(QR_PREFIX):
        try:
            ticket_id = UUID(op.qr_payload.removeprefix(QR_PREFIX).split(".", 1)[0])
        except ValueError:
            pass
    if op.entry_confirmation:
        try:
            claims = unverified_claims(op.entry_confirmation)
            confirmation_id = UUID(claims["cid"])
        except (KeyError, ValueError, TypeError):
            pass
    return ticket_id, confirmation_id


def outcome(op, status, code=None, **extra):
    return {
        "operation_id": op.operation_id,
        "sequence_number": op.sequence_number,
        "status": status,
        "code": code,
        **extra,
    }


def settle(row, status, code=None, *, ticket_id=None, check_in_id=None):
    row.status, row.rejection_code, row.processed_at = status, code, now()
    row.resolved_ticket_id, row.accepted_check_in_id = ticket_id, check_in_id


def error_code(error):
    detail = error.detail
    return detail.get("code", "rejected") if isinstance(detail, dict) else "rejected"


def process_check_in(db, settings, user, session_id, event, package, device, op):
    """Decide one offline check-in. Returns (status, code, ticket, check_in, existing)."""
    if op.captured_at > package.expires_at:
        return "rejected", "package_expired", None, None, None
    if not op.qr_payload:
        return "rejected", "not_a_ticket_qr", None, None, None
    # The window is judged at the device capture time: sync happens after the gate closes.
    if not (event.admission_opens_at <= op.captured_at < event.admission_closes_at):
        return "rejected", "outside_admission_window", None, None, None
    if event.publication_state != "published" or event.moderation_state != "normal":
        return "rejected", "admission_closed", None, None, None
    try:
        ticket = payload_ticket(db, op.qr_payload)
    except HTTPException as error:
        return "rejected", error_code(error), None, None, None
    if ticket.event_id != event.id:
        return "rejected", "wrong_event", None, None, None
    try:
        with db.begin_nested():
            check_in = admit(
                db,
                settings,
                user,
                session_id,
                event,
                ticket,
                operation_id=op.operation_id,
                captured_at=op.captured_at,
                source="offline_sync",
                device_id=device.id,
                token=op.entry_confirmation,
                code=op.entry_code,
                offline_capture=op.captured_at,
            )
        return "accepted", None, ticket, check_in, None
    except HTTPException as error:
        code = error_code(error)
        if code in CONFLICT_CODES:
            existing = db.scalar(
                select(CheckIn).where(CheckIn.ticket_id == ticket.id, CheckIn.reversed_at.is_(None))
            )
            return "conflict", code, ticket, None, existing
        return "rejected", code, ticket, None, None
    except IntegrityError:
        return "rejected", "operation_conflict", ticket, None, None


def process_reverse(db, user, event, package, device, op):
    if op.captured_at > package.expires_at:
        return "rejected", "package_expired", None, None
    parent = db.scalar(
        select(OfflineOperation).where(
            OfflineOperation.device_id == device.id,
            OfflineOperation.operation_id == op.parent_operation_id,
            OfflineOperation.sequence_number < op.sequence_number,
        )
    )
    if not parent:
        return "rejected", "parent_not_found", None, None
    if parent.status != "accepted" or parent.accepted_check_in_id is None:
        return "rejected", "parent_not_accepted", None, None
    try:
        event_guard(db, user, event.id, "reverse_checkin")
        with db.begin_nested():
            result = apply_reversal(
                db, user, event, parent.accepted_check_in_id, (op.reason or "").strip()
            )
        return "accepted", None, result["ticket_id"], parent.accepted_check_in_id
    except HTTPException as error:
        code = error_code(error)
        if code in ("event_not_found", "permission_denied"):
            code = "permission_denied"
        return "rejected", code, parent.resolved_ticket_id, None


def refreshed_state(db, event):
    revocations, admitted = event_state(db, event)
    return {
        "snapshot_version": db.scalar(
            select(Event.availability_version)
            .where(Event.id == event.id)
            .execution_options(populate_existing=True)
        ),
        "revocations": revocations,
        "admitted_ticket_ids": admitted,
        "counts": counts(db, event),
        "package_hint": "Download a new package to refresh tickets; this carries revocations only.",
    }


def sync(db, settings, user, session_id, data):
    package = db.scalar(
        select(OfflinePackage).where(
            OfflinePackage.id == data.package_id,
            OfflinePackage.scanner_user_id == user.id,
            OfflinePackage.device_id == data.device_id,
        )
    )
    if not package:
        fail("package_not_found", 404)
    event = db.get(Event, package.event_id)
    device = db.get(ScannerDevice, package.device_id)
    received = now()
    # Whole-batch authorization: a revoked device or staff member can still upload, but
    # nothing is accepted; the operations are kept as rejected for organizer review.
    blocked = None
    if device.revoked_at is not None:
        blocked = "device_revoked"
    elif package.revoked_at is not None:
        blocked = "package_revoked"
    else:
        try:
            event_guard(db, user, event.id, "scan")
        except HTTPException:
            blocked = "scanner_not_authorized"
    results = []
    for op in sorted(data.operations, key=lambda item: item.sequence_number):
        results.append(
            sync_one(db, settings, user, session_id, event, package, device, op, data, blocked)
        )
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "admission.offline_synced", org, event, package)
    return {
        "package_id": package.id,
        "event_id": event.id,
        "server_time": received,
        "device_time": data.device_time,
        "clock_skew_seconds": (data.device_time - received).total_seconds(),
        "results": results,
        "refreshed": refreshed_state(db, event),
    }


def stored_outcome(db, op, row):
    conflict_id = db.scalar(
        select(SyncConflict.id).where(SyncConflict.offline_operation_id == row.id)
    )
    return outcome(
        op,
        "duplicate",
        row.rejection_code,
        original_status=row.status,
        check_in_id=row.accepted_check_in_id,
        ticket_id=row.resolved_ticket_id,
        conflict_id=conflict_id,
    )


def sync_one(db, settings, user, session_id, event, package, device, op, data, blocked):
    digest_value = payload_hash(package.id, op)
    claimed_ticket, claimed_confirmation = claimed_ids(op)
    values = dict(
        package_id=package.id,
        event_id=event.id,
        device_id=device.id,
        operation_id=op.operation_id,
        sequence_number=op.sequence_number,
        kind=op.kind,
        claimed_ticket_id=claimed_ticket,
        claimed_confirmation_id=claimed_confirmation,
        parent_operation_id=op.parent_operation_id,
        reason=op.reason,
        captured_at=op.captured_at,
        device_reported_at=data.device_time,
        payload_hash=digest_value,
    )
    try:
        with db.begin_nested():
            # Waits for a concurrent upload of the same operation, then reports a duplicate.
            inserted = db.scalar(
                insert(OfflineOperation)
                .values(**values)
                .on_conflict_do_nothing(
                    index_elements=[OfflineOperation.device_id, OfflineOperation.operation_id]
                )
                .returning(OfflineOperation.id)
            )
    except IntegrityError:
        return outcome(op, "rejected", "sequence_conflict")
    if not inserted:
        row = db.scalar(
            select(OfflineOperation)
            .where(
                OfflineOperation.device_id == device.id,
                OfflineOperation.operation_id == op.operation_id,
            )
            .execution_options(populate_existing=True)
        )
        if row.payload_hash != digest_value:
            return outcome(op, "rejected", "operation_payload_mismatch")
        return stored_outcome(db, op, row)
    row = db.get(OfflineOperation, inserted)
    if blocked:
        settle(row, "rejected", blocked)
        db.flush()
        return outcome(op, "rejected", blocked)
    if op.kind == "check_in":
        if op.parent_operation_id or op.reason:
            status, code, ticket, check_in, existing = (
                "rejected",
                "invalid_operation",
                None,
                None,
                None,
            )
        else:
            status, code, ticket, check_in, existing = process_check_in(
                db, settings, user, session_id, event, package, device, op
            )
        ticket_id = ticket.id if ticket else None
        check_in_id = check_in.id if check_in else None
    else:
        if not op.reason or op.qr_payload or op.entry_confirmation or op.entry_code:
            status, code, ticket_id, check_in_id = "rejected", "invalid_operation", None, None
        else:
            status, code, ticket_id, check_in_id = process_reverse(
                db, user, event, package, device, op
            )
        existing = None
    settle(row, status, code, ticket_id=ticket_id, check_in_id=check_in_id)
    conflict_id = None
    if status == "conflict":
        conflict = SyncConflict(
            offline_operation_id=row.id,
            existing_check_in_id=existing.id if existing else None,
            reason=code,
        )
        db.add(conflict)
    db.flush()
    if status == "conflict":
        conflict_id = conflict.id
    return outcome(
        op, status, code, check_in_id=check_in_id, ticket_id=ticket_id, conflict_id=conflict_id
    )


# ---------------------------------------------------------- organizer review


def operation_view(db, row, conflict=None):
    device = db.get(ScannerDevice, row.device_id)
    package = db.get(OfflinePackage, row.package_id)
    ticket_id = row.resolved_ticket_id or row.claimed_ticket_id
    holder = None
    if row.resolved_ticket_id:
        item = db.scalar(
            select(OrderItem)
            .join(Ticket, Ticket.order_item_id == OrderItem.id)
            .where(Ticket.id == row.resolved_ticket_id)
        )
        holder = {"attendee_name": item.recipient_name, "ticket_type_name": item.ticket_type_name}
    return {
        "operation_id": row.operation_id,
        "sequence_number": row.sequence_number,
        "kind": row.kind,
        "status": row.status,
        "rejection_code": row.rejection_code,
        "ticket_id": ticket_id,
        "ticket": holder,
        "device": {"id": device.id, "label": device.label},
        "scanner_user_id": package.scanner_user_id,
        # Device clock and server clock are separate facts; neither is rewritten.
        "captured_at_device": row.captured_at,
        "device_reported_at": row.device_reported_at,
        "received_at_server": row.created_at,
        "processed_at_server": row.processed_at,
    }


def conflict_view(db, conflict):
    row = db.get(OfflineOperation, conflict.offline_operation_id)
    existing = (
        db.get(CheckIn, conflict.existing_check_in_id) if conflict.existing_check_in_id else None
    )
    return {
        "id": conflict.id,
        "event_id": row.event_id,
        "status": conflict.status,
        "reason": conflict.reason,
        "created_at": conflict.created_at,
        "resolved_at": conflict.resolved_at,
        "resolved_by_user_id": conflict.resolved_by_user_id,
        "resolution_note": conflict.resolution_note,
        "operation": operation_view(db, row),
        "existing_check_in": {
            "id": existing.id,
            "accepted_at": existing.accepted_at,
            "source": existing.source,
            "scanner_user_id": existing.scanner_user_id,
            "reversed_at": existing.reversed_at,
        }
        if existing
        else None,
    }


def list_conflicts(db, event, status, limit, offset):
    query = (
        select(SyncConflict)
        .join(OfflineOperation, OfflineOperation.id == SyncConflict.offline_operation_id)
        .where(OfflineOperation.event_id == event.id)
        .order_by(SyncConflict.created_at, SyncConflict.id)
        .limit(limit)
        .offset(offset)
    )
    if status:
        query = query.where(SyncConflict.status == status)
    return [conflict_view(db, row) for row in db.scalars(query)]


def list_operations(db, event, status, limit, offset):
    query = (
        select(OfflineOperation)
        .where(OfflineOperation.event_id == event.id)
        .order_by(OfflineOperation.created_at, OfflineOperation.id)
        .limit(limit)
        .offset(offset)
    )
    if status:
        query = query.where(OfflineOperation.status == status)
    return [operation_view(db, row) for row in db.scalars(query)]


def resolve_conflict(db, user, conflict_id, note):
    conflict = db.get(SyncConflict, conflict_id)
    if not conflict:
        fail("sync_conflict_not_found", 404)
    operation = db.get(OfflineOperation, conflict.offline_operation_id)
    try:
        event = event_guard(db, user, operation.event_id, "attendees")
    except HTTPException as error:
        if error.status_code == 404:
            fail("sync_conflict_not_found", 404)
        raise
    conflict = db.scalar(
        select(SyncConflict)
        .where(SyncConflict.id == conflict_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if conflict.status == "resolved":
        fail("already_resolved", 409)
    conflict.status, conflict.resolved_by_user_id = "resolved", user.id
    conflict.resolution_note, conflict.resolved_at = note.strip(), now()
    db.flush()
    org = db.get(Organization, event.organization_id)
    catalog_audit(db, user, "admission.sync_conflict_resolved", org, event, conflict)
    return conflict_view(db, conflict)
