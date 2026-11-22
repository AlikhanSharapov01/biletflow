# Operations: correlation IDs, structured logs and metrics (BF-22, #78)

How to follow one operation through the API, the audit trail and the worker, and how to read the
protected operational metrics. The code is in `app/observability.py` (correlation, redaction,
request middleware), `app/operations_service.py` and `app/operations_api.py`.

---

## Correlation IDs

- Every HTTP response carries `X-Request-ID`: a UUID the server generates for that request
  (CORS exposes it to browser clients). A client-sent `X-Request-ID` is ignored, so a caller
  cannot choose the ID its audit rows are filed under. Quote the value when reporting a problem.
- Audit rows written while the request runs (`audit_log.correlation_id`) and outbox jobs it
  queues (`outbox_job.correlation_id`, migration `0021_job_correlation`) store the same ID.
- The worker re-binds a job's stored ID while it runs that job (emails, `payment_initialize`,
  `refund_dispatch`), so its log lines and anything it writes match the request that queued it.
  Jobs queued before `0021` have no stored ID and run under a fresh one.
- Each worker pass (hold sweep, image and ticket PDF reconciliation, provider-event processing)
  runs under its own fresh ID; audit rows the pass writes (for example `checkout.holds_expired`,
  `payments.refund_succeeded`) share it. Provider events arrive in their own request and store no
  correlation ID, so their processing is not linked back to that request.
- Outside a request or job (CLI, seed) every audit row still gets its own random ID, as before.
  Support-case audit rows keep the case ID as their correlation, as before.

## Structured logs

The API and the worker write one JSON object per line to stderr for every `app.*` logger:

```json
{"ts": "2026-11-17T09:12:03.418+00:00", "level": "info", "logger": "app.observability",
 "event": "http.request", "method": "POST", "route": "/api/v1/auth/register", "status": 202,
 "duration_ms": 41.7, "correlation_id": "6f0b…"}
```

| `event` | Level | Fields |
|---|---|---|
| `http.request` | info; warning for 5xx | `method`, `route`, `status`, `duration_ms`, `error_type` (unhandled exceptions) |
| `job.retry_scheduled` | warning | `job_id`, `kind`, `attempt`, `last_error`, `error_type`, `retry_in_seconds` |
| `job.dead` | error | `job_id`, `kind`, `attempt`, `last_error`, `error_type` (null when attempts were already exhausted at claim) |
| `job.lease_lost` | warning | `job_id`, `kind` — the lease expired before the result was recorded; the job is retried |
| `job.attachment_failed` | warning | `job_id`, `error_type` — the ticket email goes out without its PDF |
| `job.done` | info | `job_id`, `kind` — a payment initialization or refund dispatch job finished |
| `job.step_failed` | warning | `step` (worker function), `error_type` — an unexpected error in a job step, under the job's ID; the job stays due and is retried |
| `ga4.export_failed` | warning | `export_id`, `attempt`, `last_error` (`ga4_unavailable`, `ga4_error`, `ga4_send_failed`), `final` (true when the row is now `failed` after 5 attempts) — a GA4 measurement was not accepted |
| `attachment.scan_deferred` | warning | `job_id`, `file_id`, `attempt`, `last_error` (`scanner_unavailable`) — no verdict from ClamAV or storage; the upload stays quarantined and the scan is retried |
| `notification.email_retry` / `notification.email_failed` | warning | `delivery_id`, `attempt`, `last_error`, `error_type` — a notification email failed and is retried / gave up after 5 attempts |
| `worker.task_failed` | warning | `task` (`hold_sweep`, `image_reconcile`, `ticket_pdf_reconcile`, `attachment_reconcile`, `payments`, `ga4_export`, `attachment_scan`, `email_delivery`), `error_type` |

Uvicorn's own access log stays disabled (`--no-access-log`): it prints raw paths and query strings.
Uvicorn's remaining handlers use the same redacting JSON formatter.

An unhandled exception in a request never reaches the server's traceback logging: the middleware
logs it as `http.request` (status 500, `error_type`) and answers
`500 {"detail": {"code": "internal_error"}}` with the `X-Request-ID` header. If the response had
already started, the connection is closed and the request is still counted and logged as a 500.

What is never logged:

- `route` is the route template (`/api/v1/campaign-links/{token}`), never the raw path or the
  query string; requests that match no route are logged as `unmatched`.
- Exceptions contribute their class name only (`error_type`), never their message or traceback:
  SMTP, storage and provider errors can echo addresses, paths or tokens.
- Every field passes through redaction before it is written. Values under keys that name a
  password, secret, token, authorization header, cookie, email, signature, credential or API key
  (and `code`, `state`, `qr`, `otp`) become `[redacted]`. In free text, email addresses,
  `Bearer`/`Basic` credentials, JWTs, `<uuid>.<secret>` account/refresh tokens, ticket QR
  payloads (`biletflow:ticket:…`), entry tokens (`biletflow:entry:…`) and `key=value` secrets are
  replaced, and URLs keep only scheme, host and path (credentials, query and fragment, such as
  `#token=` links or signed storage URLs, are dropped). Free-text redaction errs towards removing
  too much; log structured fields rather than interpolated text.

## Metrics: `GET /api/v1/admin/operations/metrics`

Platform administrators only (the same grant as [ADMIN_API.md](ADMIN_API.md)): no or an invalid
token → `401 invalid_credentials`, any other signed-in user → `403 admin_required`. The response
is `Cache-Control: no-store` and contains counts, rates, durations and job kinds only, with no
user data.

Request:

```text
GET /api/v1/admin/operations/metrics
Authorization: Bearer <access token>
```

Response `200` (`Cache-Control: no-store`; the numbers are illustrative):

```json
{
  "generated_at": "2026-11-17T09:15:00Z",
  "requests": {
    "since": "2026-11-17T08:00:00Z",
    "uptime_seconds": 4500.2,
    "requests": 1520,
    "client_errors": 37,
    "server_errors": 2,
    "error_rate": 0.0013,
    "latency_ms": [
      {"le": 5.0, "count": 300},
      {"le": 10.0, "count": 620},
      {"le": 25.0, "count": 1010},
      {"le": 50.0, "count": 1240},
      {"le": 100.0, "count": 1390},
      {"le": 250.0, "count": 1470},
      {"le": 500.0, "count": 1500},
      {"le": 1000.0, "count": 1512},
      {"le": 2500.0, "count": 1517},
      {"le": 5000.0, "count": 1519},
      {"le": 10000.0, "count": 1520},
      {"le": null, "count": 1520}
    ],
    "routes": [
      {"method": "GET", "route": "/api/v1/events", "requests": 410,
       "client_errors": 0, "server_errors": 0, "error_rate": 0.0,
       "mean_ms": 18.2, "max_ms": 240.9},
      {"method": "POST", "route": "/api/v1/events/{event_id}/holds", "requests": 1100,
       "client_errors": 27, "server_errors": 2, "error_rate": 0.0018,
       "mean_ms": 31.4, "max_ms": 1820.6},
      {"method": "GET", "route": "unmatched", "requests": 10,
       "client_errors": 10, "server_errors": 0, "error_rate": 0.0,
       "mean_ms": 1.1, "max_ms": 2.4}
    ]
  },
  "jobs": {
    "outbox": {"pending": 4, "ready": 1, "retrying": 2, "leased": 1, "expired_leases": 0,
               "dead": 3, "oldest_ready_age_seconds": 12.4},
    "outbox_by_kind": [
      {"kind": "auth_email", "pending": 2, "leased": 0, "dead": 1},
      {"kind": "support_email", "pending": 1, "leased": 1, "dead": 0},
      {"kind": "ticket_delivery_email", "pending": 1, "leased": 0, "dead": 2}
    ],
    "notification_email": {"pending": 0, "ready": 0, "failed": 1,
                           "oldest_ready_age_seconds": null}
  }
}
```

The response lists every route the process has served since it started, not only three, and
`outbox_by_kind` lists every kind with an open job.

**`requests`** — counted by this API process since it started (it restarts from zero with the
process, and each process counts separately if more than one is run). Docker Compose runs
`API_WORKERS` processes (default 2, #118), so one response covers only the process that answered
it, and two calls in a row may come from different processes. Labels are bounded: the
route template, or `unmatched`, and the HTTP method (unknown methods count as `OTHER`).
`client_errors` are 4xx, `server_errors` are 5xx (including unhandled exceptions), and
`error_rate` is `server_errors / requests`. `latency_ms` is a cumulative histogram (`le` is the
upper bound in milliseconds; `null` is the open-ended bucket, equal to `requests`).

**`jobs`** — read from the database when the request is made, so they cover every worker:

| Field | Meaning |
|---|---|
| `outbox.pending` | Jobs waiting to run (`status = 'pending'`), including those scheduled for later |
| `outbox.ready` | Pending jobs already due (`available_at <= now`) — the backlog |
| `outbox.retrying` | Pending jobs that have failed at least once (`attempt_count > 0`) |
| `outbox.leased` / `expired_leases` | Jobs being worked on / leases past `lease_until` (a crashed or stalled worker; they are reclaimed) |
| `outbox.dead` | Jobs that exhausted their attempts (`last_error` keeps a safe code) |
| `outbox.oldest_ready_age_seconds` | How long the oldest due job has waited since it became due; `null` without a backlog |
| `outbox_by_kind` | The pending/leased/dead counts per job kind (kinds with only finished jobs are omitted) |
| `notification_email` | Email notification deliveries: `pending`, due (`ready`), terminal `failed`, and the oldest due one's wait |

Inspecting the individual dead jobs and failed deliveries is an admin view of its own (#73).

### Errors

Errors use the usual `{"detail": {"code": "..."}}` body. The route takes no path, query or body
input, so it has no validation error.

| Status | `code` | When |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 403 | `admin_required` | Signed in, but without a current platform-admin grant |
| 503 | `database_unavailable` | The database could not be read for the `jobs` figures |
| 500 | `internal_error` | Unhandled server error; quote the `X-Request-ID` response header |

### Stability

For clients that draw the metrics (an admin screen or a dashboard).

- **Stable.** The top-level objects `requests` and `jobs`; the `jobs.outbox` keys `pending`,
  `ready`, `retrying`, `leased`, `expired_leases`, `dead` and `oldest_ready_age_seconds`; each
  `jobs.outbox_by_kind` entry's `kind`, `pending`, `leased` and `dead`; the four
  `jobs.notification_email` keys `pending`, `ready`, `failed` and `oldest_ready_age_seconds`;
  `requests.requests`, `requests.error_rate` and `requests.uptime_seconds`; each `requests.routes`
  entry's `method`, `route`, `requests` and `client_errors`; the last `latency_ms` bucket
  `{"le": null, "count": <requests>}`; the `403 admin_required` and `500 internal_error` answers.
  These are what the tests assert.
- **May change.** Clients should ignore unknown fields and not hard-code the following; no test
  asserts them yet, so treat them as provisional.
  - `generated_at`, `requests.since`, `requests.client_errors` and `requests.server_errors`, and
    in each route entry `server_errors`, `error_rate`, `mean_ms` and `max_ms`.
  - The latency bucket bounds (`5` to `10000` ms today) and how many buckets there are.
  - Which routes appear and their `route` labels: they are the route templates, so they follow the
    API paths, and unmatched requests appear as `unmatched`.
  - The codes `invalid_credentials` and `database_unavailable`: the tests assert only the `401`
    status of the first, and the second is not exercised for this route.
  - Which job `kind` values appear in `outbox_by_kind`.
  - The log event names and fields in the table above. They are for operators reading stderr, not
    a client contract.
