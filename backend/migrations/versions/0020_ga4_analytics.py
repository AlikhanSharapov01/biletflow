"""Optional GA4 integration: organization connections, deduplicated exports, aggregate cache.

New, empty tables only; no existing table is altered, so orders and attribution are untouched.
"""

from pathlib import Path

from alembic import op

revision = "0020_ga4_analytics"
down_revision = "0019_admin_retry"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    # Export history and cached aggregates are dropped with the tables; neither is financial truth.
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute(
        "DROP TABLE biletflow.ga4_cache; DROP TABLE biletflow.analytics_export; "
        "DROP TABLE biletflow.ga4_connection;"
    )
