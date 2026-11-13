# Backend validation

## Bundled Unicode font for ticket PDFs — 13 November 2026

Issue #82 (BF-10; Kazakh/Russian locale baseline). DejaVu Sans 2.37 regular and bold are now
bundled in `app/fonts/` with the upstream license and searched before the Linux system
directories; with no usable font the PDF is refused (`503 ticket_pdf_unavailable`, logged
`ticket_pdf_font_unavailable`) instead of printing `?` for Cyrillic text. This resolves the known
failure recorded in the earlier entries below.

Environment: macOS 15.7.4 with **no DejaVu font installed** (no `/usr/share/fonts`, none in
`~/Library/Fonts` or `/Library/Fonts`), Python 3.12.15, local PostgreSQL 16.15, disposable
`biletflow_pdffont_test`.

| Check | Result |
|---|---|
| `uv run pytest -q tests/test_ticket_documents.py tests/test_ticket_files.py` | **25 passed** in 16.60 s, including `test_pdf_keeps_unicode_attendee_names` (previously failing on Windows and this machine) |
| Full suite `uv run pytest -q` | **555 collected: 545 passed, 0 failed, 10 skipped** in 309.79 s. Skips are the opt-in process-kill (9, `RUN_CRASH_TESTS`) and load (1, `RUN_LOAD_TESTS`) harnesses. One existing Starlette/httpx TestClient deprecation warning |
| `uv run ruff check app tests migrations`; `uv run ruff format --check app tests migrations` | Passed; 140 files already formatted |
| Glyph coverage | Both bundled faces map ә ғ қ ң ө ұ ү һ і in both cases and the full Russian alphabet (`reportlab` `charToGlyph`, also asserted in a test) |
| Visual check | A ticket with a Kazakh title, venue, seat, Russian ticket type and Kazakh attendee name, rendered to PNG with macOS `sips`, shows every letter correctly |

New regression cases:

- `test_pdf_keeps_kazakh_and_russian_event_and_attendee_text`: all nine Kazakh-specific letters in
  the event title (lowercase) and attendee name (uppercase), plus a Russian ticket type, are
  extracted unchanged; the text has no `?`; the page uses only embedded DejaVu fonts (no
  Helvetica resource).
- `test_pdf_refused_with_stable_code_when_no_unicode_font`: with the font lookup pointed at an
  empty directory, `GET /tickets/{id}/pdf` returns `503 {"detail": {"code":
  "ticket_pdf_unavailable"}}` with no PDF body and logs `ticket_pdf_font_unavailable`; after the
  font is restored the same request returns the PDF (the failure is not cached).
- `test_bundled_font_is_used_without_system_fonts`: the bundled directory alone loads, ships its
  `LICENSE`, and covers the Kazakh letters.
- `test_missing_font_sends_the_email_without_attachment_and_stores_nothing`
  (`test_ticket_files.py`): the worker still delivers the ticket email, without an attachment, and
  writes no `stored_file` row.

Not verified here: a Windows run (the code path is OS-independent and no longer reads a system
font, but no Windows machine was used) and a Docker image build (the Docker daemon was not
running). The Dockerfile still installs `fonts-dejavu-core`, now only a fallback.
## Campaign revalidation at paid fulfilment — 13 November 2026

Issue #66 (BF-09, AC-09/10). `tests/test_campaign_fulfillment.py` quotes a 10% discounted paid
order (one reserved redemption out of `max_redemptions = 1`), changes the campaign while the
payment is pending, then reports a successful charge for exactly the quoted amount through the
simulator.

| Change between quote and payment success | Result checked |
|---|---|
| None | Order confirmed at the quoted price, tickets issued, one redemption, campaign report matches |
| Campaign name, code, later end date (window still contains now), higher limit | Same as unchanged: not material |
| Time passed `ends_at`; end date edited into the past; start date moved into the future; campaign disabled | No ticket, order `pending` with unchanged quote and intent amount, reservation `released`, no redemption, one `blocked_fulfillment` refund of the captured amount, retry `409 promo_requote_required` |
| Percentage raised or lowered; switched to a fixed amount; eligible types narrowed to another type or widened to all | Same as above: never issued at the old price or re-priced |
| Expired campaign, finance | While the refund is pending: `collected` = charge, `pending_refunds` = charge, no gross/discount/fulfilled amounts, estimated payout unchanged, campaign report shows no redemption. After the refund succeeds: `refunds` = charge, fees 0, balance back to its pre-order value |
| Lowered discount, then a new hold with the same code | Allowance is available again and the new hold shows the new, higher price before any payment |

Commands (from `backend/`, PostgreSQL 16, disposable database):

```bash
createdb -h 127.0.0.1 biletflow_campaignfx_test
export TEST_DATABASE_URL=postgresql+psycopg://$USER@127.0.0.1:5432/biletflow_campaignfx_test
uv run pytest -q tests/test_campaign_fulfillment.py
uv run pytest -q tests/test_campaign_fulfillment.py tests/test_campaigns.py tests/test_paid_orders.py tests/test_promo_checkout.py
uv run pytest -q
uv run ruff check app tests migrations && uv run ruff format --check app tests migrations
```

Results: new file **13 passed**; with the related campaign, promo-checkout and paid-order
files **62 passed**. Against the previous `still_enabled` check, 10 of the 13 new tests fail
(every case except disabled, unchanged and non-material edits), which is the gap this issue
describes. Full suite: **553 passed, 10 skipped, 1 failed** in 321 s; the failure is the
known, unrelated `tests/test_ticket_documents.py::test_pdf_keeps_unicode_attendee_names`
(PDF font on this machine, tracked in #82). The skips are the opt-in crash and load tests. Ruff lint and format checks passed. No migration: the reservation's
saved `discount_snapshot` already holds the discount and eligibility to compare, and the
validity window is read from the campaign at fulfilment.

## Worker crash recovery harness — 12 November 2026

Issue #83 (AC-26; BF-08, BF-15, BF-22). Earlier entries below replay interruption *states*;
this harness kills real processes. `tests/crash/crash_runner.py` runs the real worker loop
(`app.worker.main`) or the real API (uvicorn + `create_app`) as a child process. A kill point
wraps one real function at a side-effect boundary; when reached, the child writes a marker
file and calls `os._exit(137)` (no `finally`, no rollback beyond PostgreSQL dropping the
connection), or stops itself with `SIGSTOP`. The parent then starts a fresh process and checks
PostgreSQL, the private storage directory and a local SMTP sink written in the test
(`tests/crash/crash_harness.py`; nothing is relayed). Production code is unchanged.

| Scenario (kill point) | What it proves |
|---|---|
| API killed after the provider notification is committed to the inbox, before it is applied (`api_after_inbox_commit`) | The restarted worker applies the inbox row; the order is confirmed with 2 tickets. Replaying the same `external_event_id` to a restarted API returns the same inbox row; a late extra success changes nothing |
| API killed after fulfilment commits, before the HTTP response (`api_after_apply_commit`) | Tickets survive the crash; provider retry and a late duplicate success create no ticket, order, refund, outbox job, notification or audit row |
| Worker killed inside `refund_dispatch` after flushing, before COMMIT (`job_before_commit`) | PostgreSQL discards the half-written refund attempt; the restarted worker creates exactly one |
| API killed after a refund success commits, before the response (`api_after_apply_commit`) | Replay, a late success and a stale `failed` keep one refund, one refund attempt, one `payments.refund_succeeded` audit row, refunded tickets, one `refund_completed` notification and one email; finance rows unchanged |
| Worker killed after the notification fan-out commits, before the job is acknowledged (`fanout_after_commit`) | The restarted worker finishes all other work but does **not** take the unexpired lease; after lease expiry the retry deduplicates to one notification and one email |
| Worker killed after the ticket PDF is written to storage, before its `stored_file` row commits (`pdf_after_put`) | Retry stores and references a new object whose bytes match the checksum and the email attachment; no referenced file is missing. The killed run's object is left orphaned (see findings) |
| Worker killed after the PDF row commits, before SMTP (`pdf_after_commit`) | Retry reuses the same row, key, bytes and inode (no re-render); one email with that attachment |
| Worker killed after SMTP accepted the message, before acknowledgement (`smtp_after_send`, outbox ticket email and notification email) | **The same Message-ID is delivered twice** (at-least-once email). Business results stay single: one ticket, one stored PDF, one notification; the job/delivery ends `done`/`sent` with `attempt_count` 2 |
| Worker A frozen (`SIGSTOP`) before SMTP; its lease expires and worker B completes the job; A resumes (`smtp_before_send` + stop) | A's stale send is a second delivery of the same Message-ID, but its acknowledgement is fenced: B's `done` state, `completed_at` and attempt count are unchanged |

Every scenario also asserts no duplicate ticket per order item, order per hold, refund per
captured charge, finance effect per refund, notification per deduplication key, and no `dead`
job. Lease expiry is simulated by moving `outbox_job.lease_until` (or a pending
`notification_delivery.next_attempt_at`) one second into the past instead of waiting the
120-second lease; the lease check itself is the production query.

Commands (from `backend/`; the database name must end in `_test` and is truncated):

```bash
createdb -h /tmp biletflow_crash_test
export TEST_DATABASE_URL=postgresql+psycopg://$USER@127.0.0.1:5432/biletflow_crash_test
RUN_CRASH_TESTS=1 uv run pytest -q tests/crash          # opt-in; skipped without the variable
RUN_CRASH_TESTS=1 uv run pytest -v --durations=0 tests/crash
```

Evidence observed on 12 November 2026, base revision `7dd19e0`, macOS 15.7, Python 3.12.15,
local PostgreSQL 16.15, disposable `biletflow_crash_test`:

- `RUN_CRASH_TESTS=1 uv run pytest -q tests/crash`: **9 passed in 26.43 s** (earlier repeated
  runs: 25.51–25.92 s, all 9 passed). Without `RUN_CRASH_TESTS`: 9 skipped.
- `uv run pytest -q tests/test_worker.py tests/test_auth.py`: 34 passed.
- Full suite with the harness enabled (`RUN_CRASH_TESTS=1 uv run pytest -q`): **540 collected,
  539 passed, 1 failed** in 276.04 s. The failure is the existing
  `test_pdf_keeps_unicode_attendee_names` case: no DejaVu font is installed on this macOS machine
  (the same font gap recorded for Windows below). The suite is not fully green. Resolved on
  13 November 2026 (#82, see the top entry).
- Sensitivity check on a scratch copy of the backend (not committed): removing the worker's
  acknowledgement fence failed the stalled-worker test; ignoring an already stored ticket PDF
  failed the `pdf_after_commit` test. The unmodified tree passes both.
- `uv run ruff check app tests migrations` passed; `ruff format --check` reported 137 files
  already formatted.

Cleanup (each test uses pytest temporary directories for storage, process logs and markers;
every child, including a stopped one, is SIGKILLed at teardown):

```bash
dropdb -h /tmp biletflow_crash_test
pgrep -fl crash_runner.py     # should print nothing; otherwise: pkill -9 -f crash_runner.py
```

Findings, owner `@backend` (not fixed here; no test is weakened):

- A crash between `storage.put` and the `stored_file` commit in `ensure_ticket_pdf` leaves an
  unreferenced object under `tickets/<ticket_id>/` permanently; nothing is lost, but no sweeper
  removes it (event images have `reconcile_images`; ticket PDFs do not). A fix would record a
  pending row before the write or sweep row-less ticket keys.
- Email is at-least-once by design: a crash or stall after SMTP acceptance resends the same
  Message-ID. Clients may or may not collapse it; Mailpit and this sink show two messages.
- `dispatch_refund_once` generates `provider_request_key` inside the dispatch transaction. With
  the in-transaction simulator this is safe (proved above), but a real provider call made before
  that commit would retry with a new key after a crash, so the provider could not deduplicate it.
  A real adapter needs the key persisted before the external call. *Resolved 13 November 2026
  (#65): the key is derived from the refund id and attempt number, so a retried dispatch sends
  the same key.*
- An in-flight email job or delivery is retried only after its 120-second lease, so recovery of
  that one message is delayed by up to two minutes after a crash.

Limitations: local processes, not containers, so the Compose restart policy and health checks are
not exercised; kills are injected at chosen code boundaries with `os._exit`, not a host power
loss or a kill in the middle of a storage write (`LocalFileStorage.put` is an atomic rename and
was not interrupted); lease expiry is simulated in the database; the payment and refund provider
is the in-process simulator, so no real external financial side effect exists; POSIX only (the
harness is skipped on Windows); no remote object storage, real SMTP provider or load.

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
| Known failure / warning | `tests/test_ticket_documents.py::test_pdf_keeps_unicode_attendee_names`: required DejaVu font missing on Windows, reproduced in the pre-change baseline (resolved 13 November 2026 by the bundled font, #82). One existing Starlette/httpx TestClient deprecation warning. The suite is **not fully green** |
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
