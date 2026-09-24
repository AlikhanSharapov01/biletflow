"""Organizer permissions, invitations, venues, event lifecycle and inventory setup."""

from pathlib import Path

from alembic import op

revision = "0002_event_setup"
down_revision = "0001_identity"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain event and staff history; use a reviewed backup to roll back.")
