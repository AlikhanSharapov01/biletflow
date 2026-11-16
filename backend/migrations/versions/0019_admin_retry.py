"""Bounded admin retries of exhausted outbox jobs and failed notification deliveries (#73).

Each row counts the audited admin retries it has had. The constant default fills existing rows
without a rewrite; the CHECK is added NOT VALID (short lock) and validated outside the
transaction, so writers are not blocked while existing rows are checked.
"""

from alembic import op

revision = "0019_admin_retry"
down_revision = "0017_ticket_pdf_cleanup"
branch_labels = None
depends_on = None

TABLES = (
    ("outbox_job", "outbox_admin_retries"),
    ("notification_delivery", "notification_delivery_ck5"),
)


def upgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    for table, check in TABLES:
        op.execute(
            f"ALTER TABLE biletflow.{table} ADD COLUMN admin_retry_count integer NOT NULL DEFAULT 0"
        )
        op.execute(
            f"ALTER TABLE biletflow.{table} ADD CONSTRAINT {check} "
            "CHECK (admin_retry_count BETWEEN 0 AND 3) NOT VALID"
        )
    with op.get_context().autocommit_block():
        for table, check in TABLES:
            op.execute(f"ALTER TABLE biletflow.{table} VALIDATE CONSTRAINT {check}")


def downgrade():
    # Only the counters go; retried rows keep their reset attempt counts and audit rows.
    op.execute("SET LOCAL lock_timeout = '5s'")
    for table, check in TABLES:
        op.execute(f"ALTER TABLE biletflow.{table} DROP CONSTRAINT {check}")
        op.execute(f"ALTER TABLE biletflow.{table} DROP COLUMN admin_retry_count")
