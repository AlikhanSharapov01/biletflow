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
| Seating | Predefined venue layout, seat configuration, ten-minute seat holds, no double selling |
| Checkout | Free orders; simulated paid checkout with a 3% processing fee, retries, late/duplicate payment compensation refunds |
| Paid-sales activation | Simulated payout profile, identity check, terms, activation fee — per event |
| Tickets after purchase | Signed QR payload, stored PDF, email delivery with resend, recipient claim |
| Admission | Scanner event list, atomic one-time check-in, reversal, counts, manual search, verification preview, entry confirmation, offline package and sync, conflict review, organizer check-in history and CSV |
| Support | Cases from event/order/ticket, organizer → platform cases, threads, assignment, escalation, statuses, attachments, polling cursor and WebSocket |
| Notifications | In-app inbox; localized account/staff/ticket/support mail and event/purchase/payment/refund/simulated-payout notices; kk/ru/en with English fallback |
| Campaigns | Promo codes, campaign links/QR, atomic allowance reservations/redemptions and retained attribution |
| Refunds | Full simulated refunds, free cancellation, event cancellation, ticket invalidation and inventory quarantine until success |
| Reporting and finance | Scoped operational analytics/time series; finance reconciliation, simulated payout reservations/results and immutable adjustment history |
| Calendar | `.ics` export with stable UID and cancellation, Google/Outlook/Office 365 links |
| Administration | Admin role, user/event/order/ticket search, suspend/reinstate, event reports, moderation log, versioned settings, CSV exports, paid-sales suspend/reinstate and payment/refund/failure monitoring |

**Backend scope still open** — see [What is left to do](#what-is-left-to-do).

---

## Run it

### With Docker (recommended)

Docker is controlled from the repository root:

```bash
cp .env.example .env
docker compose up --build -d db migrate api worker mailpit
docker compose logs -f api worker
```

- Swagger: <http://localhost:8000/docs> (or <http://localhost:8080/docs> through Caddy)
- Emails: <http://localhost:8025>

The `migrate` service runs `python -m app.bootstrap` once per start: it applies migrations as
`biletflow_owner`, creates the restricted `biletflow_app` role used by the API, grants it access
to every table, and seeds the demo categories, venue and seat layout. The API never creates or
drops tables itself.

After pulling new code, rebuild so new migrations run:

```bash
docker compose up --build -d migrate api worker
```

### Natively (faster reloads)

Requires Python 3.12+ and [`uv`](https://docs.astral.sh/uv/). Keep PostgreSQL and Mailpit in
Docker:

```bash
docker compose up -d db migrate mailpit     # from the repository root
cd backend
cp .env.example .env                        # keep APP_DB_PASSWORD equal to the root .env
uv sync --frozen
uv run uvicorn app.main:create_app --factory --reload --port 8000
```

In a second terminal, from `backend/`:

```bash
uv run python -m app.worker
```

Uploaded files and ticket PDFs are stored under `STORAGE_ROOT` (`var/storage` natively,
the `file_storage` volume in Docker). The API and worker must share it.

### Useful settings (`.env`)

| Setting | Meaning |
|---|---|
| `ENVIRONMENT` | `development` enables the payment simulator endpoints; `production` enforces HTTPS URLs and secure cookies |
| `ADMISSION_REQUIRE_ENTRY_CONFIRMATION` | `true` requires the attendee's short-lived entry confirmation at the door. Set `false` for demos until the mobile app supports it |
| `FRONTEND_URL` | Base URL used in emailed links |
| `ALLOWED_ORIGINS` | Browser origins allowed to call the API with cookies |
| `SMTP_HOST` / `SMTP_PORT` | Mailpit locally; any SMTP server otherwise |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional, enables Google sign-in |

---

## Code layout

Everything lives in `app/`, one module group per area:

| Files | Responsibility |
|---|---|
| `main.py` | App factory, router registration, error handling, security headers |
| `config.py`, `db.py`, `security.py`, `service.py`, `idempotency.py`, `signing.py`, `storage.py` | Settings, sessions, tokens/hashing, shared guards, idempotency keys, signing keys, file storage |
| `*_models.py`, `models.py`, `all_models.py` | SQLAlchemy table mappings (must match the migrations) |
| `*_schemas.py` | Request/response models |
| `*_service.py` | Business rules and transactions |
| `*_api.py` | HTTP routes: `organization`, `event`, `checkout`, `paid_checkout`, `activation`, `ticket_document`, `admission`, `admission_history`, `offline`, `support`, `notification`, `calendar`, `admin` |
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
| [CAMPAIGNS_API.md](CAMPAIGNS_API.md) | Campaigns, promo reservations/redemptions, campaign link/QR and reporting |
| [REFUNDS_API.md](REFUNDS_API.md) | Full refunds, retry, free cancellation and event cancellation |
| [ANALYTICS_API.md](ANALYTICS_API.md) | Operational inventory/revenue/attendance reports and sales series |
| [FINANCE_API.md](FINANCE_API.md) | Finance summary, simulated payouts and retained adjustments |
| [TICKET_PDF_API.md](TICKET_PDF_API.md) | Ticket PDF, delivery status and resend |
| [ADMISSION_API.md](ADMISSION_API.md) | Scanner, check-in, entry confirmation, offline sync, check-in history |
| [SUPPORT_API.md](SUPPORT_API.md) | Support cases, messages, attachments, WebSocket |
| [NOTIFICATIONS_CALENDAR_API.md](NOTIFICATIONS_CALENDAR_API.md) | In-app notifications and calendar export |
| [ADMIN_API.md](ADMIN_API.md) | Platform administration |

Errors always have the shape `{"detail": {"code": "..."}}`; clients map the code to a message.

---

## Database and migrations

- Migrations live in `migrations/versions/` as `NNNN_name.py`, usually with a hand-written `NNNN_name.sql` (0016 uses inline SQL).
  There are **16 migrations and 66 tables** in the `biletflow` schema:
  `0001_identity` → `0002_event_setup` → `0003_checkout` → `0004_admission` →
  `0005_notifications_calendar` → `0006_admin_moderation` → `0007_entry_offline` →
  `0008_support` → `0009_files_admission` → `0010_commerce` → `0011_paid_activation` →
  `0012_paid_orders` → `0013_campaigns` → `0014_finance` → `0015_event_images` →
  `0016_image_cleanup`.
  This revision/count was verified on the disposable feature test database on 9 November 2026;
  check each deployment independently. The count excludes `public.alembic_version`.
- **Never edit an applied migration.** Add the next number, mirror the tables in a
  `*_models.py` file, and import that module in `app/all_models.py` and `migrations/env.py`.
- Historical migrations intentionally reject downgrade. New `0014`–`0016` provide scoped
  downgrades tested up/down/up on a disposable database; finance/gallery rollback loses their
  new history/links. Back up valuable data before any rollback.
- Audit, moderation and support history rows are protected by database triggers and cannot be
  edited or deleted. The runtime role has no `DELETE` and no `UPDATE` on `audit_log`.
- `docs/database/` holds a 66-table **reference design**. Its table set differs from the implemented
  schema (GA4/claim tables versus authentication extensions); see the
  [design/implementation matrix](../docs/database/README.md#how-the-design-relates-to-the-implementation). It is a target — never run its DDL against this database.

---

## Background worker

`python -m app.worker` claims durable jobs from the `outbox_job` table (`FOR UPDATE SKIP LOCKED`),
retries with back-off and marks a job `dead` after 5 attempts. It handles:

- emails: verification/reset, staff invitations, ticket delivery (with PDF), support updates;
- notification fan-out (in-app + email);
- simulated payment initialization, provider events and refund dispatch;
- releasing expired holds and reconciling orphan event images every 15 seconds.

Image recovery claims at most 50 due files per pass, with a one-hour pending-upload grace and
five-minute retry delay. Pending/deleted tombstones are retained and revisited to catch late
writes; eventual deletion requires the worker and storage/database availability. See
[the gallery contract](CATALOG_API.md). Email templates support kk/ru/en with English fallback;
user-authored content is preserved.

Business results never wait for email or notifications; those are retried independently.

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

On 9 November 2026 the final reviewed PostgreSQL suite collected **531 cases: 530 passed, 1 failed**
(the existing Windows DejaVu/Unicode PDF font case), with **96% statement coverage**.
Executed commands, exact coverage and limitations are recorded in [VALIDATION.md](VALIDATION.md).
Tests cover PostgreSQL concurrency and permission isolation across implemented areas. The workflow
(`.github/workflows/backend-auth.yml`) configures automated checks; its presence is not evidence
of a hosted CI run for these changes.

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

- GA4 consent-aware collection/export, authorized provider aggregates/cache and disconnected states.
- Remaining admin operational views (campaign/job/offline-conflict/support search and related notices)
  and commerce consumption of versioned settings; see [ADMIN_API.md](ADMIN_API.md#not-yet-implemented).
- Frontend/mobile integration of the documented APIs and complete acceptance journeys.
- Provider sandbox extension once credentials/access are available; no live financial operation.
- Deployment/recovery, backup/restore and measured workload targets still need their own evidence.
- Optional S3-compatible storage, asynchronous malware scanning, and deployment security headers
  remain separate work; local protected file storage is implemented.

Promo campaigns, operational analytics, refunds/cancellations, simulated finance/payouts,
organizer ticket-type counters, event history filters, event images with bounded recurring cleanup,
admin commerce monitoring, and backend email/category localization are implemented. See their
API guides for exact bounds, permissions, defaults and remaining scope. Public ticket-type responses
exclude organizer counters. `sold` includes refund quarantine; `refunded` is historical;
`checked_in` is current eligible unreversed attendance. These counts must not be added as disjoint
historical totals. Payout eligibility/sending after event end is an implementation default consistent
with activation terms, not a newly confirmed product decision.
