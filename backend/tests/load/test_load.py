"""Opt-in wrapper around the load harness (#80); skipped unless RUN_LOAD_TESTS=1.

    RUN_LOAD_TESTS=1 TEST_DATABASE_URL=postgresql+psycopg://user@127.0.0.1:5432/x_test \\
        uv run pytest tests/load -s

LOAD_RUNS (default 1) sets runs per scenario. The harness starts its own API and worker
processes; see load_harness.py for the scenarios and the test-only rate-limit settings.
"""

import os

import pytest

from tests.load import load_harness

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LOAD_TESTS") != "1",
    reason="load harness is opt-in: set RUN_LOAD_TESTS=1",
)


def test_checkout_and_admission_under_concurrent_analytics(tmp_path):
    url = os.environ.get("LOAD_DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")
    args = load_harness.parse_args(
        [
            "--database-url",
            url,
            "--runs",
            os.environ.get("LOAD_RUNS", "1"),
            "--output-dir",
            str(tmp_path),
        ]
    )
    report = load_harness.run(args)

    failed = [
        f"{run['scenario']}{run['run']}: {check['name']} "
        f"(expected {check['expected']}, got {check['actual']})"
        for run in report["runs"]
        for check in run["invariants"]
        if not check["passed"]
    ]
    assert not failed, "\n".join(failed)
    target = report["admission_target"]
    assert target["met"], (
        f"admission p95 {target['worst_p95_ms']} ms is not under {target['target_ms']} ms"
    )
