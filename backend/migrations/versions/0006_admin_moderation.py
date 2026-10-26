"""Platform administration: admin grants, event reports, moderation evidence, settings."""

from pathlib import Path

from alembic import op

revision = "0006_admin_moderation"
down_revision = "0005_notifications_calendar"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError(
        "Retain moderation and settings history; use a reviewed backup to roll back."
    )
