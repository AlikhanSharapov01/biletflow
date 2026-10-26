"""Support cases, messages and case history."""

from pathlib import Path

from alembic import op

revision = "0008_support"
down_revision = "0007_entry_offline"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain support history; use a reviewed backup to roll back.")
