"""Log redaction, request metrics and correlation scoping (no database needed)."""

import io
import json
import logging
import sys
from uuid import UUID, uuid4

import pytest

from app.observability import (
    JsonFormatter,
    RequestMetrics,
    RequestObservability,
    bind_correlation,
    configure_logging,
    correlated_job,
    correlation_id,
    current_correlation,
    redact,
    worker_task,
)

PASSWORD = "correct horse battery staple"
EMAIL = "alice.private@example.com"
JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVlLWhlcmU"
CHALLENGE = f"{uuid4()}.{'b' * 43}"
QR = f"biletflow:ticket:{uuid4()}.{'q' * 43}"
ENTRY = "biletflow:entry:eyJ0aWNrZXRfaWQiOiIxIn0.ZW50cnlzaWduYXR1cmU"
SIGNED_URL = (
    "https://storage.example/bucket/ticket.pdf?X-Amz-Signature=deadbeefsig&X-Amz-Credential=AKIAKEY"
)
RESET_LINK = f"http://localhost:5173/reset-password#token={CHALLENGE}"
SECRETS = [
    PASSWORD,
    EMAIL,
    JWT,
    CHALLENGE,
    QR.removeprefix("biletflow:ticket:"),
    ENTRY.removeprefix("biletflow:entry:"),
    "deadbeefsig",
    "AKIAKEY",
    "refresh-cookie-value",
]


def render(message, *args, exc_info=None, **extra):
    record = logging.LogRecord("app.test", logging.WARNING, __file__, 1, message, args, exc_info)
    for key, value in extra.items():
        setattr(record, key, value)
    return JsonFormatter().format(record)


def assert_clean(text):
    for secret in SECRETS:
        assert secret not in text, secret


def test_formatter_redacts_secrets_in_message_and_fields():
    output = render(
        "login failed for %s with password=%s; header Authorization: Bearer %s; link %s",
        EMAIL,
        PASSWORD,
        JWT,
        RESET_LINK,
        headers={
            "Authorization": f"Bearer {JWT}",
            "Cookie": "biletflow_refresh=refresh-cookie-value",
        },
        body={"email": EMAIL, "password": PASSWORD, "display_name": "Alice"},
        scanned=[QR, ENTRY, CHALLENGE],
        download=SIGNED_URL,
        route="/api/v1/auth/login",
        status=401,
    )
    assert_clean(output)
    entry = json.loads(output)
    assert entry["level"] == "warning" and entry["logger"] == "app.test"
    assert entry["route"] == "/api/v1/auth/login" and entry["status"] == 401
    assert entry["body"]["display_name"] == "Alice"
    assert entry["headers"]["Authorization"] == "[redacted]"
    assert entry["body"]["password"] == "[redacted]" and entry["body"]["email"] == "[redacted]"
    # Origin and path survive so the log stays useful; query and fragment do not.
    assert entry["download"].startswith("https://storage.example/bucket/ticket.pdf")
    assert "http://localhost:5173/reset-password" in entry["event"]
    assert entry["scanned"][0].startswith("biletflow:ticket:")


def test_formatter_keeps_only_exception_type():
    try:
        raise OSError(f"smtp rejected {EMAIL} token={CHALLENGE}")
    except OSError:
        output = render("job.failed", exc_info=sys.exc_info())
    assert_clean(output)
    entry = json.loads(output)
    assert entry["error_type"] == "OSError"
    assert "Traceback" not in output and "smtp rejected" not in output


def test_redact_handles_nested_structures_and_plain_values():
    identifier = uuid4()
    value = redact(
        {
            "outer": [{"refresh_token": "x", "note": f"mail {EMAIL}"}, (1, None, True)],
            "id": identifier,
            "raw": b"bytes",
        }
    )
    assert value["outer"][0]["refresh_token"] == "[redacted]"
    assert EMAIL not in value["outer"][0]["note"]
    assert value["outer"][1] == [1, None, True]
    assert value["id"] == identifier and value["raw"] == "[bytes]"


def test_request_metrics_counts_errors_latency_and_bounds_labels():
    metrics = RequestMetrics()
    metrics.observe("GET", "/api/v1/events", 200, 0.004)
    metrics.observe("GET", "/api/v1/events", 503, 0.2)
    metrics.observe("POST", "unmatched", 404, 0.03)
    metrics.observe("BREW", "unmatched", 405, 20.0)
    snapshot = metrics.snapshot()
    assert snapshot["requests"] == 4
    assert snapshot["client_errors"] == 2 and snapshot["server_errors"] == 1
    assert snapshot["error_rate"] == 0.25
    routes = {(r["method"], r["route"]): r for r in snapshot["routes"]}
    assert set(routes) == {("GET", "/api/v1/events"), ("POST", "unmatched"), ("OTHER", "unmatched")}
    events = routes[("GET", "/api/v1/events")]
    assert events["requests"] == 2 and events["server_errors"] == 1 and events["error_rate"] == 0.5
    assert events["max_ms"] == pytest.approx(200.0) and events["mean_ms"] == pytest.approx(102.0)
    buckets = snapshot["latency_ms"]
    # Cumulative buckets: 4 ms is under 5 ms; 20 s only lands in the open-ended bucket.
    assert buckets[0] == {"le": 5.0, "count": 1}
    assert buckets[-1] == {"le": None, "count": 4} and buckets[-2]["count"] == 3


def run_asgi(app, path="/api/v1/thing"):
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "GET", "path": path, "headers": []}
    # Driven by hand in the caller's context (no task copy), so a missing reset would show.
    coroutine = app(scope, receive, send)
    with pytest.raises(StopIteration):
        coroutine.send(None)
    return scope, sent


def test_middleware_sets_correlation_header_and_logs_route_template(caplog):
    caplog.set_level(logging.INFO, logger="app")
    seen = {}

    class Route:
        path = "/api/v1/campaign-links/{token}"

    async def endpoint(scope, receive, send):
        scope["route"] = Route()
        seen["correlation"] = current_correlation()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    metrics = RequestMetrics()
    _, sent = run_asgi(RequestObservability(endpoint, metrics), "/api/v1/campaign-links/s3cr3t")
    header = dict(sent[0]["headers"])[b"x-request-id"].decode()
    assert UUID(header) == seen["correlation"]
    assert current_correlation() is None
    [record] = [r for r in caplog.records if r.getMessage() == "http.request"]
    entry = json.loads(JsonFormatter().format(record))
    assert entry["correlation_id"] == header and entry["status"] == 200
    assert entry["route"] == "/api/v1/campaign-links/{token}" and "s3cr3t" not in str(entry)
    assert metrics.snapshot()["routes"][0]["route"] == "/api/v1/campaign-links/{token}"


def test_middleware_answers_unhandled_error_itself_without_its_text(caplog):
    caplog.set_level(logging.INFO, logger="app")

    async def boom(scope, receive, send):
        raise RuntimeError(f"failed for {EMAIL}")

    metrics = RequestMetrics()
    # Not re-raised: the server's own traceback logging never sees the exception.
    _, sent = run_asgi(RequestObservability(boom, metrics), "/no/such/path")
    start, body = sent
    assert start["status"] == 500
    headers = dict(start["headers"])
    assert UUID(headers[b"x-request-id"].decode()) and headers[b"cache-control"] == b"no-store"
    assert json.loads(body["body"]) == {"detail": {"code": "internal_error"}}
    assert current_correlation() is None
    snapshot = metrics.snapshot()
    assert snapshot["server_errors"] == 1 and snapshot["routes"][0]["route"] == "unmatched"
    [record] = [r for r in caplog.records if r.getMessage() == "http.request"]
    output = JsonFormatter().format(record)
    entry = json.loads(output)
    assert entry["status"] == 500 and entry["error_type"] == "RuntimeError"
    assert EMAIL not in output


def test_middleware_error_after_response_started_counts_as_server_error(caplog):
    caplog.set_level(logging.INFO, logger="app")

    async def broken_stream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        raise OSError(f"stream lost for {EMAIL}")

    metrics = RequestMetrics()
    _, sent = run_asgi(RequestObservability(broken_stream, metrics))
    assert [m["type"] for m in sent] == ["http.response.start"]
    assert metrics.snapshot()["server_errors"] == 1
    [record] = [r for r in caplog.records if r.getMessage() == "http.request"]
    entry = json.loads(JsonFormatter().format(record))
    assert entry["status"] == 500 and entry["error_type"] == "OSError"


def test_configure_logging_puts_uvicorn_handlers_behind_redaction():
    uvicorn = logging.getLogger("uvicorn")
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    uvicorn.addHandler(handler)
    try:
        configure_logging()
        assert isinstance(handler.formatter, JsonFormatter)
        try:
            raise ValueError(f"insert failed for {EMAIL} password={PASSWORD}")
        except ValueError:
            logging.getLogger("uvicorn.error").exception("Exception in ASGI application")
    finally:
        uvicorn.removeHandler(handler)
    output = stream.getvalue()
    assert json.loads(output)["error_type"] == "ValueError"
    assert "Traceback" not in output
    assert_clean(output)


def test_worker_task_logs_failure_type_and_scopes_correlation(caplog):
    caplog.set_level(logging.INFO, logger="app")
    with worker_task("hold_sweep"):
        inside = current_correlation()
        raise ValueError(f"lost hold for {EMAIL}")
    assert inside is not None and current_correlation() is None
    [record] = [r for r in caplog.records if r.getMessage() == "worker.task_failed"]
    output = JsonFormatter().format(record)
    entry = json.loads(output)
    assert entry["task"] == "hold_sweep" and entry["error_type"] == "ValueError"
    assert entry["correlation_id"] == str(inside) and EMAIL not in output


def test_correlated_job_binding_does_not_leak():
    request_correlation = uuid4()

    @correlated_job
    def job():
        fresh = current_correlation()
        bind_correlation(request_correlation)
        return fresh, correlation_id()

    fresh, bound = job()
    assert fresh is not None and fresh != request_correlation
    assert bound == request_correlation
    assert current_correlation() is None
    # Outside any request or job every audit row still gets its own ID.
    assert correlation_id() != correlation_id()


def test_correlated_job_logs_step_failure_under_bound_id_and_reraises(caplog):
    caplog.set_level(logging.INFO, logger="app")
    request_correlation = uuid4()

    @correlated_job
    def dispatch():
        bind_correlation(request_correlation)
        raise RuntimeError(f"provider echoed {EMAIL}")

    with pytest.raises(RuntimeError):
        dispatch()
    [record] = [r for r in caplog.records if r.getMessage() == "job.step_failed"]
    output = JsonFormatter().format(record)
    entry = json.loads(output)
    assert entry["correlation_id"] == str(request_correlation)
    assert entry["step"] == "dispatch" and entry["error_type"] == "RuntimeError"
    assert EMAIL not in output and current_correlation() is None
