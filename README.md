# BiletFlow

BiletFlow is a self-service event ticketing platform for Kazakhstan, built as an academic
project. Organizers create events and issue free or paid tickets; attendees discover events,
register or buy, and receive QR-code tickets; event staff check people in with the scanner;
platform administrators moderate the platform. Everything works in the web app and in the
iOS/Android app, which also contains the scanner. All payments are **simulated** —
no real money moves.

The requirements come from the SRS (`SWE project description.pdf`, v0.3) and the later scope
decisions in [`docs/BiletFlow_Backend_Requirements.md`](docs/BiletFlow_Backend_Requirements.md).

---

## Contents

1. [Project status](#project-status)
2. [Architecture](#architecture)
3. [Repository layout](#repository-layout)
4. [Run the whole project](#run-the-whole-project)
5. [First steps after starting](#first-steps-after-starting)
6. [Demo data](#demo-data)
7. [Working on one part](#working-on-one-part)
8. [Known limitations](#known-limitations)
9. [How we work](#how-we-work)
10. [Documentation map](#documentation-map)

---

## Project status

**Complete and ready to demonstrate.** As of `main` at `ddefdae` (24 November 2026), every MVP
feature (BF-01 to BF-22) is built in the backend and integrated in both the web app and the
mobile app, and every issue in the final tracker (#125) is closed. CI on `ddefdae` is green:
*Backend API*, *Web*, *E2E*, *Smoke* and *Backup*. The per-requirement view is in
[`docs/integration/status.md`](docs/integration/status.md).

| Part | State | Summary |
|---|---|---|
| Backend (`backend/`) | Done | Accounts, events and images, seating, free and simulated paid checkout, promo campaigns and Campaign QR, full-order refunds and cancellations, QR tickets and PDFs, online and offline admission, support with malware scanning, notifications (kk/ru/en), calendar, analytics with CSV export, simulated finance and payouts, platform administration (settings, moderation, operations search, jobs and deliveries), and optional GA4 (off by default). Check-in stays fast while analytics runs (#118), and the API docs have example requests and errors (#119). |
| Database (`backend/migrations/`) | Done | 21 migrations through `0021_job_correlation`; every CI run applies all of them to a fresh PostgreSQL 17. |
| Web (`web/`) | Done | Every area on the final contracts, including the event gallery (#107), analytics and finance with CSV export and payouts (#108, #132), admin commerce and operations (#109, #110), upload scan status (#112) and GA4 (#131); Kazakh/Russian/English interface. |
| Mobile app (`mobile/`) | Done | Every web feature plus the scanner ([decision 0001](docs/decisions/0001-mobile-app-full-scope.md)): online and offline QR scanning with the offline result per [decision 0003](docs/decisions/0003-confirmed-decisions.md) (#115), admin commerce and operations (#113, #116), event covers and analytics CSV export (#114), translated scanner text (#133), installable builds (#54) and real-phone checks (#53). |
| Environment | Done | Docker Compose with health checks and restart policies; a private S3-compatible bucket (SeaweedFS) for images, ticket PDFs and attachments; ClamAV scanning of support attachments; demo data with a guarded reset and an event always open for check-in; [backup and restore](docs/operations/backup.md) checked by a restore drill; HTTPS and security headers for a shared demo host (#49). |
| Tests and CI | Done | Backend: **904 passed, 0 failed, 0 skipped** with the process-kill and load harnesses on 24 November ([`backend/VALIDATION.md`](backend/VALIDATION.md), #117). Browser end-to-end tests with Playwright in CI (#120). Acceptance walkthrough AC-01 to AC-28: **21 pass, 7 partial, 0 fail** ([acceptance.md](docs/integration/acceptance.md), #121). Client types checked against the final contracts (#122). |

### Feature progress against the SRS

| SRS area | Backend | Web | Mobile |
|---|---|---|---|
| 4.1 Accounts, verification, password reset, Google sign-in | Done | Done | Done (Google is web only) |
| 4.2 Events: create, edit, publish, duplicate, cancel, visibility, images | Done | Done | Done |
| 4.3 Ticket types and inventory | Done (hold length from platform settings) | Done | Done |
| 4.3.1 Assigned seating (bonus) | Done | Done | Done |
| 4.4 Free registration | Done | Done | Done |
| 4.5 Paid-sales activation (simulated) | Done (fee from platform settings) | Done | Done |
| 4.6 Checkout, payments and finance (simulated) | Done, with simulated payouts | Done, with payouts | Done, with payouts |
| 4.7 Digital tickets, PDF, email delivery | Done (Kazakh/Russian PDF text) | Done | Done (PDF via share sheet) |
| 4.8 Scanner check-in, online and offline | Done | Check-in history + CSV | Done, online and offline |
| 4.9 Orders, cancellations, full-order refunds | Done | Done | Done |
| 4.10 Notifications | Done (incl. moderation notices) | Done | Done |
| 4.11 Calendar export (bonus) | Done | Done | Done |
| 4.12 Platform administration | Done | Done | Done |
| 4.13 Support cases | Done (ClamAV scan, quarantine) | Done, with scan status | Done, with scan status |
| 4.14 Promo codes and Campaign QR | Done | Done | Done |
| 4.15 Organizer analytics (GA4 optional) | Done, with CSV export; GA4 off by default | Done, with CSV export | Done, with CSV export |
| 4.16 Event history and audit trail | Done (with request IDs) | Done | Done |
| 7 Localization (Kazakh, Russian, English) | Done | Done | Done |

---

## Architecture

```text
 browser (web)          iPhone / Android (app + scanner)
        \                     /
         v                   v
        Caddy  :8080   (serves the built web app, proxies /api)
          |
          v
       FastAPI  :8000  ── PostgreSQL 17
          |            ── SeaweedFS (private S3-compatible file storage)
          |            ── ClamAV (scans support attachments)
       worker  ── the same database, storage and ClamAV
               ── email (Mailpit locally), PDFs, payments, notifications
```

- **One backend** (`backend/`): FastAPI API plus a background worker, both using PostgreSQL.
- **Files and scanning:** event images, ticket PDFs and support attachments are kept in a private
  SeaweedFS bucket shared by the API and worker; ClamAV checks attachments before they can be sent.
- **Web client** (`web/`): React + TypeScript single-page app built with Vite. In Docker it is
  built once and served by Caddy; there is no Node server in production.
- **Mobile client** (`mobile/`): Expo / React Native app with every web feature plus the staff scanner.
- **Caddy** (`proxy/`): the single public entry point on port 8080.

---

## Repository layout

```text
backend/            FastAPI app, worker, Alembic migrations, tests, API guides (*_API.md)
web/                Browser client (React + TypeScript + Vite)
mobile/             iOS/Android app: every web feature plus the scanner (Expo / React Native)
proxy/              Caddy config and the image that bundles the built web app
docs/               Requirements, client hand-off notes, reference database design
tools/              Smoke tests against a running stack, database-design generators
api/                Legacy starter, not built or used — kept only for history
docker-compose.yml  The complete local stack
.env.example        Settings for the Docker stack (copy to .env)
```

---

## Run the whole project

**You need:** Docker Desktop (with Docker Compose). Node.js 22 and Python 3.12 are only needed
if you work on one part natively (see each part's README).

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

The first start creates the database, applies migrations, seeds demo categories and a demo
venue with a seat layout, creates the restricted database role, starts the private S3-compatible
file storage (SeaweedFS) and creates its bucket and checks its restricted account, starts ClamAV
(its first start downloads malware signatures for a few minutes), starts the API and worker,
builds the web app and starts Caddy. Uploaded images, ticket PDFs and support attachments are kept
in that bucket, which is not reachable from outside the stack (see
[private file storage](backend/README.md#private-file-storage)).

| What | Address |
|---|---|
| Web app | <http://localhost:8080> |
| API docs (Swagger) | <http://localhost:8080/docs> |
| API directly | <http://localhost:8000> |
| Emails sent by the app (Mailpit) | <http://localhost:8025> |
| PostgreSQL | `localhost:5433` |

Stop the stack (data is kept):

```bash
docker compose down
```

Start again from an empty database and empty file storage:

```bash
docker compose down --volumes
```

After pulling new code, rebuild so new migrations run and the web app is rebuilt:

```bash
docker compose up --build
```

> `.env.example` contains development-only secrets. Never commit `.env`, and replace every
> password and secret before any shared deployment.
>
> **Upgrading an existing stack to the S3-compatible storage (#77):** add the new `S3_*` and
> `STORAGE_ADMIN_*` settings from `.env.example` to your `.env` (Compose stops with
> `Set ... in .env` otherwise). Files uploaded earlier are in the old `file_storage` volume, which
> the API no longer reads: take a backup with the old checkout first and restore it after
> updating ([backup and restore](docs/operations/backup.md#upgrading-from-the-file-volume)).

---

## First steps after starting

In development the first start builds the [demo data](#demo-data), so you can sign in with a
demo account right away. The steps below create your own account and events from scratch; in
production a fresh database has categories and a venue but **no users and no events**.

1. **Create an account.** Open <http://localhost:8080>, choose *Create account*, then open
   Mailpit (<http://localhost:8025>) and click the verification link.
2. **Make yourself a platform admin** (optional, enables the Admin tab):
   ```bash
   docker compose exec api python -m app.admin_cli grant you@example.com
   ```
3. **Create an event.** *Organizer* tab → create a workspace → create an event → add ticket
   types → *Publish*. It now appears in *Discover*.
4. **Paid tickets.** On the event, open *Paid sales* and complete the simulated checklist
   (payout profile, identity, terms, activation fee).
5. **Register as an attendee** with a second account, then open *Tickets* to see the QR code.
6. **Scan.** Sign in to the mobile app as the organizer (owners see their own events) or as a
   team member who was given "Scan tickets" on the event's *Staff* tab, then open *Check-in*.

**Scanner tip:** with `ADMISSION_REQUIRE_ENTRY_CONFIRMATION=true` (the default) the backend also
requires a short-lived entry confirmation: the attendee opens their ticket and shows the entry
confirmation, and the scanner reads that second QR (or its 8-digit code). For quicker demos set
it to `false` in `.env` and run `docker compose up -d` again.

**Attachments tip:** before demoing support attachments, wait until `clamav` shows `healthy` in
`docker compose ps` (its first start downloads signatures for a few minutes). Until then uploads
stay `quarantined` and cannot be sent with a message.

To create realistic data quickly, the smoke tests in `tools/` drive the whole flow through the
API against a running stack:

```bash
cd backend
uv run python ../tools/smoke_admission.py
uv run python ../tools/smoke_paid_checkout.py
```

---

## Demo data

In development the first start also builds fictional **lifecycle demo fixtures**: one organizer
workspace with a mixed free/paid concert with promo codes, a sold-out theatre, an assigned-seat
gala, a meetup happening now with a checked-in ticket, a private workshop and a cancelled
festival, plus refunded, refund-pending, expired-hold and exhausted-campaign examples. Sign in
with any of these accounts (password `BiletFlow-demo-2026`, development only):

| Account | Use it to |
|---|---|
| `demo-organizer@example.com` | Manage the events, campaigns, refunds, analytics and finance |
| `demo-attendee@example.com` | See orders and tickets, including the private event |
| `demo-guest@example.com` | See a refunded order and an expired checkout |
| `demo-scanner@example.com` | Scan in the mobile app (assigned to the concert and the live meetup) |
| `demo-admin@example.com` | Use the Admin tab |

Something to scan is always there: every `docker compose up -d` makes sure the scanner has an
event admitting people for at least 6 more hours. When the live meetup has closed, the start adds
a *Demo Check-in (live now)* event with two unused tickets for `demo-attendee` and keeps
everything else.

Dates are relative to the build, so refresh them (and discard changes made inside the demo
workspace) with an explicit reset. It never runs in production and touches nothing outside the
demo workspace:

```bash
docker compose run --rm migrate python -m app.seed --reset --yes-reset-demo
```

Details, the native command and exactly what a reset removes are in
[backend/README.md](backend/README.md#demo-data).

---

## Working on one part

Each part has its own README with setup, structure, conventions and remaining work:

- **Backend** → [`backend/README.md`](backend/README.md)
- **Web** → [`web/README.md`](web/README.md)
- **Mobile app** → [`mobile/README.md`](mobile/README.md)
- **Reference database design** → [`docs/database/README.md`](docs/database/README.md)

All Docker commands are run from the repository root; native tooling (`uv`, `npm`, `npx expo`)
is run from inside each part's folder.

---

## Known limitations

All tracked work is done (#125). These are deliberate scope limits or small follow-ups, none of
which blocks the demonstration:

- **Acceptance:** 7 of the 28 criteria are *partial*: the part that can be run automatically
  passes, and the rest needs hardware or timing a live run cannot produce, such as scanning a
  printed PDF or a hold expiring. Details in [acceptance.md](docs/integration/acceptance.md).
- **Simulated by design:** payments and payouts use the built-in simulator; a payment-provider
  sandbox needs merchant access, and live GA4 data needs property credentials.
- **Offline entry:** an offline scan only says "looks valid, connect to confirm"; entry is
  admitted by the server after sync ([decision 0003](docs/decisions/0003-confirmed-decisions.md)).
  Refunds stay full-order only; partial refunds are out of scope.
- **Small follow-ups:** calendar options on the order and ticket screens; server-side filters for
  check-in history (clients show the newest 100 entries); a `randomUUID` fallback for the web app
  on plain HTTP; the web checkout hint shows the default 10-minute hold rather than reading the
  setting; a backend design-rationale document; encryption at rest (a team decision).

---

## How we work

- **One branch and one pull request per area** (for example `feature/web-…`,
  `feature/mobile-…`, `feature/backend-…`). Keep backend, web and mobile changes in separate PRs
  unless a change truly needs all of them.
- **API changes go with documentation:** update the relevant `backend/*_API.md` in the same PR,
  and tell the web/mobile owners what changed.
- **Never edit an applied migration** — add a new one.
- **Run the checks before opening a PR:**
  - backend: `uv run ruff check app tests migrations && uv run ruff format --check app tests migrations && uv run pytest -q`
  - backend crash recovery (opt-in): `RUN_CRASH_TESTS=1 uv run pytest -q tests/crash`, see
    [backend/VALIDATION.md](backend/VALIDATION.md#worker-crash-recovery-harness--12-november-2026)
  - web: `npm run typecheck && npm test && npm run build`
  - mobile: `npm run typecheck && npm test`
  - backend load (opt-in, before changing checkout, admission or analytics):
    `LOAD_DATABASE_URL=<..._test database> uv run python -m tests.load.load_harness` — see
    `backend/VALIDATION.md`
- **Never commit** `.env` files, `node_modules`, `.venv`, `web/dist` or `mobile/.expo`.

---

## Documentation map

| Document | What it is for |
|---|---|
| [`docs/BiletFlow_Backend_Requirements.md`](docs/BiletFlow_Backend_Requirements.md) | Agreed scope, business rules and acceptance criteria |
| [`docs/CLIENT_HANDOFF_NOTES.md`](docs/CLIENT_HANDOFF_NOTES.md) | Backend → web/mobile hand-off notes per increment |
| [`backend/*_API.md`](backend/) | One contract per API area (catalog, checkout, paid sales, admission, support, …) |
| [`docs/integration/status.md`](docs/integration/status.md) | Per-requirement status (API, merged, web, mobile, acceptance), the evidence on `main` and the remaining work by issue |
| [`backend/VALIDATION.md`](backend/VALIDATION.md) | Recorded validation evidence |
| [`docs/operations/backup.md`](docs/operations/backup.md) | Backup and restore of the database and file storage |
| [`docs/database/`](docs/database/README.md) | 66-table reference design — a target, not the deployed schema |
| [`docs/decisions/`](docs/decisions/) | Decisions: [0001](docs/decisions/0001-mobile-app-full-scope.md) the mobile app covers the whole product; [0002](docs/decisions/0002-decisions-to-confirm.md) the questions that were open; [0003](docs/decisions/0003-confirmed-decisions.md) their answers (offline results need online confirmation, defaults confirmed) |
| [`docs/parallel-work/`](docs/parallel-work/) | Past increment plans, kept for history |
