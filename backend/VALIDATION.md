# Backend validation

## Backend issues #38–44 — 9 November 2026

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
backup/restore, actual process-kill recovery or declared latency/load targets. Existing Windows
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
is a query-count resource regression, not a throughput benchmark. Actual API-uploaded PNGs
retain palette-index-zero and partial-alpha-table pixels after storage/content retrieval
and strip private text metadata. Existing orientation/single-frame checks pass. Finance
standalone refunds, immutable sent payouts, fee/activation adjustments, refund/send races,
paid-order and activation checks are included.

Ruff lint and format checks passed for the six changed/new Python files; git diff --check
passed. No migration, production rollout, process-kill, remote object-store or client
integration check was performed. Recurring cleanup still requires worker and restored
database/storage availability.
