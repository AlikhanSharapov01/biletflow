"""In-app notifications and their per-channel delivery bookkeeping."""

from pathlib import Path

from alembic import op

revision = "0005_notifications_calendar"
down_revision = "0004_admission"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain notification history; use a reviewed backup to roll back.")
