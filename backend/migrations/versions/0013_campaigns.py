"""Promo campaigns, codes, reservations and redemptions."""

from pathlib import Path

from alembic import op

revision = "0013_campaigns"
down_revision = "0012_paid_orders"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain campaign attribution; use a reviewed backup to roll back.")
