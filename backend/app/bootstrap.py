"""Run migrations as owner, then provision a narrowly privileged application role."""

import os

import psycopg
from alembic import command
from alembic.config import Config
from psycopg import sql

from .config import Settings


def main():
    settings = Settings()
    password = os.environ["APP_DB_PASSWORD"]
    command.upgrade(Config("alembic.ini"), "head")
    url = settings.database_url.get_secret_value().replace(
        "postgresql+psycopg://", "postgresql://", 1
    )
    with psycopg.connect(url) as connection:
        if not connection.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = 'biletflow_app'"
        ).fetchone():
            connection.execute(
                "CREATE ROLE biletflow_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE"
            )
        connection.execute(
            sql.SQL("ALTER ROLE biletflow_app PASSWORD {}").format(sql.Literal(password))
        )
        connection.execute("REVOKE ALL ON SCHEMA biletflow FROM PUBLIC")
        connection.execute("GRANT USAGE ON SCHEMA biletflow TO biletflow_app")
        connection.execute(
            "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA biletflow TO biletflow_app"
        )
        connection.execute("REVOKE UPDATE ON biletflow.audit_log FROM biletflow_app")
    from .db import database
    from .seed import seed_catalog

    engine, factory = database(settings.database_url.get_secret_value())
    try:
        seed_catalog(factory)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
