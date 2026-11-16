"""Outbox jobs carry the correlation ID of the request or job that queued them (#78).

Nullable without a backfill: jobs queued before this revision run under a fresh worker ID.
"""

from alembic import op

revision = "0021_job_correlation"
down_revision = "0017_ticket_pdf_cleanup"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("ALTER TABLE biletflow.outbox_job ADD COLUMN correlation_id uuid")


def downgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("ALTER TABLE biletflow.outbox_job DROP COLUMN correlation_id")
