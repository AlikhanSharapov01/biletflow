"""Checkout confirmation, orders and issued tickets (free-checkout scope)."""

from pathlib import Path

from alembic import op

revision = "0003_checkout"
down_revision = "0002_event_setup"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain order and ticket history; use a reviewed backup to roll back.")
