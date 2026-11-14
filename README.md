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
6. [Working on one part](#working-on-one-part)
7. [What is left to do](#what-is-left-to-do)
8. [How we work](#how-we-work)
9. [Documentation map](#documentation-map)

---

## Project status

As of `main` after PRs #86–#95 (13 November 2026). The detailed, per-requirement view is in
[`docs/integration/status.md`](docs/integration/status.md). It keeps four states apart: the API
is complete, it is merged, each client is integrated, and the journey is acceptance-verified.

| Part | State | Summary |
|---|---|---|
| Backend (`backend/`) | API for every SRS area except GA4 | Accounts, events and images, seating, free and simulated paid checkout, promo campaigns and Campaign QR, full-order refunds and cancellations, QR tickets and PDFs, online and offline admission, support, notifications (kk/ru/en), calendar, analytics, simulated finance and payouts, and platform administration. Open gaps and defects are tracked in #85. |
| Database (`backend/migrations/`) | Current | 17 migrations, 66 tables (through `0017_ticket_pdf_cleanup`). |
| Web (`web/`) | Mostly integrated | Campaigns, promo checkout and refunds use the final contracts; Kazakh/Russian/English interface. Analytics, finance and image upload still call their planned contracts and need checking against the merged API (#45). |
| Mobile app (`mobile/`) | Full app + scanner, integration behind | Every web feature plus the scanner ([decision 0001](docs/decisions/0001-mobile-app-full-scope.md)), including offline QR scanning. Promo, campaigns, refunds, analytics, finance and images use the final contracts, not yet checked on a device (#51); Kazakh, Russian and English (#52). |
| Environment | Local demo works | Docker Compose with health checks and restart policies, demo data with a guarded reset, and [backup and restore](docs/operations/backup.md) that briefly stops the API and worker so the database and files match. No TLS yet (#49). Files are on a local volume; the required S3-compatible storage is not provided yet (#77). |
| Tests and CI | Backend strong, no browser/device end-to-end | Backend PostgreSQL suite (see [`backend/VALIDATION.md`](backend/VALIDATION.md)); web and mobile unit tests; CI runs backend, web, mobile, API smoke flows and a backup/restore drill with file checks. Opt-in process-kill recovery and load harnesses run locally. No browser or real-device end-to-end tests. |

No SRS journey is acceptance-verified end to end on both clients yet. API smoke tests in CI
cover free registration and admission, paid checkout, campaign discounts and refunds at the API
level only.

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
          |
       worker  ── email (Mailpit locally), PDFs, payments, notifications
```

- **One backend** (`backend/`): FastAPI API plus a background worker, both using PostgreSQL.
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
venue with a seat layout, creates the restricted database role, starts the API and worker,
builds the web app and starts Caddy.

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

Start again from an empty database:

```bash
docker compose down --volumes
```

After pulling new code, rebuild so new migrations run and the web app is rebuilt:

```bash
docker compose up --build
```

> `.env.example` contains development-only secrets. Never commit `.env`, and replace every
> password and secret before any shared deployment.

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

## What is left to do

In dependency order (from the audit in #85); each step builds on the ones before it. Client work
for areas already merged does not have to wait for steps 1–2.

Done on 12–13 November: the docs reconcile (#84), demo fixtures (#79), crash recovery (#83) and
load (#80) harnesses, stale refund callbacks (#65), campaign revalidation at paid fulfilment
(#66), committed ticket PDFs and their cleanup (#68), consistent backups (#69) and Kazakh/Russian
PDF text (#82).

1. **Campaigns, settings, uploads:** reconcile campaign reports (#67), apply platform settings
   to checkout and activation (#70), attachment malware quarantine (#75), recovery of abandoned
   uploads (#76).
2. **Admin and operations:** exhausted jobs and deliveries (#73), admin search and detail (#72),
   moderation notices (#74), S3-compatible storage (#77), correlation IDs and metrics (#78).
3. **Reporting and clients:** GA4 (#71), analytics export (#81); web integration (#45); mobile
   integration (#51); HTTPS for the shared
   demo (#49).
4. **Acceptance:** real devices (#53) and builds (#54); rerun the load and crash harnesses and the
   restore drill once steps 1–2 change the code, then record the results in the integration
   status and `backend/VALIDATION.md`.

Open product questions (offline entry rules and the proposed defaults the code already uses) are
listed in [decision 0002](docs/decisions/0002-decisions-to-confirm.md). Refunds stay full-order
only; partial refunds are out of scope.

---

## How we work

- **One branch and one pull request per area** (for example `feature/web-…`,
  `feature/mobile-…`, `feature/backend-…`). Keep backend, web and mobile changes in separate PRs
  unless a change truly needs all of them.
- **API changes go with documentation:** update the relevant `backend/*_API.md` in the same PR,
  and tell the web/mobile owners what changed.
- **Never edit an applied migration** — add a new one.
- **Run the checks before opening a PR:**
  - backend: `uv run ruff check app tests migrations && uv run pytest -q`
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
| [`docs/integration/status.md`](docs/integration/status.md) | Per-requirement status (API, merged, web, mobile, acceptance) and the ordered backlog |
| [`backend/VALIDATION.md`](backend/VALIDATION.md) | Recorded validation evidence |
| [`docs/database/`](docs/database/README.md) | 66-table reference design — a target, not the deployed schema |
| [`docs/decisions/`](docs/decisions/) | Decisions (0001: the mobile app covers the whole product; 0002: decisions still to confirm) |
| [`docs/parallel-work/`](docs/parallel-work/) | Past increment plans, kept for history |
