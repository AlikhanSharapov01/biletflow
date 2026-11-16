"""BF-22 (#78): correlation IDs, redacted structured logs and in-process request metrics.

Standard library only. One correlation ID is bound per HTTP request (server-generated, returned
as ``X-Request-ID``) and per worker job or task pass; audit rows and outbox jobs written in that
context carry it, and a job re-binds the ID of the request that queued it.
"""

import json
import logging
import re
from bisect import bisect_left
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
from datetime import UTC, datetime
from functools import wraps
from threading import Lock
from time import monotonic, perf_counter
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)
_correlation: ContextVar[UUID | None] = ContextVar("biletflow_correlation", default=None)

REQUEST_ID_HEADER = "X-Request-ID"
REDACTED = "[redacted]"


# ---------------------------------------------------------------- correlation


def current_correlation():
    return _correlation.get()


def correlation_id():
    """The bound request/job correlation ID, or a fresh one outside any bound context."""
    return _correlation.get() or uuid4()


def bind_correlation(value):
    """Re-bind inside a ``@correlated_job`` call (the binding ends with that call)."""
    if value:
        _correlation.set(value)


def correlated_job(function):
    """Run each call in its own context under a fresh correlation ID."""

    @wraps(function)
    def run(*args, **kwargs):
        def scoped():
            _correlation.set(uuid4())
            return function(*args, **kwargs)

        return copy_context().run(scoped)

    return run


def signal(event, level=logging.WARNING, **fields):
    logger.log(level, event, extra={**fields, "correlation_id": _correlation.get()})


@contextmanager
def worker_task(task):
    """One worker pass under its own correlation ID; a failure is logged by type, not raised."""
    token = _correlation.set(uuid4())
    try:
        yield
    except Exception as error:
        # Only the type: exception text may echo addresses, paths or tokens.
        signal("worker.task_failed", task=task, error_type=type(error).__name__)
    finally:
        _correlation.reset(token)


# ---------------------------------------------------------------- redaction

SENSITIVE_KEY = re.compile(
    r"password|passwd|secret|token|authorization|cookie|e-?mail|signature|credential|api_?key",
    re.IGNORECASE,
)
SENSITIVE_EXACT = {"code", "state", "qr", "otp"}
PATTERNS = [
    # URLs keep scheme, host and path; credentials, query and fragment are dropped.
    (
        re.compile(r"\b(https?://)(?:[^\s/?#@]*@)?([^\s/?#]+)([^\s?#]*)(\?[^\s#]*)?(#\S*)?"),
        lambda m: (
            m[1] + m[2] + m[3] + ("?" + REDACTED if m[4] else "") + ("#" + REDACTED if m[5] else "")
        ),
    ),
    # Ticket QR payloads and signed entry tokens.
    (re.compile(r"\bbiletflow:(ticket|entry):[^\s\"',;]+"), r"biletflow:\1:" + REDACTED),
    (re.compile(r"\beyJ[\w-]*\.[\w-]+\.[\w-]+"), "[jwt]"),
    # Account, invitation and refresh tokens: <uuid>.<43 url-safe characters>.
    (re.compile(r"\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\.[\w-]{43}"), "[token]"),
    (re.compile(r"\b(bearer|basic)\s+[\w.~+/=-]+", re.IGNORECASE), r"\1 " + REDACTED),
    (re.compile(r"[^\s@<>\"',;:]+@[^\s@<>\"',;:]+\.[A-Za-z]{2,}"), "[email]"),
    (
        re.compile(
            r"\b([\w-]*(?:password|passwd|secret|token|authorization|api_?key)[\w-]*)(\s*[=:]\s*)"
            # Free text: the value runs to the next delimiter, so over-redaction is the failure mode.
            r"(\"[^\"]*\"|'[^']*'|[^&#;,\n]+)",
            re.IGNORECASE,
        ),
        r"\1\2" + REDACTED,
    ),
    (
        re.compile(r"([?&#](?:code|state|key|sig|signature)=)[^&#\s]+", re.IGNORECASE),
        r"\1" + REDACTED,
    ),
]
MAX_TEXT = 2000


def scrub(text):
    for pattern, replacement in PATTERNS:
        text = pattern.sub(replacement, text)
    return text[:MAX_TEXT]


def redact(value, depth=0):
    if depth > 6:
        return "[truncated]"
    if isinstance(value, dict):
        return {
            str(key): REDACTED
            if SENSITIVE_KEY.search(str(key)) or str(key).lower() in SENSITIVE_EXACT
            else redact(item, depth + 1)
            for key, item in value.items()
        }
    if isinstance(value, list | tuple | set | frozenset):
        return [redact(item, depth + 1) for item in value]
    if value is None or isinstance(value, bool | int | float | UUID):
        return value
    if isinstance(value, bytes | bytearray | memoryview):
        return "[bytes]"
    return scrub(str(value))


_RECORD_FIELDS = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {
    "message",
    "asctime",
    "taskName",
}


class JsonFormatter(logging.Formatter):
    """One redacted JSON object per line. Exceptions contribute their type only."""

    def format(self, record):
        entry = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _RECORD_FIELDS and not key.startswith("_"):
                entry[key] = value
        correlation = entry.get("correlation_id") or _correlation.get()
        entry["correlation_id"] = str(correlation) if correlation else None
        if record.exc_info and record.exc_info[0]:
            entry.setdefault("error_type", record.exc_info[0].__name__)
        return json.dumps(redact(entry), default=str, ensure_ascii=False)


def configure_logging(level=logging.INFO):
    """JSON lines on stderr for every ``app.*`` logger; safe to call more than once."""
    root = logging.getLogger("app")
    if not any(isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        root.addHandler(handler)
    root.setLevel(level)


# ---------------------------------------------------------------- request metrics

LATENCY_BUCKETS_MS = (5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0, 10000.0)
METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}


def _rate(part, whole):
    return round(part / whole, 4) if whole else 0.0


class RequestMetrics:
    """Per-process counters since start. Labels are bounded: route templates and known methods."""

    def __init__(self):
        self._lock = Lock()
        self._since, self._started = datetime.now(UTC), monotonic()
        self._routes = {}
        self._buckets = [0] * (len(LATENCY_BUCKETS_MS) + 1)

    def observe(self, method, route, status, seconds):
        method = method if method in METHODS else "OTHER"
        elapsed = seconds * 1000
        with self._lock:
            row = self._routes.setdefault((method, route), [0, 0, 0, 0.0, 0.0])
            row[0] += 1
            row[1] += 400 <= status < 500
            row[2] += status >= 500
            row[3] += elapsed
            row[4] = max(row[4], elapsed)
            self._buckets[bisect_left(LATENCY_BUCKETS_MS, elapsed)] += 1

    def snapshot(self):
        with self._lock:
            routes = sorted(self._routes.items())
            buckets = list(self._buckets)
        total = sum(row[0] for _, row in routes)
        client = sum(row[1] for _, row in routes)
        server = sum(row[2] for _, row in routes)
        cumulative, latency = 0, []
        for bound, count in zip((*LATENCY_BUCKETS_MS, None), buckets, strict=True):
            cumulative += count
            latency.append({"le": bound, "count": cumulative})
        return {
            "since": self._since,
            "uptime_seconds": round(monotonic() - self._started, 3),
            "requests": total,
            "client_errors": client,
            "server_errors": server,
            "error_rate": _rate(server, total),
            "latency_ms": latency,
            "routes": [
                {
                    "method": method,
                    "route": route,
                    "requests": row[0],
                    "client_errors": row[1],
                    "server_errors": row[2],
                    "error_rate": _rate(row[2], row[0]),
                    "mean_ms": round(row[3] / row[0], 3),
                    "max_ms": round(row[4], 3),
                }
                for (method, route), row in routes
            ],
        }


class RequestObservability:
    """Pure ASGI middleware: correlation ID, one structured log line and metrics per request.

    The route template (``/api/v1/campaign-links/{token}``) is logged, never the raw path or
    query string, which can carry tokens, codes or addresses.
    """

    def __init__(self, app, metrics):
        self.app, self.metrics = app, metrics

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        identifier, started = uuid4(), perf_counter()
        state = {"status": 500, "error_type": None}

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                message["headers"] = [
                    *message.get("headers", ()),
                    (REQUEST_ID_HEADER.lower().encode(), str(identifier).encode()),
                ]
            await send(message)

        token = _correlation.set(identifier)
        try:
            await self.app(scope, receive, send_with_id)
        except Exception as error:
            state["error_type"] = type(error).__name__
            raise
        finally:
            elapsed = perf_counter() - started
            route = getattr(scope.get("route"), "path", None) or "unmatched"
            method, status = scope.get("method", ""), state["status"]
            method = method if method in METHODS else "OTHER"
            self.metrics.observe(method, route, status, elapsed)
            fields = {"method": method, "route": route, "status": status}
            if state["error_type"]:
                fields["error_type"] = state["error_type"]
            signal(
                "http.request",
                logging.WARNING if status >= 500 else logging.INFO,
                duration_ms=round(elapsed * 1000, 3),
                **fields,
            )
            _correlation.reset(token)
