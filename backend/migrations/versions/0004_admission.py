"""Online admission: check-in records and their reversals."""

from pathlib import Path

from alembic import op

revision = "0004_admission"
down_revision = "0003_checkout"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain admission history; use a reviewed backup to roll back.")
