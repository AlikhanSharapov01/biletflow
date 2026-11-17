"""Durable support upload intents: index the attachment cleanup schedule (#76).

Support uploads reuse the stored_file status and cleanup_after columns from 0009/0016: a pending
row is the write intent recorded before the object is written, and an unlinked clean or
quarantined upload is due for retirement when its one-hour link window ends. This adds the
partial index the worker's reconcile pass needs and schedules the unlinked uploads written before
it (they had no schedule). That backfill only touches support files no message links, which exist
for about an hour after an upload, so it is one small statement.
"""

from alembic import op

revision = "0018_attachment_cleanup"
down_revision = "0017_ticket_pdf_cleanup"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("""UPDATE biletflow.stored_file AS f
        SET cleanup_after = f.created_at + interval '1 hour'
        WHERE f.purpose = 'support_attachment'
            AND f.status IN ('pending','quarantined','clean')
            AND f.cleanup_after IS NULL
            AND NOT EXISTS (SELECT 1 FROM biletflow.support_attachment a WHERE a.file_id = f.id)""")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_support_attachment_cleanup
            ON biletflow.stored_file (cleanup_after,id)
            WHERE purpose='support_attachment' AND cleanup_after IS NOT NULL""")


def downgrade():
    # Rows and schedules stay; only the index goes. 0017 code ignores support cleanup_after.
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS biletflow.ix_support_attachment_cleanup")
