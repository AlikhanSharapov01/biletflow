"""Persist simulation payout reservations and immutable adjustment history."""

from pathlib import Path

from alembic import op

revision = "0014_finance"
down_revision = "0013_campaigns"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    op.execute(
        "DROP TABLE biletflow.finance_entry; DROP TABLE biletflow.demo_payout; DROP FUNCTION biletflow.protect_sent_payout();"
    )
