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
| Events | Draft → publish/unpublish → cancel, duplicate, public/unlisted/private, registration and admission windows, capacity, refund policy, history timeline |
| Tickets | Free and paid ticket types, sales windows, per-order limits, hidden types, inventory protection under concurrency |
| Seating | Predefined venue layout, seat configuration, ten-minute seat holds, no double selling |
| Checkout | Free orders; simulated paid checkout with a 3% processing fee, retries, late/duplicate payment compensation refunds |
| Paid-sales activation | Simulated payout profile, identity check, terms, activation fee — per event |
| Tickets after purchase | Signed QR payload, stored PDF, email delivery with resend, recipient claim |
| Admission | Scanner event list, atomic one-time check-in, reversal, counts, manual search, verification preview, entry confirmation, offline package and sync, conflict review, organizer check-in history and CSV |
| Support | Cases from event/order/ticket, organizer → platform cases, threads, assignment, escalation, statuses, attachments, polling cursor and WebSocket |
| Notifications | In-app inbox; emails for verification, ticket delivery, event updates/cancellation and support |
| Calendar | `.ics` export with stable UID and cancellation, Google/Outlook/Office 365 links |
| Administration | Admin role, user/event/order/ticket search, suspend/reinstate, event reports, moderation log, versioned settings, CSV exports |

**Not built yet** — see [What is left to do](#what-is-left-to-do).

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
| [TICKET_PDF_API.md](TICKET_PDF_API.md) | Ticket PDF, delivery status and resend |
| [ADMISSION_API.md](ADMISSION_API.md) | Scanner, check-in, entry confirmation, offline sync, check-in history |
| [SUPPORT_API.md](SUPPORT_API.md) | Support cases, messages, attachments, WebSocket |
| [NOTIFICATIONS_CALENDAR_API.md](NOTIFICATIONS_CALENDAR_API.md) | In-app notifications and calendar export |
| [ADMIN_API.md](ADMIN_API.md) | Platform administration |

Errors always have the shape `{"detail": {"code": "..."}}`; clients map the code to a message.

---

## Database and migrations

- Migrations live in `migrations/versions/` as `NNNN_name.py` + a hand-written `NNNN_name.sql`.
  There are **12 migrations and 58 tables** in the `biletflow` schema:
  `0001_identity` → `0002_event_setup` → `0003_checkout` → `0004_admission` →
  `0005_notifications_calendar` → `0006_admin_moderation` → `0007_entry_offline` →
  `0008_support` → `0009_files_admission` → `0010_commerce` → `0011_paid_activation` →
  `0012_paid_orders`.
- **Never edit an applied migration.** Add the next number, mirror the tables in a
  `*_models.py` file, and import that module in `app/all_models.py` and `migrations/env.py`.
- There are no downgrades. To start over locally, use `docker compose down --volumes`.
- Audit, moderation and support history rows are protected by database triggers and cannot be
  edited or deleted. The runtime role has no `DELETE` and no `UPDATE` on `audit_log`.
- `docs/database/` holds a larger 66-table **reference design**. It is a target, not the deployed
  schema — never run its DDL against this database.

---

## Background worker

`python -m app.worker` claims durable jobs from the `outbox_job` table (`FOR UPDATE SKIP LOCKED`),
retries with back-off and marks a job `dead` after 5 attempts. It handles:

- emails: verification/reset, staff invitations, ticket delivery (with PDF), support updates;
- notification fan-out (in-app + email);
- simulated payment initialization, provider events and refund dispatch;
- releasing expired holds every 15 seconds.

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

There are 238 tests in 24 files, covering every implemented area, including concurrency
(overselling, double check-in, racing payments) and permission isolation. CI
(`.github/workflows/backend-auth.yml`) runs the same commands on PostgreSQL 17 for every push and
pull request.

End-to-end smoke tests against a running Docker stack live in `../tools/`:

```bash
uv run python ../tools/smoke_admission.py
uv run python ../tools/smoke_paid_checkout.py
```

---

## What is left to do

**Required for the MVP**
- **Promo campaigns and Campaign QR** (SRS 4.14): campaign, code, reservation and redemption
  tables; discount in holds and orders; atomic redemption limit; campaign report; QR image.
- **Organizer analytics** (SRS 4.15): capacity, sold/remaining, revenue, sales over time, by ticket
  type and campaign, attendance, with event/date/ticket-type filters. Read-only queries that never
  block checkout.
- **Refunds and cancellations** (SRS 4.9): organizer-initiated full refunds, cancelling free
  registrations, refunds when an event with sales is cancelled (currently
  `409 commerce_cancellation_required`), ticket invalidation.
- **Organizer finance view** (SRS 4.6): gross, fees, refunds, estimated payout.
- **Per-ticket-type counts**: available, reserved, sold, refunded, checked-in.
- **Event images** (SRS 4.2).
- **Admin gaps** (SRS 4.12): endpoint to suspend/reinstate paid sales, views of payments,
  refunds, failures, activation records and promo activity. Commerce code should read the
  activation fee and hold time from admin settings instead of constants.
- **Missing notifications** (SRS 4.10): purchase confirmation, payment failure, refund completed,
  payout status.
- **Event history filters** on the server (date range, action type).

The web client already has screens for promo codes, campaigns, analytics, finance,
refund/cancel and image upload. Agree their exact request/response shapes with the web owner and
document them in new `*_API.md` guides before implementing.

**Quality and operations**
- Kazakh and Russian email templates.
- Content-Security-Policy and HSTS headers for HTTPS deployments.
- Optional S3-compatible storage backend (local disk today).
- Update `VALIDATION.md` with current evidence.
