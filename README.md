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

| Part | State | Summary |
|---|---|---|
| Backend (`backend/`) | Most of the MVP | Accounts, events, seating, free and simulated paid checkout, QR tickets and PDFs, online and offline admission, support, notifications, calendar export and platform administration are implemented and tested. Promo campaigns, analytics, organizer refunds and the finance view are not built yet. |
| Database (`backend/migrations/`) | Most of the MVP | 12 migrations, 58 tables. Campaign tables are the main missing piece. |
| Web (`web/`) | UI complete for current scope | Every screen exists. Screens whose backend exists are fully wired; promo, analytics, finance, refunds and event images show a "not available yet" state until their API ships. Kazakh/Russian translations are missing. |
| Mobile app (`mobile/`) | Full app + scanner | Every web feature on iOS/Android (see [decision 0001](docs/decisions/0001-mobile-app-full-scope.md)), plus the scanner with entry confirmation and manual guest search. Analytics, finance and event images wait for the backend. |
| Environment | Local demo works | Docker Compose runs the full stack, with [backup and restore](docs/operations/backup.md). No TLS. CI checks the backend and the mobile app, not yet the web. |
| Tests | Backend strong, clients growing | 238 backend tests (real PostgreSQL), 87 web unit tests, 163 mobile tests (screens with a mocked API, helpers, scanner flow), no automated end-to-end tests. |

### Feature progress against the SRS

"Done" means usable end to end. "Waiting for backend" means the web screen exists but the API
does not yet.

| SRS area | Backend | Web | Mobile |
|---|---|---|---|
| 4.1 Accounts, verification, password reset, Google sign-in | Done | Done | Done (Google is web only) |
| 4.2 Events: create, edit, publish, duplicate, cancel, visibility | Done (no images) | Done (images waiting for backend) | Done (images waiting for backend) |
| 4.3 Ticket types and inventory | Done (no per-type sold/refunded counts) | Done | Done |
| 4.3.1 Assigned seating (bonus) | Done | Done (seat map + organizer setup) | Done (seat map + organizer setup) |
| 4.4 Free registration | Done | Done | Done |
| 4.5 Paid-sales activation (simulated) | Done (no admin suspend endpoint) | Done | Done |
| 4.6 Checkout and payments (simulated) | Done (no organizer finance view) | Done (finance waiting for backend) | Done (finance waiting for backend) |
| 4.7 Digital tickets, PDF, email delivery | Done | Done | Done (PDF via share sheet) |
| 4.8 Scanner check-in | Done | Check-in history + CSV | Done (scan, entry confirmation, manual search, undo, history) |
| 4.9 Orders, cancellations, refunds | Partial (automatic refunds only) | Done (refund/cancel waiting for backend) | Done |
| 4.10 Notifications | Partial (5 of 9 types) | Done | Done (inbox + badge) |
| 4.11 Calendar export (bonus) | Done | Done | Done |
| 4.12 Platform administration | Partial (no payment/refund monitoring) | Done | Done |
| 4.13 Support cases | Done (incl. attachments) | Done | Done |
| 4.14 Promo codes and Campaign QR | Not started (scanner already rejects campaign QR) | Waiting for backend | Done (scanner rejects campaign QR) |
| 4.15 Organizer analytics | Not started | Waiting for backend | Waiting for backend |
| 4.16 Event history and audit trail | Done (no server-side filters) | Done | Done |
| 7 Localization (Kazakh, Russian, English) | Partial (some notifications) | Not started | Not started |

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

A fresh database has categories and a venue but **no users and no events**.

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

In priority order for the MVP. Bonus items come last.

**1. Backend features both clients are already waiting for**
- Promo campaigns and Campaign QR (SRS 4.14): campaign tables, discount at checkout, atomic
  redemption limits, campaign report.
- Organizer analytics (SRS 4.15): capacity, sales over time, by ticket type, campaigns,
  attendance, with filters.
- Organizer refunds and cancellation of free registrations (SRS 4.9).
- Organizer finance view: gross, fees, refunds, estimated payout (SRS 4.6).
- Per-ticket-type counts, event images, admin endpoint to suspend paid sales, admin views of
  payments/refunds/failures, the missing notifications (purchase confirmation, payment failure,
  refund completed, payout status).
- Before building them, confirm the request/response shapes the web expects (see
  [`web/README.md`](web/README.md#screens-waiting-for-the-backend)) and document them in a
  new `backend/*_API.md`.

**2. Clients**
- Web: Kazakh and Russian translations; accessibility pass (WCAG 2.1 AA); page-level and
  end-to-end tests.
- Mobile: Kazakh and Russian translations; click through the share sheet, document picker and
  camera on real iPhone and Android phones; merge the duplicated payment panel (orders vs checkout).

**3. Environment and quality**
- Backup and restore scripts with a short runbook (SRS requires backups).
- CI: add web typecheck/tests/build.
- HTTPS and security headers for any shared demo.
- Update `backend/VALIDATION.md` with current test evidence.

**4. Bonus**
- Offline scanning in the mobile app (the backend already supports it).
- GA4 traffic analytics.

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
  - web: `npm run typecheck && npm test && npm run build`
  - mobile: `npm run typecheck && npm test`
- **Never commit** `.env` files, `node_modules`, `.venv`, `web/dist` or `mobile/.expo`.

---

## Documentation map

| Document | What it is for |
|---|---|
| [`docs/BiletFlow_Backend_Requirements.md`](docs/BiletFlow_Backend_Requirements.md) | Agreed scope, business rules and acceptance criteria |
| [`docs/CLIENT_HANDOFF_NOTES.md`](docs/CLIENT_HANDOFF_NOTES.md) | Backend → web/mobile hand-off notes per increment |
| [`backend/*_API.md`](backend/) | One contract per API area (catalog, checkout, paid sales, admission, support, …) |
| [`backend/VALIDATION.md`](backend/VALIDATION.md) | Recorded validation evidence (needs updating) |
| [`docs/database/`](docs/database/README.md) | 66-table reference design — a target, not the deployed schema |
| [`docs/decisions/`](docs/decisions/) | Architecture decisions (0001: the mobile app covers the whole product) |
| [`docs/parallel-work/`](docs/parallel-work/) | Past increment plans, kept for history |
