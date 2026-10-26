"""Simulated paid orders and compensation refunds."""

from pathlib import Path

from alembic import op

revision = "0007b_paid_orders"
down_revision = "0006b_paid_activation"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain payment and refund history; use a reviewed backup to roll back.")
