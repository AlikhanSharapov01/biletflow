"""Durable event image cleanup scheduling and late-writer tombstones."""

from alembic import op

revision = "0016_image_cleanup"
down_revision = "0015_event_images"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("ALTER TABLE biletflow.stored_file ADD COLUMN cleanup_after timestamptz")
    # NULL legacy schedules are claimed lazily by the bounded worker, without a bulk backfill.
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY ix_event_image_cleanup
            ON biletflow.stored_file (cleanup_after,id)
            WHERE purpose='event_image' AND status IN ('pending','deleted')""")


def downgrade():
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY biletflow.ix_event_image_cleanup")
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("ALTER TABLE biletflow.stored_file DROP COLUMN cleanup_after")
