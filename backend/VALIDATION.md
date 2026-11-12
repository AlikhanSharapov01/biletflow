# Backend validation

## Measured checkout and admission load with concurrent analytics (#80) — 12 November 2026

Scope: requirements §10.1, BF-18 and BF-22. First measured end-to-end latency evidence for paid
checkout under constrained inventory and online admission, with and without organizer analytics
running at the same time. This is local, single-machine evidence for the declared baseline below,
not a production capacity claim. Distinct from the #48 browser end-to-end and #57 smoke/restart
checks.

**Concurrency baseline: proposed, pending owner confirmation.** The §10.1 example parameters were
used as the baseline: **50 concurrent checkout attempts against 40 tickets** and **10 concurrent
scanner clients**. They remain proposals until the project owner selects them.

### Environment

| Item | Value |
|---|---|
| Machine | Apple M4, 10 logical CPUs, 16 GiB RAM (`sysctl machdep.cpu.brand_string hw.ncpu hw.memsize`) |
| OS | macOS 15.7.4 (arm64) |
| Python / packages | CPython 3.12.15 via uv 0.12.23, locked deps: uvicorn 0.53.0 (asyncio + h11; uvloop/httptools not installed), FastAPI 0.141.1, SQLAlchemy 2.0.54, psycopg 3.3.6, httpx 0.28.1 |
| PostgreSQL | 16.15 (Homebrew), default configuration (`max_connections` 100, `shared_buffers` 128MB), TCP on 127.0.0.1:5432, disposable database `biletflow_load_test`, local superuser role (not the narrowly privileged `biletflow_app` role) |
| API | One process, `uvicorn app.main:create_app --factory --no-access-log` as in `backend/Dockerfile`; SQLAlchemy default pool (5 + 10 overflow connections) |
| Worker | One `python -m app.worker` process, delivering mail to a local SMTP sink started by the harness |
| Client | Same machine: one asyncio process with `httpx.AsyncClient` over loopback |
| Code | Application revision `7dd19e0` (`origin/main`); harness in `tests/load/load_harness.py` |
| Test-only server settings | `RATE_IP_LIMIT=1000000` and `RATE_IDENTITY_LIMIT=1000000` because every simulated client shares 127.0.0.1 (the limiter still runs one extra transaction per limited request, so its cost is included); `ENVIRONMENT=test` for the payment simulator; `ACCESS_MINUTES=30`; `ADMISSION_REQUIRE_ENTRY_CONFIRMATION=true` and `ENTRY_CONFIRMATION_SECONDS=120` (defaults) |

### Dataset

Everything is created through the public `/api/v1` API. The database is read only to pick up
e-mail verification and staff-invitation tokens (normally delivered by e-mail) and to check
invariants.

- Per harness invocation: 81 verified accounts (1 organizer owner, 10 staff with only the `scan`
  capability, 50 buyers, 20 attendees); one organization with simulated payout profile and
  identity verification; a **history event** with 400 sold paid tickets (100 simulated-paid
  orders of 4 at KZT 4,000, half using a 10% campaign code) so analytics has more rows to
  aggregate.
- Per run (fresh events, so runs are independent): a **checkout event** — paid ticket type
  KZT 5,000, event capacity and quantity limit **40**, per-order limit 1, paid sales activated
  through the simulated fee payment; and an **admission event** — 200 free tickets (20 attendees
  × 10, claimed by their buyer), admission window open, scanners assigned. Each attendee requests
  an entry confirmation for each ticket just before the timed phase (not part of the target;
  p95 78–255 ms per run).
- The database was dropped and recreated before the main invocation. After it: 81 users,
  13 events, 460 orders, 1,840 tickets, 1,200 check-ins, 4,458 outbox jobs. The 20-client
  invocation ran afterwards in the same database (162 users, 26 events, 920 orders, 3,680
  tickets, 2,400 check-ins at its end). Analytics are event-scoped, so their cost depends mainly
  on per-event rows (at most 400 tickets here).

### Scenarios

- **A (baseline):** at one start signal, 50 buyers each run hold → paid checkout (quote, pending
  order, payment attempt) → simulated `succeeded` payment → order read, with a fresh
  `Idempotency-Key` per action; at the same time 10 scanners each scan sequentially their own
  20 tickets plus 5 tickets from the next scanner's list, shuffled (250 scans, 50 deliberate
  cross-scanner duplicates per run). Each scan sends the ticket QR, the attendee's entry
  confirmation and a new `operation_id`.
- **B:** the same, while K organizer clients (owner session) loop without pause over the
  analytics summary and the hourly/daily sales series of the checkout, admission and history
  events, starting 1 s before the start signal and stopping when the last buyer/scanner finishes.
  Main invocation K = 5; sensitivity invocation K = 20.
- Runs are interleaved A1 B1 A2 B2 A3 B3; 3 runs per scenario. Latency is the client-observed
  HTTP round trip on loopback. Percentiles are nearest-rank over all requests of one run; tables
  give the **median of the three runs' p95** and the **worst run**. `checkout.flow_e2e` is one
  buyer's whole journey from hold request to the confirmed order read.

### Commands

```bash
createdb biletflow_load_test
cd backend
export LOAD_DATABASE_URL=postgresql+psycopg://alikhan@127.0.0.1:5432/biletflow_load_test
uv run python -m tests.load.load_harness --runs 3 --output-dir "$TMPDIR/load-main"
uv run python -m tests.load.load_harness --runs 3 --analytics-clients 20 --output-dir "$TMPDIR/load-k20"
RUN_LOAD_TESTS=1 TEST_DATABASE_URL=$LOAD_DATABASE_URL uv run pytest tests/load -q
dropdb biletflow_load_test
```

Both harness invocations exited 0 (all invariants held, admission target met) and wrote
`results.json`, `results.md`, `api.log` and `worker.log` to the output directory (local, not
committed); the API and worker logs contained no errors or tracebacks. The opt-in pytest wrapper
(one run per scenario) passed: **1 passed in 24.33 s**. Without `RUN_LOAD_TESTS=1` it is skipped,
and the normal suite still collects (**532 tests**, the 531 earlier cases plus this wrapper).

### Results — main invocation (K = 5 analytics clients)

| Scenario | Operation | Requests (3 runs) | Non-2xx | 5xx / transport | p50 (median) | p95 (median) | p95 (worst) | p99 (worst) | max (worst) |
|---|---|---|---|---|---|---|---|---|---|
| A | `admission.check_in` | 750 | 150 (all `409 already_checked_in`) | 0 | 42.5 ms | **312.2 ms** | 321.1 ms | 525.4 ms | 598.7 ms |
| A | `checkout.hold` | 150 | 30 (all `409 event_capacity_exceeded`) | 0 | 354.7 ms | 512.6 ms | 547.4 ms | 943.6 ms | 943.6 ms |
| A | `checkout.checkout` | 120 | 0 | 0 | 371.4 ms | 654.0 ms | 788.4 ms | 1158.5 ms | 1158.5 ms |
| A | `checkout.payment` | 120 | 0 | 0 | 391.4 ms | 672.5 ms | 722.7 ms | 994.9 ms | 994.9 ms |
| A | `checkout.order_read` | 120 | 0 | 0 | 64.8 ms | 238.2 ms | 255.1 ms | 385.2 ms | 385.2 ms |
| A | `checkout.flow_e2e` | 120 | 0 | 0 | 1138.2 ms | **1567.9 ms** | 1581.6 ms | 1648.4 ms | 1648.4 ms |
| B | `admission.check_in` | 750 | 150 (all `409 already_checked_in`) | 0 | 62.0 ms | **452.8 ms** | 454.2 ms | 895.2 ms | 920.1 ms |
| B | `checkout.hold` | 150 | 30 (all `409 event_capacity_exceeded`) | 0 | 416.7 ms | 736.9 ms | 794.1 ms | 1210.0 ms | 1210.0 ms |
| B | `checkout.checkout` | 120 | 0 | 0 | 411.5 ms | 793.0 ms | 1072.2 ms | 1465.4 ms | 1465.4 ms |
| B | `checkout.payment` | 120 | 0 | 0 | 344.2 ms | 781.4 ms | 818.8 ms | 1062.7 ms | 1062.7 ms |
| B | `checkout.order_read` | 120 | 0 | 0 | 91.4 ms | 207.3 ms | 231.7 ms | 326.0 ms | 326.0 ms |
| B | `checkout.flow_e2e` | 120 | 0 | 0 | 1253.4 ms | **1785.6 ms** | 2082.2 ms | 2158.5 ms | 2158.5 ms |
| B | `analytics.summary` | 267 | 0 | 0 | 50.4 ms | 315.2 ms | 316.4 ms | 816.1 ms | 816.1 ms |
| B | `analytics.series` | 266 | 0 | 0 | 44.2 ms | 313.3 ms | 346.4 ms | 628.7 ms | 670.3 ms |

Per-run admission p95: A 301.0 / 312.2 / 321.1 ms; B 334.8 / 454.2 / 452.8 ms. Timed windows
(start signal to last client): A 1.97–2.00 s, B 2.72–3.56 s. Admission throughput (scans ÷
window, median): A 125.5/s, B 82.1/s.

### Results — sensitivity invocation (K = 20 analytics clients)

| Scenario | Operation | Requests (3 runs) | Non-2xx | 5xx / transport | p50 (median) | p95 (median) | p95 (worst) | p99 (worst) | max (worst) |
|---|---|---|---|---|---|---|---|---|---|
| A | `admission.check_in` | 750 | 150 (duplicates) | 0 | 42.8 ms | **298.8 ms** | 305.0 ms | 511.9 ms | 844.3 ms |
| A | `checkout.flow_e2e` | 120 | 0 | 0 | 1154.7 ms | **1593.9 ms** | 1617.8 ms | 1685.0 ms | 1685.0 ms |
| B | `admission.check_in` | 750 | 150 (duplicates) | 0 | 158.6 ms | **742.8 ms** | 745.0 ms | 1180.2 ms | 1873.5 ms |
| B | `checkout.hold` | 150 | 30 (`event_capacity_exceeded`) | 0 | 355.8 ms | 542.5 ms | 557.4 ms | 878.9 ms | 878.9 ms |
| B | `checkout.checkout` | 120 | 0 | 0 | 402.7 ms | 699.1 ms | 699.4 ms | 1005.6 ms | 1005.6 ms |
| B | `checkout.payment` | 120 | 0 | 0 | 414.0 ms | 685.6 ms | 877.7 ms | 1132.0 ms | 1132.0 ms |
| B | `checkout.flow_e2e` | 120 | 0 | 0 | 1349.3 ms | **1892.6 ms** | 2200.9 ms | 2276.9 ms | 2276.9 ms |
| B | `analytics.summary` | 1038 | 0 | 0 | 129.7 ms | 670.9 ms | 676.6 ms | 1349.8 ms | 2318.2 ms |
| B | `analytics.series` | 1035 | 0 | 0 | 105.3 ms | 670.3 ms | 687.0 ms | 1211.3 ms | 1770.5 ms |

Timed windows: A 2.02–2.06 s, B 6.69–7.67 s. Admission throughput (median): A 122.4/s, B 36.1/s.

### Admission target and analytics impact

- **Admission p95 is under the two-second target in every run**: worst 321 ms without analytics,
  454 ms with 5 analytics clients and 745 ms with 20. The single slowest check-in observed was
  1,874 ms (K = 20).
- With 5 analytics clients, admission p95 rose about 45% (312 → 453 ms median) and scan throughput
  fell about 35%; checkout end-to-end p95 rose about 14% (1,568 → 1,786 ms). With 20 clients,
  admission p95 rose about 2.5× (299 → 743 ms), scan throughput fell about 70% and the timed window
  grew from about 2 s to about 7 s.
- §10.1 declares no checkout latency target. For information: checkout end-to-end p95 was at most
  1.62 s without analytics and its worst run reached 2.08 s (K = 5) and 2.20 s (K = 20) with
  analytics. A paid checkout is three writes plus a read; under 50 simultaneous buyers the hold step
  is serialized on the event row lock by design.
- Error rates: no 5xx or transport errors in any timed phase. Every non-2xx response was an
  expected business rejection: exactly 10 sold-out holds per run
  (`409 event_capacity_exceeded`) and exactly 50 duplicate scans per run, all
  `409 already_checked_in`.
- The slowdown was not profiled. The likely cause is CPU contention in the single API process
  (one Python process serving every client) plus client, worker and PostgreSQL sharing one
  machine; it should not be read as database lock contention, which analytics avoids by design.

### Invariant checks (every run, both invocations: 12/12 runs passed)

| Check (per run) | Result |
|---|---|
| Issued tickets and sold allocations on the checkout event ≤ capacity 40 (no overselling) | 40 every run |
| Confirmed orders = client flows that ended confirmed; tickets = confirmed orders | 40 = 40 = 40 |
| All 40 tickets sold to racing buyers; the other 10 rejected with `409 event_capacity_exceeded` | Passed |
| No live holds left on the checkout event | 0 |
| Analytics `inventory.sold` = issued tickets and `available` = capacity − sold | 40 and 0 |
| Every admission ticket admitted exactly once (HTTP) and none twice | 200 / 0 |
| Current check-ins in the database = 200; tickets with more than one check-in row = 0; tickets in `checked_in` = 200 | Passed |
| All 50 duplicate scans rejected, all as `409 already_checked_in` | Passed; in 20–23 of the 50 per run the "duplicate" scanner won the race and the owning scanner received the rejection |
| Scanner counts `admitted` and analytics `attendance.checked_in` = 200 | Passed |
| No 5xx or transport errors in the timed phase | 0 |

No overselling, duplicate admission or server error was observed, so no production defect is
reported from this measurement.

### Limitations

- Local process run, not the Docker/Caddy stack: no TLS or reverse-proxy hop, no container
  limits, and PostgreSQL 16.15 instead of the Compose image's 17. Results describe this machine.
- Client, API, worker and database share one machine; client CPU and loopback latency are part
  of the numbers. Real scanner networks (Wi-Fi/mobile) add latency that this does not measure.
- Rate limits were raised for the test only; production limits would throttle a single address
  sending this traffic. The API connected as a superuser role rather than `biletflow_app`.
- Payments use the in-process simulator; real provider latency, webhooks and failures are not
  included. Only free tickets were admitted, with entry confirmations obtained before the timed
  phase; offline sync, manual search and reversal were not loaded.
- Short bursts (2–8 s per run) of the proposed baseline only: no soak test, no ramp to find a
  breaking point, one API process (more workers were not tried) and a small dataset.
- Three runs per scenario give a coarse spread, not a statistical confidence interval.

## Final reviewed code — 9 November 2026

The full PostgreSQL suite was rerun after the whole-branch review fixes, at application
revision `8dd56d5`: **531 collected, 530 passed, 1 failed, 0 errors, 0 skipped**, in
1697.06 seconds (28m17s). The only failure remains the pre-existing Windows DejaVu-font
case, `tests/test_ticket_documents.py::test_pdf_keeps_unicode_attendee_names`. One existing
Starlette/httpx TestClient deprecation warning remains. The suite is **not fully green**;
no new regression failures were observed.

Statement coverage is **7433/7728 (96.1827%; displayed 96%)**, with 295 missing statements.
Full backend Ruff lint passed, all **134 Python files** passed formatting, and the complete
change range passed whitespace checks. Final scoped review addressed both Important
findings (uncertain-commit upload compensation and repeated cancellation finance aggregates)
and the indexed-PNG alpha finding; the directly affected PostgreSQL run passed **78 tests**.

Local ignored evidence: `tmp/backend-issues-final-full-suite.log`,
`tmp/backend-issues-final-results.xml`, and `tmp/backend-issues-final-coverage.json`.
The test command was the earlier full-suite command below with `final` artifact filenames.
The local three-locale SMTP check and migration round trips below remain applicable;
no client, provider, production rollout or remote-storage acceptance is implied. Local load
measurements are recorded separately in the 12 November 2026 section above.

## Initial feature-tree validation (#38–44) — 9 November 2026

Scope: operational analytics, simulated finance/payouts, organizer ticket-type counters/history
filters, admin paid-sales/commerce monitoring, protected event images/recovery, backend localization
and reconciliation of implementation documentation. These are backend contracts and tests; full
product acceptance and client integration remain incomplete.

| Check | Result / evidence |
|---|---|
| Full PostgreSQL suite | **523 collected: 522 passed, 1 failed, 0 errors, 0 skipped**, 1118.02 seconds (18m38s), at product HEAD `9d26749`. The only failure is the pre-existing Windows Unicode PDF font case; no new regression failures observed |
| Known failure / warning | `tests/test_ticket_documents.py::test_pdf_keeps_unicode_attendee_names`: required DejaVu font missing on Windows, reproduced in the pre-change baseline. One existing Starlette/httpx TestClient deprecation warning. The suite is **not fully green** |
| Statement coverage | **7413/7711 statements (96.1354%; displayed 96%)**, 298 missing; supporting evidence, not full-product acceptance |
| Schema inventory | Dedicated disposable `biletflow_daulet_issues_test` inspected at `0016_image_cleanup`: 16 revisions, 66 `biletflow` tables, excluding `public.alembic_version`. Static migration table names independently match the count |
| Reference comparison | Reference also has 66 tables, with a different set: GA4 connection/export/cache and separate claim table are design-only; four authentication extension tables are implementation-only. Authenticated claiming works on `ticket` fields; see [matrix](../docs/database/README.md#how-the-design-relates-to-the-implementation) |
| Finance migration | `0014_finance` down/up passed on the disposable database; prior `ticket_order` preserved, new finance tables restored |
| Image migrations | `0015_event_images` and `0016_image_cleanup` up/down/up passed on the disposable database; prior stored-file/finance/media tables preserved as applicable, cleanup concurrent index verified valid |
| Static checks | Controller full Ruff lint passed; full format check reported 132 files already formatted. Documentation `git diff --check` and local Markdown file-target checks passed |
| Real local SMTP | Three verification messages (kk/ru/en) passed localized subject/body/expiry/link assertions through real SMTP and isolated Mailpit HTTP; evidence: `tmp/locale-mailpit-validation.json`. No external delivery or visual inbox inspection claimed |

Focused integration evidence (each batch is independent; counts must not be added as unique tests):

- Analytics: 21 passed, covering exact revenue/refund/rebuy/extra-charge reconciliation, filters,
  timezone buckets, access and a report succeeding while another connection holds the event lock.
- Finance: 89 passed across finance and affected commerce/notification/analytics selections;
  includes 13 finance scenarios, concurrent reservations, refund/send race and immutable history.
- Counts/history: 34 passed including existing catalog regression; final 12-case focused rerun
  verifies authorized counters, failed-refund occupancy, filter validation and public privacy.
- Admin commerce: final 5 passed; earlier combined attempt had 62 passes and 4 fixture setup errors,
  corrected before the final focused pass. Covers permission, suspension/fulfillment, prerequisites,
  concurrency/idempotency, bounded filters/CSV and safe selected columns.
- Event galleries: 60 passed across image/catalog/counts/support selection, then 2 changed/additional
  validation cases passed. Recovery/worker/image selection: 28 passed, including stale persisted
  metadata, failed delete/retry, bounded batches, late writes and released DB locks during storage IO.
- Localization: 147 passed in the final selected regression, plus 2 absent/unverified-recipient
  fallback cases passed separately. Covers direct auth/staff/ticket/support mail, existing notice
  families, category names, English fallback and preservation of links/user content.

Evidence is retained in the local ignored `.superpowers/sdd/backend-issues-plan/task-1-report.md`
through `task-6-report.md`. The controller ran the final full suite once after the product changes, using the same dedicated
disposable PostgreSQL database. Machine-readable evidence is in local ignored
`tmp/backend-issues-results.xml` and `tmp/backend-issues-coverage.json`; terminal output is in
`tmp/backend-issues-full-suite.log`. Repeatable command from the repository root:

```text
backend/.venv/Scripts/python.exe tmp/run_backend_tests.py -q --tb=short --cov=app --cov-report=term-missing --cov-report=json:../tmp/backend-issues-coverage.json --junitxml=../tmp/backend-issues-results.xml
```

The local launcher loads credentials internally, selects the disposable feature database and
uses isolated temporary storage. It is local execution evidence, not a hosted CI result.

Image recovery tests replay durable interruption states and late writes; they do not kill a process.
Recovery requires a running worker and available database/storage. New migration rollbacks remove
new finance history or gallery links; disposable round trips do not prove production rollback safety.
Payout eligibility after event end and cleanup grace/retry/batch limits are implementation defaults,
not newly confirmed product decisions. Notification language fallback is English; account default
remains Russian, and user-authored content is not translated.

Not verified by this increment: frontend/mobile end-to-end flows, hosted CI execution, live Google
consent/payment provider/GA4, external email, remote object storage, production deployment,
backup/restore or actual process-kill recovery. Latency/load targets were not measured in this
increment; see the 12 November 2026 load section. Existing Windows
Unicode PDF font failure and the Starlette/httpx TestClient deprecation are tracked explicitly in
the full-suite result. Earlier dated evidence below describes earlier scope, not current omissions.

---

## Promo campaigns, refunds and order notifications — 8 November 2026

Scope: SRS 4.14 promo codes and Campaign QR, SRS 4.9 refunds and cancellations, the purchase,
payment-failure and refund notifications of SRS 4.10, and migration `0013_campaigns`.

| Check | Result |
|---|---|
| Automated tests | **330 cases: 329 passed, 1 failed on Windows only.** PostgreSQL 17, real independent connections |
| The one failure | `test_pdf_keeps_unicode_attendee_names` needs the DejaVu font, which the Docker image and Linux have and this Windows machine does not. It failed the same way before these changes |
| Statement coverage | **96%** overall; `pricing.py`, `refund_api.py` and `campaign_models.py` 100%, `campaign_service.py` 98%, `refund_service.py` 97% |
| Static checks | Ruff checks and formatting passed for `app`, `tests` and `migrations` |
| Migration | Applied by `python -m app.bootstrap` on an empty database; 13 migrations, one head |
| Live smoke | `tools/smoke_paid_checkout.py` **passed** on `docker compose` with the restricted application role, the worker and Mailpit |

The automated tests cover:

- The worked example from the requirements: face 20,000, discount 2,000, collected 18,000, fee 540.
- A race for the last redemption, on independent connections: one success, one `promo_exhausted`.
- Reservation release on hold expiry, replacement, late payment and blocked fulfilment.
- Requoting after a campaign changes, and refunding a charge when it is disabled during payment.
- A basket discounted to zero going through the free path.
- A campaign link rejected by the scanner as `not_a_ticket_qr`.
- Full refunds, double submits, replayed callbacks, a failed refund staying blocked, and permission scope.
- A refunded ticket rejected at the scanner, and stock returning only after a confirmed refund.
- A refund not giving back a redemption.
- Event cancellation with free and paid orders.
- One notification per order, attempt or refund, however often the operation repeats.

The live smoke test ran: paid-sales activation, campaign creation, link resolution, scanner rejection,
a discounted hold and order, a failed then successful payment, admission, a compensation refund, the
campaign report, and an organizer refund through to `refunded`.

Not verified here: the web and mobile screens against these endpoints, and the 8080 Caddy route (the
smoke test talks to the API directly).

---

## Earlier validation — 24 September 2026

Implemented scope: BF-01 identity plus the [organizer/event setup increment](CATALOG_API.md): workspaces, email invitations, scoped permissions, discovery/publication, ticket types and predefined seating. Checkout, payments/refunds, admission and the full-product acceptance matrix remain incomplete.

| Check | Result |
|---|---|
| Automated tests | **91 passed**, 81.50 seconds; 69 identity tests plus 22 catalogue tests |
| Measured application statement coverage | **93%** overall; includes CLI entry points not executed by pytest |
| PostgreSQL | Native PostgreSQL 17.11, real independent connections |
| Migration | Test database and local application database at `0002_event_setup`; existing identity row snapshots unchanged across the local upgrade |
| Database scope | 27 tables; separate migration owner and runtime role; the 66-table design is not fully deployed |
| Static checks | Ruff checks and formatting passed |
| Compose configuration | Parsed successfully; Docker image build/runtime not verified because Docker Desktop did not start |
| Running API smoke test | Prior authentication smoke passed; new smoke passed account verification, free seated-event publication, anonymous discovery, invitation acceptance, scanner edit denial and assignment revocation |
| Email smoke test | Durable worker delivered verification and staff-invitation messages over real SMTP into local Mailpit; no external email sent |
| Google | Cryptographic validation, nonce/state/browser binding, account creation/linking and callback replay tested with simulated provider responses |
| Live Google consent | Not run: client ID/secret not configured |
| CI | PostgreSQL 17 workflow provided; hosted workflow has not yet run |

The automated suite tests concurrent registration, single-use verification, duplicate refresh and password-reset-versus-refresh on independent connections. It also tests rollback when outbox creation fails, role permissions, foreign keys, immutable audit history, secure cookies/origin protection, wrong/expired/forged credentials, rate windows, revocation, Google claim/signature failures, email retry exhaustion and worker lease fencing.

Catalogue tests exercise concurrent invitation acceptance, wrong recipient/replay/expiry, revoked inviter authority, permission delegation and removal limits, cross-organization isolation, private/unlisted visibility, non-owner draft duplication, capacity reduction, immutable allocated identity, live-seat uniqueness, cancellation guards, and complete rollback on invalid seating configuration. Tests insert hold/allocation fixtures to exercise capacity guards; no checkout API is implied. Static checks and formatting passed for all application, migration and test files.

The only pytest warning is an upstream Starlette deprecation notice for its `httpx` test-client adapter. Tests pass; runtime Google HTTP requests still use `httpx`.

See [the repeatable commands](README.md#tests-and-checks), [authentication smoke results](../docs/database/auth_smoke_validation.json), and [catalogue/migration smoke results](../docs/database/catalog_smoke_validation.json). Coverage is supporting evidence, not a claim of production security certification. Real Google consent and frontend/mobile integration remain to be exercised with their configuration and clients.

The live catalogue smoke used the restricted application role through the running API and background worker. It left a clearly fictional published event with 12 free configured seats for browsing. It created no order, ticket or payment, and revoked the two smoke accounts' sessions afterwards. The repeatable seed contains two categories and one fictional venue/layout; paid-price fixtures remain for the commerce stage.

## Historical local-service notes — 24 September 2026

These describe the September session, not verified current service availability. On 9 November
2026 only local PostgreSQL was restored for isolated tests; no API/worker deployment was verified.
The separate temporary Mailpit instance used for the three-language SMTP smoke was stopped after
validation. The addresses/process files below are historical references; inspect current processes
and configuration before relying on them.

- API documentation: <http://localhost:8000/docs>
- Local email inbox: <http://localhost:8025>
- PostgreSQL: `127.0.0.1:55432`, database `biletflow`, schema `biletflow`.
- Local connection settings and generated secrets: `backend/.env` (ignored by source control). Do not paste or commit them.
- The separately named `biletflow_auth_test` database is disposable test data only.

Because Docker Desktop could not start, this session uses EDB's portable PostgreSQL binaries and Mailpit's official Windows binary. No Windows database service was installed. PostgreSQL is under `%TEMP%/biletflow-auth-postgres-01a0c53f`; its data remains there until explicitly removed. Preserve it or take a database backup before clearing temporary files. This is a local demonstration; use the documented Compose volume for the team setup.

The API, worker and Mailpit were started as hidden background processes. Their process IDs are in the project-local `tmp/auth-processes.json`; their startup logs are in `tmp/auth-*.log`. To stop them, first inspect each recorded process ID's executable and command line, then stop only the matching BiletFlow process (Windows can reuse old IDs). Stop PostgreSQL with its `pg_ctl.exe -D <runtime-directory>/data stop`. The helper `tmp/setup_auth_postgres.py` can restart this local database while the downloaded runtime remains present. Standard ongoing startup is documented in the backend README.


## Final review fix checks — 9 November 2026

Application working tree after d34ca8e: uncertain image-finalization compensation,
cancellation reservation reconciliation batching, and indexed PNG alpha preservation.
Earlier full-suite/coverage evidence above remains evidence for its recorded revision;
no full current-tree suite or new coverage measurement was run in this fix wave.

Focused command (existing internal-env helper, isolated biletflow_daulet_issues_test,
fresh unique temporary storage roots):

```text
backend/.venv/Scripts/python.exe tmp/run_backend_tests.py -q tests/test_event_image_finalization.py tests/test_event_images.py tests/test_event_image_recovery.py tests/test_cancellation_finance_batch.py tests/test_finance.py tests/test_refunds.py tests/test_paid_orders.py tests/test_paid_activation.py --tb=short
```

Result: **78 passed in 308.07s**, with the existing Starlette TestClient/httpx deprecation
warning. New tests raise after a real successful finalization COMMIT and verify clean
metadata/gallery/GET bytes survive, including unavailable fresh verification. Separate
rollback and lost orphan-fence acknowledgment cases retain bytes until durable worker
recovery. Existing deferred rollback and late-writer/recovery guards pass. Real four-order
cancellation executes one event-wide cash aggregate with a pending reservation and none
without reservations, while full refund liabilities and reservation state reconcile; this
is a query-count resource regression, not a throughput benchmark (end-to-end checkout and
admission latency is measured in the 12 November 2026 load section). Actual API-uploaded PNGs
retain palette-index-zero and partial-alpha-table pixels after storage/content retrieval
and strip private text metadata. Existing orientation/single-frame checks pass. Finance
standalone refunds, immutable sent payouts, fee/activation adjustments, refund/send races,
paid-order and activation checks are included.

Ruff lint and format checks passed for the six changed/new Python files; git diff --check
passed. No migration, production rollout, process-kill, remote object-store or client
integration check was performed. Recurring cleanup still requires worker and restored
database/storage availability.
