# BiletFlow backend

FastAPI + PostgreSQL service for BiletFlow: the REST API under `/api/v1` and a background worker
that sends emails, renders ticket PDFs, processes simulated payments and fans out notifications.
The web and mobile clients both talk to this one backend.

---

## Contents

1. [Status](#status)
2. [Run it](#run-it)
3. [Code layout](#code-layout)
4. [API guides](#api-guides)
5. [Database and migrations](#database-and-migrations)
6. [Background worker](#background-worker)
7. [Authentication and sessions](#authentication-and-sessions)
8. [Google sign-in](#google-sign-in)
9. [Platform administrators](#platform-administrators)
10. [Tests and checks](#tests-and-checks)
11. [What is left to do](#what-is-left-to-do)

---

## Status

**Implemented and tested**

| Area | What works |
|---|---|
| Accounts | Email registration and verification, sign-in/out, password reset, Google sign-in, rotating refresh tokens, revocable sessions, rate limits |
| Organizers | Workspaces, team invitations, organization and per-event staff permissions |
| Events | Draft → publish/unpublish → cancel, duplicate, public/unlisted/private, registration and admission windows, capacity, refund policy, filtered history timeline, protected ordered PNG/JPEG gallery |
| Tickets | Free and paid ticket types, sales windows, per-order limits, hidden types, inventory protection under concurrency |
| Seating | Predefined venue layout, seat configuration, seat holds (10 minutes by default, platform setting), no double selling |
| Checkout | Free orders; simulated paid checkout with a processing fee from the platform settings (3% by default, fixed on the hold), retries, late/duplicate payment compensation refunds |
| Paid-sales activation | Simulated payout profile, identity check, terms, activation fee from the platform settings (KZT 5,000 by default, saved when activation starts) — per event |
| Tickets after purchase | Signed QR payload, stored PDF, email delivery with resend, recipient claim |
| Admission | Scanner event list, atomic one-time check-in, reversal, counts, manual search, verification preview, entry confirmation, offline package and sync, conflict review, organizer check-in history and CSV |
| Support | Cases from event/order/ticket, organizer → platform cases, threads, assignment, escalation, statuses, polling cursor and WebSocket; attachments with full PNG/JPEG/PDF structure checks, ClamAV malware scan and quarantine, and recovery of interrupted or never-linked uploads |
| Notifications | In-app inbox; localized account/staff/ticket/support mail and event/purchase/payment/refund/simulated-payout notices; moderation notices for user, event and paid-sales decisions (never carrying the admin's reason); kk/ru/en with English fallback |
| Campaigns | Promo codes, campaign links/QR, atomic allowance reservations/redemptions and retained attribution; campaign reports reconciled with the event analytics definitions |
| Refunds | Full simulated refunds, free cancellation, event cancellation, ticket invalidation and inventory quarantine until success |
| Reporting and finance | Scoped operational analytics/time series and their reconciled CSV export; optional GA4 collection, export and cached traffic reports (off by default); finance reconciliation, simulated payout reservations/results and immutable adjustment history |
| Calendar | `.ics` export with stable UID and cancellation, Google/Outlook/Office 365 links |
| Administration | Admin role, user/event/order/ticket search, read-only support/order/activation/campaign/offline-conflict inspection, exhausted job and failed delivery views with bounded audited retry, suspend/reinstate, event reports, moderation log, versioned settings applied to new holds, fees, activations and upload limits, CSV exports, paid-sales suspend/reinstate and payment/refund/failure monitoring |
| Files and operations | Private file storage (local directory, or S3-compatible SeaweedFS in Docker); correlation IDs on requests, audit rows and jobs, redacted JSON logs, admin-only operational metrics |

"Implemented and tested" means API-complete with backend tests on `main`. It does not mean the
web or mobile client uses it yet, or that the journey has been acceptance-tested; that is tracked
per area in the [integration status](../docs/integration/status.md).

The default values above (hold length, processing fee, activation fee, upload size, entry
confirmation, offline package lifetime, payout timing and the others) are confirmed product rules
in [decision 0003](../docs/decisions/0003-confirmed-decisions.md). An admin may change the four
platform settings within their ranges; a change applies only to new records.

**Backend scope still open** — see [What is left to do](#what-is-left-to-do).

---

## Run it

### With Docker (recommended)

Docker is controlled from the repository root:

```bash
cp .env.example .env
docker compose up --build -d db migrate storage storage-init api worker mailpit clamav
docker compose logs -f api worker
```

- Swagger: <http://localhost:8000/docs> (or <http://localhost:8080/docs> through Caddy)
- Emails: <http://localhost:8025>

| Service | Role |
|---|---|
| `db` | PostgreSQL 17 (`localhost:5433`) |
| `migrate` | One-off: migrations, runtime role and grants, seed (below) |
| `storage`, `storage-init` | SeaweedFS S3-compatible bucket and its one-off provisioning check (see [Private file storage](#private-file-storage)) |
| `api`, `worker` | This backend (`localhost:8000`) and its background worker |
| `mailpit` | Local SMTP sink and mail viewer |
| `clamav` | clamd for attachment malware scanning (`localhost:3310`) |
| `proxy` | Caddy in front of the API and the built web client (`localhost:8080`); not in the command above, a plain `docker compose up -d --build` starts it too |

The `migrate` service runs `python -m app.bootstrap` once per start: it applies migrations as
`biletflow_owner`, creates the restricted `biletflow_app` role used by the API, grants it access
to every table, and seeds the demo categories, venue and seat layout. The API never creates or
drops tables itself.

The `api` service runs `API_WORKERS` uvicorn worker processes (root `.env`, default 2, passed to
uvicorn as `WEB_CONCURRENCY`). The intent (#118) is that check-in is not limited to one process and
one connection pool while organizer analytics is running; the *Validation* workflow measures
whether admission p95 recovers. Each process has its own SQLAlchemy pool of up to 15 database
connections (5 plus 10 overflow), and so does the worker service: 2 API workers use at most 45 of
PostgreSQL's default 100 connections, and up to 5 stay below that limit. Rate limits, idempotency
keys, platform settings and support messages live in PostgreSQL, so every process sees the same
state; a support WebSocket connected to another process picks up a new message when it next polls
PostgreSQL (every 2 s). Request metrics at `GET /api/v1/admin/operations/metrics` are per
process (see [OPERATIONS_API.md](OPERATIONS_API.md)). The *Validation* workflow produces the
comparison: admission p95 with 20 analytics clients on one API process and on two.

After pulling new code, rebuild so new migrations run:

```bash
docker compose up --build -d migrate api worker
```

### Natively (faster reloads)

Requires Python 3.12+ and [`uv`](https://docs.astral.sh/uv/). Keep PostgreSQL, Mailpit and
ClamAV in Docker (object storage is not needed: files stay on local disk):

```bash
docker compose up -d db migrate mailpit clamav   # from the repository root
cd backend
cp .env.example .env                        # keep APP_DB_PASSWORD equal to the root .env
uv sync --frozen
uv run uvicorn app.main:create_app --factory --reload --port 8000
```

In a second terminal, from `backend/`:

```bash
uv run python -m app.worker
```

Natively, uploaded files and ticket PDFs are stored under `STORAGE_ROOT` (`var/storage`); see
[Private file storage](#private-file-storage) for the Docker stack's S3-compatible bucket.

Support attachments are scanned by ClamAV (`clamav` Compose service, clamd on
`localhost:3310`; its first start downloads signatures for a few minutes). While clamd is not
reachable, uploads are stored as `quarantined`, cannot be linked or downloaded, and the worker
retries their scan. To develop natively without ClamAV, set `MALWARE_SCANNER=disabled` in
`backend/.env`: uploads are then marked clean without a scan. Production refuses that setting.
See [SUPPORT_API.md](SUPPORT_API.md#attachments).

Ticket PDFs need no system font setup on Windows, macOS or Linux: DejaVu Sans 2.37 (regular and
bold, which cover Kazakh and Russian Cyrillic) is bundled in `app/fonts/` with its license and is
used from there first. If those files are removed and no system copy exists in a standard Linux
DejaVu directory, the API returns `503 ticket_pdf_unavailable` for a PDF it would have to render,
logs `ticket_pdf_font_unavailable`, and ticket emails go out without the attachment. It never
substitutes `?` for non-Latin characters. See [TICKET_PDF_API.md](TICKET_PDF_API.md#fonts).

### Useful settings (`.env`)

| Setting | Meaning |
|---|---|
| `ENVIRONMENT` | `development` enables the payment simulator endpoints; `production` enforces HTTPS URLs and secure cookies |
| `ADMISSION_REQUIRE_ENTRY_CONFIRMATION` | `true` requires the attendee's short-lived entry confirmation at the door. The mobile scanner supports it; set `false` only for quicker demos |
| `FRONTEND_URL` | Base URL used in emailed links |
| `ALLOWED_ORIGINS` | Browser origins allowed to call the API with cookies |
| `SMTP_HOST` / `SMTP_PORT` | Mailpit locally; any SMTP server otherwise |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional, enables Google sign-in |
| `GA4_ENABLED`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `GA4_PROPERTY_ID`, `GA4_CREDENTIALS_JSON`, `GA4_CACHE_SECONDS` | Optional GA4 export and traffic reports, off by default (`GA4_ENABLED=false`); credentials only from the environment; cached reports kept 900 s by default. See [ANALYTICS_API.md](ANALYTICS_API.md#ga4-traffic-and-funnel-integration-71) |
| `MALWARE_SCANNER` / `CLAMAV_HOST` / `CLAMAV_PORT` / `CLAMAV_TIMEOUT_SECONDS` | Attachment scanning: `clamav` (default; clamd at host:port, default `localhost:3310`, 15 s timeout) or `disabled` (local development only, refused in production) |
| `ATTACHMENT_MAX_BYTES` / `ATTACHMENT_MAX_PER_MESSAGE` / `ATTACHMENT_LINK_SECONDS` | Upload limits: deployment cap per file (5 MiB), files per support message (5), signed download link lifetime (300 s). The admin setting `upload_max_mb` can lower the size limit for attachments and event images but never raise it above the cap |
| `STORAGE_BACKEND` | `local` (default; files under `STORAGE_ROOT`) or `s3`, which also needs `S3_ENDPOINT_URL`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; see [Private file storage](#private-file-storage) |
| `ENTRY_CONFIRMATION_SECONDS` / `OFFLINE_PACKAGE_MINUTES` | Entry confirmation lifetime (120 s, range 30–600) and offline package lifetime (720 min, range 5–2880) |

Logs and metrics need no setting: the API and worker always write redacted JSON lines to stderr,
and `GET /api/v1/admin/operations/metrics` is open to platform admins only; see
[OPERATIONS_API.md](OPERATIONS_API.md).

### Private file storage

Event images, stored ticket PDFs and support attachments go through `app/storage.py`. Nothing is
ever served from storage directly: the API checks access and streams the bytes, or hands out a
short-lived signed link. The API and the worker must use the same storage.

- **Natively and in tests** (`STORAGE_BACKEND=local`): files below `STORAGE_ROOT`.
- **Docker Compose** (`STORAGE_BACKEND=s3`, set by `docker-compose.yml`): the `storage` service
  is SeaweedFS (`weed server -s3`, S3 API on port 8333 inside the stack, nothing published on the
  host), with its data in the `object_storage` volume. Its two static S3 identities are written
  from `.env` when it starts: the storage administrator (`STORAGE_ADMIN_ACCESS_KEY_ID`/
  `STORAGE_ADMIN_SECRET_ACCESS_KEY`) and the app account (`S3_ACCESS_KEY_ID`), which may only
  read, write (including delete) and list objects in `S3_BUCKET`. Unsigned requests are refused.
  The one-off `storage-init` service (`python -m app.storage_provision`) creates the bucket with
  the administrator, then proves that the app account can write, read, list and delete there,
  cannot create buckets, and that the bucket refuses anonymous requests; any failure stops the
  start. It runs on every `docker compose up` (it is idempotent), and `api` and `worker` start
  only after it succeeded, which in turn waits for a healthy `storage`. `api` and `worker` share
  the bucket and the app account and never receive the administrator credential. (MinIO was used
  first but its images were withdrawn in 2026; see the [operations notes](../docs/operations/backup.md#why-seaweedfs).)

`S3FileStorage` talks to any S3-compatible service with path-style URLs and AWS Signature
Version 4 (implemented with `httpx`, no AWS SDK). To use another service, set
`S3_ENDPOINT_URL` (`http://` or `https://`), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY`; the API refuses to start when one is missing. Keep the credentials in
`.env` (never committed; `.env.example` holds local placeholders only) and replace them before any
shared deployment. If the store is unavailable, image and attachment uploads and downloads answer
`503 storage_unavailable` and work again once it is back; ticket PDFs are rendered on request
instead. Backups include the bucket ([backup and restore](../docs/operations/backup.md)).

---

## Code layout

Everything lives in `app/`, one module group per area:

| Files | Responsibility |
|---|---|
| `main.py` | App factory, router registration, error handling, security headers |
| `observability.py`, `operations_*.py` | Correlation IDs, redacted JSON logs, request metrics; protected operational metrics |
| `config.py`, `db.py`, `security.py`, `service.py`, `idempotency.py`, `signing.py`, `storage.py`, `storage_backup.py`, `storage_provision.py` | Settings, sessions, tokens/hashing, shared guards, idempotency keys, signing keys, file storage (local or S3-compatible), its backup/restore and the Docker object-store provisioning check |
| `*_models.py`, `models.py`, `all_models.py` | SQLAlchemy table mappings (must match the migrations) |
| `*_schemas.py` | Request/response models |
| `*_service.py` | Business rules and transactions |
| `platform_settings.py`, `pricing.py` | Platform settings in force for new holds, quotes, activations and uploads; fee and price arithmetic |
| `file_content.py`, `malware_scanner.py`, `attachment_service.py` | PNG/JPEG/PDF structure checks, ClamAV client, attachment quarantine and recovery |
| `admin_inspection.py`, `admin_commerce.py`, `admin_jobs.py` | Admin search and read-only detail, payment/refund monitoring, job and delivery retry |
| `ga4_client.py` | GA4 Measurement Protocol and Data API calls (used only when GA4 is enabled) |
| `*_api.py` | HTTP routes: `organization`, `event`, `checkout`, `paid_checkout`, `activation`, `campaign`, `refund`, `ticket_document`, `admission`, `admission_history`, `offline`, `support`, `notification`, `calendar`, `analytics`, `ga4`, `finance`, `settings`, `operations`, `admin`, `admin_jobs` |
| `worker.py` | Background job loop |
| `bootstrap.py`, `seed.py`, `admin_cli.py` | Migrations + role setup, demo seed, admin grant CLI |

New routes follow the same pattern: schemas → service (transaction, permission check, audit and
outbox rows in the same commit) → API module registered in `main.py` → contract in a
`*_API.md` guide.

---

## API guides

Each guide is the contract for its area: endpoints, request/response shapes, error codes and
remaining scope.

| Guide | Covers |
|---|---|
| [CATALOG_API.md](CATALOG_API.md) | Organizations, staff, events, ticket types, venues and seating |
| [CHECKOUT_API.md](CHECKOUT_API.md) | Holds, free orders, ticket claims, QR payload, attendee list |
| [PAID_SALES_API.md](PAID_SALES_API.md) | Simulated paid-sales activation |
| [PAID_CHECKOUT_API.md](PAID_CHECKOUT_API.md) | Simulated paid checkout, payment attempts, compensation refunds |
| [CAMPAIGNS_API.md](CAMPAIGNS_API.md) | Campaigns, promo reservations/redemptions, campaign link/QR and reporting reconciled with analytics |
| [REFUNDS_API.md](REFUNDS_API.md) | Full refunds, retry, free cancellation and event cancellation |
| [ANALYTICS_API.md](ANALYTICS_API.md) | Operational inventory/revenue/attendance reports, sales series, CSV export and optional GA4 traffic |
| [FINANCE_API.md](FINANCE_API.md) | Finance summary, simulated payouts and retained adjustments |
| [TICKET_PDF_API.md](TICKET_PDF_API.md) | Ticket PDF, delivery status and resend |
| [ADMISSION_API.md](ADMISSION_API.md) | Scanner, check-in, entry confirmation, offline sync, check-in history |
| [SUPPORT_API.md](SUPPORT_API.md) | Support cases, messages, attachments (validation, malware quarantine, upload recovery), WebSocket |
| [NOTIFICATIONS_CALENDAR_API.md](NOTIFICATIONS_CALENDAR_API.md) | In-app notifications, email notices including moderation notices, and calendar export |
| [ADMIN_API.md](ADMIN_API.md) | Platform administration: search and detail, jobs and deliveries with bounded retry, suspension, reports, platform settings and where they apply, CSV exports, paid-sales and payment/refund monitoring |
| [OPERATIONS_API.md](OPERATIONS_API.md) | Correlation IDs, structured log events and redaction, operational metrics |

Errors always have the shape `{"detail": {"code": "..."}}`; clients map the code to a message.

---

## Database and migrations

- Migrations live in `migrations/versions/` as `NNNN_name.py`, usually with a hand-written `NNNN_name.sql` (0016 to 0019 and 0021 use inline SQL).
  There are **21 migrations and 69 tables** in the `biletflow` schema:
  `0001_identity` → `0002_event_setup` → `0003_checkout` → `0004_admission` →
  `0005_notifications_calendar` → `0006_admin_moderation` → `0007_entry_offline` →
  `0008_support` → `0009_files_admission` → `0010_commerce` → `0011_paid_activation` →
  `0012_paid_orders` → `0013_campaigns` → `0014_finance` → `0015_event_images` →
  `0016_image_cleanup` → `0017_ticket_pdf_cleanup` (index only) → `0018_attachment_cleanup`
  (support upload cleanup index and schedule for unlinked uploads, #76) → `0019_admin_retry`
  (retry counters on `outbox_job` and `notification_delivery`) → `0020_ga4_analytics`
  (adds `ga4_connection`, `analytics_export`, `ga4_cache`) → `0021_job_correlation` (nullable
  `outbox_job.correlation_id`, no table).
  The test suite applies the whole chain to an empty `_test` database (`alembic upgrade head` in
  `tests/conftest.py`), so the CI run on `ad5b53c` (18 November 2026) upgraded through `0021`
  cleanly. The 69-table count is read from the migration files; a direct count on a migrated
  database was last recorded for `0017` (66 tables, 13 November 2026). Check each deployment
  independently. The count excludes `public.alembic_version`.
- **Never edit an applied migration.** Add the next number, mirror the tables in a
  `*_models.py` file, and import that module in `app/all_models.py` and `migrations/env.py`.
- Historical migrations intentionally reject downgrade. New `0014`–`0017` provide scoped
  downgrades tested up/down/up on a disposable database; finance/gallery rollback loses their
  new history/links. `0018`–`0021` also have scoped downgrades that have not been exercised
  up/down/up yet: `0018` drops only its index, `0019` its two retry counters, `0020` its three
  GA4/export tables with their rows, `0021` the correlation column. Back up valuable data before
  any rollback.
- Audit, moderation and support history rows are protected by database triggers and cannot be
  edited or deleted. The runtime role has no `DELETE` and no `UPDATE` on `audit_log`.
- `docs/database/` holds a 66-table **reference design**. Its table set differs from the implemented
  schema (claim table versus authentication extensions; the GA4 tables are migrated in `0020`); see the
  [design/implementation matrix](../docs/database/README.md#how-the-design-relates-to-the-implementation). It is a target — never run its DDL against this database.

---

## Background worker

`python -m app.worker` claims durable jobs from the `outbox_job` table (`FOR UPDATE SKIP LOCKED`),
retries with back-off and marks a job `dead` after 5 attempts. It handles:

- emails: verification/reset, staff invitations, ticket delivery (with PDF), support updates;
- malware scan retries for quarantined support attachments (`attachment_scan` jobs, back-off up
  to one minute, until a verdict or the end of the one-hour link window);
- notification fan-out (in-app + email);
- simulated payment initialization, provider events and refund dispatch;
- releasing expired holds, reconciling orphan event images, abandoned ticket PDF writes and
  interrupted or abandoned support uploads, and exporting consented GA4 measurements when GA4 is
  enabled, every 15 seconds.

Image recovery claims at most 50 due files per pass, with a one-hour pending-upload grace and
five-minute retry delay. Pending/deleted tombstones are retained and revisited to catch late
writes; eventual deletion requires the worker and storage/database availability. See
[the gallery contract](CATALOG_API.md). Ticket PDF recovery uses the same limits for unreferenced
pending write intents, then one final late-write check 24 hours after the intent; a clean or
referenced PDF is never deleted (see [TICKET_PDF_API.md](TICKET_PDF_API.md#stored-pdf-lifecycle-and-recovery)).
Support upload recovery uses the same batch, retry and late-write limits for unreferenced upload
intents and for uploads never linked within their one-hour link window; a file linked to a message
is never deleted (see [SUPPORT_API.md](SUPPORT_API.md#attachments)). Email templates support kk/ru/en with English fallback;
user-authored content is preserved.

Business results never wait for email or notifications; those are retried independently. A
platform admin can send a `dead` job or a `failed` email delivery back to the worker at most
three times each, after the business target is rechecked; every retry is audited (see
[ADMIN_API.md](ADMIN_API.md#background-work-and-deliveries)).

A failed pass, retry or dead-lettered job is logged as a structured, redacted JSON line
(`worker.task_failed`, `job.retry_scheduled`, `job.dead`) under the correlation ID of the request
that queued the job; backlog, retry and dead counts are in the protected metrics view. See
[OPERATIONS_API.md](OPERATIONS_API.md).

---

## Authentication and sessions

- **Access tokens**: HS256 JWTs valid for up to 10 minutes; not stored. Every request also checks
  the session in PostgreSQL, so logout, password reset and suspension apply immediately.
- **Refresh tokens**: random opaque secrets; only SHA-256 digests are stored. Each refresh rotates
  the token; reusing an old one revokes the session. Sessions expire after 30 days.
- **Web clients** get the refresh token as an HttpOnly, SameSite=Strict cookie scoped to
  `/api/v1/auth`; call `/auth/refresh` with `credentials: "include"` from an allowed origin and
  keep the access token in memory.
- **Scanner clients** (`client_kind: "scanner"`) get the refresh token in the JSON body and must
  keep it in the device's secure storage.
- Passwords are hashed with Argon2id. Registration requires 12–128 characters. Verification links
  last 24 hours, password-reset links 30 minutes; a reset revokes every session.

Try it in Swagger: `POST /auth/register` → open the email in Mailpit and send the `#token=` value
to `POST /auth/verify-email` → `POST /auth/login` → paste `access_token` into **Authorize**.

---

## Google sign-in

Optional. Create a *Web application* OAuth client in Google Cloud and set:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8080/api/v1/auth/google/callback
```

Register exactly that redirect URI and restart the API. Use `localhost` consistently (not
`127.0.0.1`). The flow uses PKCE, a one-use state, a nonce and a browser-binding cookie.
Accounts are matched by Google's stable `sub`, never by email alone; an existing password account
links Google explicitly via `POST /auth/google/link`. Without credentials, Google endpoints
return `503 google_not_configured`.

---

## Platform administrators

Admins can only be granted from the command line:

```bash
docker compose exec api python -m app.admin_cli grant someone@example.com   # Docker
uv run python -m app.admin_cli grant someone@example.com                     # native, from backend/
```

---

## Demo data

`app/seed.py` has two parts:

- **Catalog** (always, also in production): the two categories, *BiletFlow Demo Hall* and its
  12-seat layout (row A premium, row B standard). Insert-only.
- **Lifecycle demo fixtures** (development and test only): fictional accounts, one organization
  and six events covering every example listed in section 6.2 of the
  [requirements](../docs/BiletFlow_Backend_Requirements.md). They are built through the public
  API in-process (payments and refunds through the simulator), so inventory, orders, campaign
  usage, finance, audit and outbox rows follow the same rules as real traffic. All dates are
  relative to the moment of the build.

`python -m app.bootstrap` builds the fixtures only when they are absent, so restarting the stack
keeps whatever was done with them. Commands (run as the database **owner**, because a reset
deletes rows and lifts the append-only guards for one transaction):

```bash
# Docker, from the repository root (the migrate service has the owner connection)
docker compose run --rm migrate python -m app.seed                                   # add if absent
docker compose run --rm migrate python -m app.seed --reset --yes-reset-demo          # rebuild, fresh dates
docker compose run --rm migrate python -m app.seed --reset --yes-reset-demo --empty  # remove only

# Native, from backend/: point DATABASE_URL at the owner role for this one command
DATABASE_URL=postgresql+psycopg://biletflow_owner:<POSTGRES_PASSWORD>@localhost:5433/biletflow \
  uv run python -m app.seed --reset --yes-reset-demo
```

Reset safety:

- It refuses without `--yes-reset-demo` and always refuses when `ENVIRONMENT=production`; plain
  seeding never deletes anything and skips the fixtures in production.
- The demo scope is every organization owned by a demo account plus every row that references
  it through a foreign key (events, orders, tickets, payments, refunds, campaigns, check-ins,
  support cases, audit and outbox rows), found from the live database constraints. Nothing else
  is changed. The demo accounts are kept, and so is anything they did in other organizations.
- Anything a person adds inside the demo organization (for example an extra event) is part of
  the scope and is removed by a reset. Stored PDF files of removed tickets stay on disk.

Accounts (password `BiletFlow-demo-2026` for all, fictional, development only):

| Email | Role |
|---|---|
| `demo-organizer@example.com` | Owner of *BiletFlow Demo Productions* |
| `demo-scanner@example.com` | Member with `scan` and `reverse_checkin` on the concert and the meetup |
| `demo-attendee@example.com` | Attendee with most orders; invited to the private event |
| `demo-guest@example.com` | Second attendee |
| `demo-admin@example.com` | Platform admin |

Events and what they demonstrate (prices in KZT):

| Event | Demonstrates |
|---|---|
| Demo Concert (+30 days) | Mixed free *Community pass* / *Standard* 10,000 / *Premium* 30,000; `DEMO10` (10%, 100 uses), `DEMO1000` (1,000 off, 50 uses) and `DEMOLAST` (one use, exhausted); confirmed discounted, mixed and free orders; one refunded and one refund-pending order; an unpaid checkout whose hold expired |
| Demo Theatre: Sold Out (+14 days) | Capacity 4, *Theatre seat* 2,500, every unit sold |
| Demo Seated Gala (+21 days) | Assigned seating: premium 30,000 / standard 3,000; seats A3, A4 and B1 sold |
| Demo Meetup (live now) | Free event in progress, admission open: one ticket checked in, one not yet |
| Demo Private Workshop (+10 days) | Private event, hidden from the catalog, attendee has access and a ticket |
| Demo Festival (cancelled, +45 days) | Event cancelled after a free registration; ticket and order cancelled |

The three paid events each paid the KZT 5,000 simulated activation fee. The live meetup ends a
few hours after the build; rebuild to get fresh dates. The identifiers of the current build are
in the `demo.fixtures_built` audit row of the demo organization (`app.seed.demo_fixtures()`).

---

## Tests and checks

Tests run against a **real, empty PostgreSQL database whose name ends in `_test`** — the suite
refuses any other name and truncates every table. Never point it at valuable data.

```bash
export TEST_DATABASE_URL=postgresql+psycopg://user:password@127.0.0.1:5433/biletflow_test
uv sync --frozen
uv run pytest -q --cov=app --cov-report=term-missing
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations
```

The suite has **623 test functions** in 59 files under `tests/` (parametrized cases make the
collected count higher). On `main` at `ad5b53c` (after PRs #102 and #104), the hosted *Backend API*
workflow ran the full PostgreSQL suite with **863 passed, 0 failed, 11 skipped** and **96%
statement coverage**; Ruff lint and format checks passed. The 11 skips are the opt-in harnesses
below (10 process-kill cases and 1 load test). That CI run is not yet recorded in
[VALIDATION.md](VALIDATION.md), which holds the earlier executed commands, exact coverage and
limitations (last full local run: 13 November 2026, 545 passed, 0 failed, 10 skipped).
Tests cover PostgreSQL concurrency and permission isolation across implemented areas.

Workflows in `../.github/workflows/`:

| Workflow | What it runs |
|---|---|
| `backend-auth.yml` (*Backend API*) | Ruff lint and format, full pytest suite with coverage against a PostgreSQL 17 service; every push and pull request |
| `smoke.yml` (*Smoke*) | Whole Docker stack, then the two smoke scripts below; when backend, web, proxy, Compose or smoke files change |
| `backup.yml` (*Backup*) | Backup and restore drill of the database and object storage ([backup and restore](../docs/operations/backup.md)) |
| `validation.yml` (*Validation*) | Full pytest suite with the crash and load harnesses enabled, then three direct load-harness runs (5 and 20 analytics clients on one API process, 20 on two) with their reports in the job summary and as an artifact; started by hand, or on pull requests that touch `tests/crash`, `tests/load` or the workflow |

*Smoke* and *Backup* succeed on `main` again (*Smoke* on `8d31ee4`, *Backup* on `d958dfb`, 23-24
November); the runs cancelled on `cb5a9bd` (PR #104 merged) are superseded. The full rerun after
#102 and #104, including *Validation*, is recorded in [VALIDATION.md](VALIDATION.md) (#117).

Two harnesses are opt-in and skipped unless their variable is set. Both need a disposable
PostgreSQL database ending in `_test`:

```bash
# Process-kill crash recovery (POSIX only), see VALIDATION.md
RUN_CRASH_TESTS=1 uv run pytest -q tests/crash

# Checkout and admission load with concurrent analytics: starts its own API, worker and SMTP sink;
# LOAD_DATABASE_URL defaults to TEST_DATABASE_URL, LOAD_RUNS sets runs per scenario (default 1)
RUN_LOAD_TESTS=1 uv run pytest -q tests/load -s

# The same load harness directly, with a report written to --output-dir
LOAD_DATABASE_URL=postgresql+psycopg://user@127.0.0.1:5432/biletflow_load_test \
  uv run python -m tests.load.load_harness --runs 3 --output-dir /tmp/biletflow-load
```

The *Validation* workflow runs both harnesses in CI on one revision (Actions, *Validation*, Run
workflow, or a pull request that touches `tests/crash`, `tests/load` or the workflow file).

See [VALIDATION.md](VALIDATION.md#worker-crash-recovery-harness--12-november-2026) for the crash
harness. The last load results (#80, before #102 and #104) are in the
[integration status](../docs/integration/status.md).

End-to-end smoke tests against a running Docker stack live in `../tools/`:

```bash
uv run python ../tools/smoke_admission.py
uv run python ../tools/smoke_paid_checkout.py
```

---

## What is left to do

The agreed scope includes all required and bonus features; see the shared
[requirements and acceptance matrix](../docs/BiletFlow_Backend_Requirements.md).
Backend endpoints alone do not complete the integrated product.

Everything from the audit in #85 is merged. PRs #87–#95 fixed the defects #65, #68 and #69 and
added demo fixtures (#79), measured load (#80) and process-kill recovery (#83). PRs #102 and #104
added campaign report reconciliation (#67), platform settings for holds, fees, activation and
uploads (#70), GA4 (#71), admin search and detail (#72), admin jobs and deliveries (#73),
moderation notices (#74), upload validation and quarantine (#75), upload recovery (#76),
S3-compatible storage (#77), observability (#78) and the analytics CSV export (#81). Live GA4
collection and reporting still need a GA4 property and credentials.

Open backend work, tracked in #125 (see also the
[integration status](../docs/integration/status.md)):

1. Keep check-in fast while analytics runs: admission p95 rose from 312 ms to 743 ms with 20
   analytics clients on one API process (#118). The setup is described under "With Docker" above.
   The CI comparison (24 November, [VALIDATION.md](VALIDATION.md)) showed no gain from a second
   process on the CI runner; a measurement on the demo host is still needed.
2. Example requests, responses and every error code for the routes added in #104, in
   `ADMIN_API.md`, `OPERATIONS_API.md`, `SUPPORT_API.md` and `ANALYTICS_API.md` (#119).
3. Compare the web and mobile API types with the backend schemas for analytics, finance,
   campaigns, refunds and admin, and list every mismatch (#122).

Also outside the backend code: web and mobile screens for the newest contracts, browser
end-to-end tests and the acceptance walkthrough (#120, #121), HTTPS and security headers for the
shared demo (#49), and the provider sandbox once merchant access exists (no live financial
operation). Refunds are full-order only by design; partial refunds are excluded by the
requirements.

Promo campaigns, operational analytics, refunds/cancellations, simulated finance/payouts,
organizer ticket-type counters, event history filters, event images with bounded recurring cleanup,
admin commerce monitoring, and backend email/category localization are implemented. See their
API guides for exact bounds, permissions, defaults and remaining scope. Public ticket-type responses
exclude organizer counters. `sold` includes refund quarantine; `refunded` is historical;
`checked_in` is current eligible unreversed attendance. These counts must not be added as disjoint
historical totals. Payout eligibility and sending only after the event ends is a confirmed product
rule ([decision 0003](../docs/decisions/0003-confirmed-decisions.md)).
