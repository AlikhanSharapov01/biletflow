"""Commerce reliability: request idempotency records."""

from pathlib import Path

from alembic import op

revision = "0010_commerce"
down_revision = "0004_admission"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain request history; use a reviewed backup to roll back.")
