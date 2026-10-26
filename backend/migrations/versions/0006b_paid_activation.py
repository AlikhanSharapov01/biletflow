"""Paid-sales activation and the simulated payment boundary."""

from pathlib import Path

from alembic import op

revision = "0006b_paid_activation"
down_revision = "0005b_commerce"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain payment history; use a reviewed backup to roll back.")
