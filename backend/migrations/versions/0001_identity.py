"""Identity, Google login, revocable sessions, auth audit and email outbox.

Frozen SQL is independent of future ORM changes. Apply only to a fresh database;
the full 66-table reference atlas is not a previously deployed migration.
"""

from pathlib import Path

from alembic import op

revision = "0001_identity"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    sql = Path(__file__).with_suffix(".sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade():
    raise RuntimeError(
        "Identity history is retained. Restore a reviewed backup instead of dropping accounts."
    )
