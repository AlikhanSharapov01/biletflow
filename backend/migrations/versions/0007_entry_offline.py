"""Entry confirmations, scanner devices and offline synchronization."""

from pathlib import Path

from alembic import op

revision = "0007_entry_offline"
down_revision = "0006_admin_moderation"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain admission history; use a reviewed backup to roll back.")
