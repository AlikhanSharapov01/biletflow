# BiletFlow

BiletFlow is an academic event-ticketing project built with **FastAPI and PostgreSQL**. This branch delivers authentication and organizer/event setup. The complete ticket-purchase and admission lifecycle is still in development.

## What works now

| Area | Implemented behavior |
|---|---|
| Accounts | Email registration/verification, password login/recovery, profiles and session management |
| Google authentication | OpenID Connect sign-in and explicit account linking; requires your Google OAuth credentials |
| Tokens | Short-lived signed access JWTs, hashed rotating refresh tokens, replay detection and session revocation |
| Organizers | Workspaces, email invitations, membership and scoped staff/scanner permissions |
| Events | Draft editing, publication/unpublication, duplication, public discovery and private/unlisted visibility |
| Inventory setup | Free/paid ticket types, predefined venue layouts, assigned seats and capacity-edit safeguards |
| Infrastructure | PostgreSQL migrations, restricted runtime role, append-only audit, durable email worker, Docker configuration and CI |

**Not implemented yet:** checkout and expiring reservation APIs, paid-sales activation, orders, payment/refund processing, issued tickets/PDFs, admission/offline scanning, support, analytics and administration. Cancellation currently refuses sold/refund-quarantined inventory until commerce implements the complete refund transaction. Event images and downstream change notifications also remain.

The application migrations create **27 tables**. The draw.io atlas describes the **full 66-table target design**; do not execute its reference SQL over an application database.

## Start the implemented backend

Prerequisite: Docker with Compose. From the repository root:

```sh
cd backend
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env`. Edit the new file:

1. Set `POSTGRES_PASSWORD` and `APP_DB_PASSWORD` to separate random URL-safe passwords.
2. Update the password in `DATABASE_URL` to match `APP_DB_PASSWORD`.
3. Set `JWT_SECRET` and `CHALLENGE_SECRET` to two different random values, each at least 32 bytes. For each value, run `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
4. Leave Google fields empty for email/password testing, or configure them using the [Google setup guide](backend/README.md#enable-google-sign-in).

Then, still in `backend/`:

```sh
docker compose up --build -d
```

Compose starts PostgreSQL 17, runs migrations and the fictional category/venue seed, and starts the API, worker and local Mailpit inbox.

| Service | Local address |
|---|---|
| Swagger / interactive API | http://localhost:8000/docs |
| OpenAPI JSON | http://localhost:8000/openapi.json |
| Readiness | http://localhost:8000/health/ready |
| Mailpit inbox | http://localhost:8025 |
| PostgreSQL | localhost:5433 |

Run `docker compose down` from `backend/` to stop this stack while retaining its database volume. Do not commit `.env`. For native Python/PostgreSQL startup, see [backend/README.md](backend/README.md#run-without-docker).

**Existing starter:** the root `docker-compose.yml`, `api/`, `web/` and `proxy/` are preserved from the original repository. That root stack serves the initial website and placeholder API on port 8080; it does not load the implemented backend. Use the `backend/` Compose stack for this branch's APIs. Frontend/proxy integration is a separate follow-up.

## Try a complete setup flow

1. Open Swagger and call `POST /api/v1/auth/register`.
2. Open the verification email in Mailpit; submit the link's `#token=` value to `POST /api/v1/auth/verify-email`.
3. Call `POST /api/v1/auth/login`. For a Swagger demonstration, `client_kind: "scanner"` returns the refresh token in JSON. Web clients use the documented HttpOnly cookie flow.
4. Put the returned access token into Swagger's **Authorize** field.
5. Create an organization, then read `/api/v1/categories` and `/api/v1/venues`.
6. Create an event draft with valid date/time windows; add a free ticket type. For assigned seating, choose the seeded layout and configure its price-category mapping.
7. Publish the event, then browse `/api/v1/events` without authentication.
8. Invite another verified account, accept the emailed invitation, and assign that member event-specific permissions.

The seed provides two categories and a fictional 12-seat Almaty venue, including accessibility metadata. It creates no preset user/password, purchase or payment. Email links target future client pages; use the token endpoints directly until those pages are integrated.

## Tests and checks

Latest local validation: **91 tests passed**, **93% statement coverage**, Ruff checks passed. Tests use actual PostgreSQL connections and include authentication, permission boundaries, invitation races, seat uniqueness, capacity constraints and rollback. Live HTTP/SMTP checks also passed. See [validation evidence](backend/VALIDATION.md).

To repeat the suite, install Python 3.12+ and `uv`, then create a **dedicated disposable PostgreSQL database whose name ends in `_test`**. Its test role needs migration and role-creation privileges. Set `TEST_DATABASE_URL` to its `postgresql+psycopg://...` connection string in your shell. The suite truncates all implemented tables in that test database.

```sh
cd backend
uv sync --frozen
uv run pytest -q --cov=app --cov-report=term-missing
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations
```

The GitHub Actions workflow provisions PostgreSQL 17 and runs these checks. Local Docker image execution and a real Google consent round trip have not been verified; the local test run used native PostgreSQL, and Google provider responses were simulated in automated tests.

## Repository map

```text
backend/
  app/                 FastAPI routes, authorization, models, worker and seeds
  migrations/          Versioned application SQL and Alembic revisions
  tests/               PostgreSQL-backed API and concurrency tests
  compose.yaml         Implemented backend's local stack
  .env.example         Configuration template without real secrets
docs/
  BiletFlow_Backend_Requirements.md   Shared scope, flows and delivery plan
  database/            Editable UML, reference schema, previews and checks
tools/                 Database-design generation/validation helpers
.github/workflows/     Backend CI
api/, web/, proxy/     Preserved original starter
```

## Team documentation

- [Shared requirements and dependency-based plan](docs/BiletFlow_Backend_Requirements.md) — read before changing business rules.
- [Backend setup, authentication and session contract](backend/README.md).
- [Organizer/event API guide](backend/CATALOG_API.md) — endpoint permissions, flows, constraints and remaining scope.
- [Database specification](docs/database/BiletFlow_Database_Specification.md) and [editable draw.io atlas](docs/database/BiletFlow_Database.drawio).
- [Database preview instructions](docs/database/README.md) — open the HTML preview locally with its adjacent `preview/` folder.
- [Validation results](backend/VALIDATION.md) — checked behavior and known limitations.

Next in the plan: authenticated holds and expiry, free checkout and ticket issuance, followed by paid activation and simulated payment/refund flows. Real-money payments and payouts are outside the current academic implementation.
