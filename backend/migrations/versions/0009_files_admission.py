"""Protected file storage, support attachments and admission history."""

from pathlib import Path

from alembic import op

revision = "0009_files_admission"
down_revision = "0008_support"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError("Retain stored files and history; use a reviewed backup to roll back.")
