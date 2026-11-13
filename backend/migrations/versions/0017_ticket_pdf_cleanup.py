"""Durable ticket PDF write intents: index the pending/deleted cleanup schedule.

Ticket PDFs reuse the stored_file status and cleanup_after columns from 0009/0016 (a pending row
is the write intent recorded before the object is written). Only the partial index the worker's
reconcile pass needs is added: ticket PDFs are most stored_file rows, so the sweep must not scan
the clean ones.
"""

from alembic import op

revision = "0017_ticket_pdf_cleanup"
down_revision = "0016_image_cleanup"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ticket_pdf_cleanup
            ON biletflow.stored_file (cleanup_after,id)
            WHERE purpose='ticket_pdf' AND status IN ('pending','deleted')
                AND cleanup_after IS NOT NULL""")


def downgrade():
    # Rows and schedules stay; only the index goes. Pending/deleted ticket PDF rows written
    # meanwhile are still valid 0016 data (clean rows are untouched).
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS biletflow.ix_ticket_pdf_cleanup")
