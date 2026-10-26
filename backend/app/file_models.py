"""BF-16 protected file metadata and support attachments.

Mirrors migration 0009_files_admission. Bytes live behind app/storage.py; these rows only hold
the private object key, validated type, size and digest.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Row


def restrict(columns, target, name):
    return ForeignKeyConstraint(
        columns, target, name=name, ondelete="RESTRICT", onupdate="RESTRICT"
    )


class StoredFile(Row, Base):
    __tablename__ = "stored_file"
    __table_args__ = (
        UniqueConstraint("object_key", name="stored_file_uq1"),
        CheckConstraint(
            "purpose IN ('event_image','ticket_pdf','support_attachment','offline_package')",
            name="stored_file_ck1",
        ),
        CheckConstraint(
            "status IN ('pending','quarantined','clean','rejected','deleted')",
            name="stored_file_ck2",
        ),
        CheckConstraint("size_bytes >= 0", name="stored_file_ck3"),
        restrict(["uploaded_by_user_id"], ["biletflow.app_user.id"], "fk_stored_file_uploader"),
        Index("ix_stored_file_uploader", "uploaded_by_user_id", "created_at"),
    )
    uploaded_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID)
    object_key: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(Text)
    original_filename: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SupportAttachment(Row, Base):
    __tablename__ = "support_attachment"
    __table_args__ = (
        UniqueConstraint("file_id", name="support_attachment_uq1"),
        CheckConstraint("length(btrim(original_filename)) > 0", name="support_attachment_ck1"),
        restrict(["case_id"], ["biletflow.support_case.id"], "fk_support_attachment_case"),
        restrict(
            ["message_id", "case_id"],
            ["biletflow.support_message.id", "biletflow.support_message.case_id"],
            "fk_support_attachment_message",
        ),
        restrict(["file_id"], ["biletflow.stored_file.id"], "fk_support_attachment_file"),
        Index("ix_support_attachment_message", "message_id", "created_at"),
    )
    case_id: Mapped[UUID] = mapped_column(PGUUID)
    message_id: Mapped[UUID] = mapped_column(PGUUID)
    file_id: Mapped[UUID] = mapped_column(PGUUID)
    original_filename: Mapped[str] = mapped_column(Text)
