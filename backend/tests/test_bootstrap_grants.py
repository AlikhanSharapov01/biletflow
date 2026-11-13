"""The runtime role's table privileges after bootstrap (the Compose `migrate` service).

Runs app.bootstrap.main against the disposable test database. It creates or updates the
cluster-wide role `biletflow_app` (as the Compose stack does) and leaves everything else to the
per-test truncation. Demo fixtures are not built here.
"""

import psycopg
import pytest

from app import bootstrap, seed


@pytest.fixture
def bootstrapped(app, settings, monkeypatch):
    monkeypatch.setenv("APP_DB_PASSWORD", "bootstrap-test-password")
    monkeypatch.setattr(seed, "seed_demo_fixtures", lambda factory, settings: "skipped")
    bootstrap.main()
    bootstrap.main()  # runs on every start: must be repeatable
    url = settings.database_url.get_secret_value().replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(url) as connection:
        yield lambda table, privilege: connection.execute(
            "SELECT has_table_privilege('biletflow_app', %s, %s)", (table, privilege)
        ).fetchone()[0]


def test_app_role_can_delete_only_the_rows_the_app_removes(bootstrapped):
    # DELETE /events/{id}/images/{image_id} removes the gallery row (#69 drill found a 503).
    assert bootstrapped("biletflow.event_media", "DELETE")
    assert bootstrapped("biletflow.campaign_ticket_type", "DELETE")
    assert not bootstrapped("biletflow.stored_file", "DELETE")
    assert not bootstrapped("biletflow.ticket", "DELETE")
    assert not bootstrapped("biletflow.audit_log", "DELETE")
    assert not bootstrapped("biletflow.audit_log", "UPDATE")
