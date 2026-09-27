# BiletFlow

BiletFlow is an academic event-ticketing platform with a FastAPI backend, PostgreSQL,
a Vite-built web client, a mobile client, and Caddy as the single public entry point.

## Architecture

```text
browser / mobile client
          |
          v
      Caddy :8080
       |       |
       |       +-- web routes and assets --> Vite dist
       |
       +-- /api, /docs, /health ----------> FastAPI
                                                |
                                                +--> PostgreSQL
                                                +--> email outbox worker --> Mailpit
```

The root `docker-compose.yml` is the only Docker Compose entry point. The backend does not
run a separate Compose project. Vite is used during development and during the Caddy image
build; it is not a production server.

## Repository layout

```text
backend/              FastAPI source, migrations, tests and Python environment
web/                  Browser source and Vite development/build configuration
mobile/               Mobile client workspace
proxy/                Caddy routes and the combined Vite/Caddy image
docs/                 Product and database specifications
docker-compose.yml    Complete local stack; run Compose from here
.env.example          Complete-stack local environment template
```

Each developer edits and runs native tooling from their own application directory, while
shared infrastructure and containerized services are always controlled from the repository
root.

## Start the complete project

Prerequisite: Docker with Docker Compose.

From the repository root:

```sh
cp .env.example .env
docker compose up --build
```

The values in `.env.example` are usable development-only defaults. Generate new URL-safe
database passwords and signing secrets before any shared or production deployment.

The first startup performs these steps automatically:

1. Starts PostgreSQL 17.
2. Applies Alembic migrations and seeds the demonstration categories and venue.
3. Creates the restricted PostgreSQL role used by the application.
4. Starts FastAPI and the email worker.
5. Builds `web/` with Vite and copies `web/dist` into the Caddy image.
6. Starts Caddy after the API readiness check succeeds.

Local addresses:

- Web application through Caddy: <http://localhost:8080>
- Swagger through Caddy: <http://localhost:8080/docs>
- OpenAPI JSON through Caddy: <http://localhost:8080/openapi.json>
- API directly, for development: <http://localhost:8000>
- API readiness: <http://localhost:8080/health/ready>
- Mailpit inbox: <http://localhost:8025>
- PostgreSQL: `localhost:5433`

Stop the project while retaining the database:

```sh
docker compose down
```

Delete the local database and start from empty migrations only when you intentionally want a
fresh environment:

```sh
docker compose down --volumes
```

## Work on the backend

Backend source, dependencies, migrations and tests live in `backend/`.

For the Docker workflow, run the backend services from the repository root:

```sh
docker compose up --build -d db migrate api worker mailpit
docker compose logs -f api worker
```

FastAPI is published on `localhost:8000`, so a backend developer can use Swagger without
starting Caddy. After changing Python dependencies or the backend image, rebuild it with:

```sh
docker compose up --build -d migrate api worker
```

For native Python development with faster restarts, first start PostgreSQL, migrations and
Mailpit from the root, then follow `backend/README.md`:

```sh
docker compose up -d db migrate mailpit
cd backend
cp .env.example .env
uv sync --frozen
uv run uvicorn app.main:create_app --factory --reload --port 8000
```

Run the worker in a second terminal from `backend/`:

```sh
uv run python -m app.worker
```

If root `.env` uses custom database passwords, copy the same `APP_DB_PASSWORD` into
`backend/.env` before native startup.

## Work on the web client

Web source and Vite configuration live in `web/`. Start the backend dependencies from the
repository root:

```sh
docker compose up --build -d db migrate api worker mailpit
```

Then work from the web directory:

```sh
cd web
cp .env.example .env
npm ci
npm run dev
```

Open <http://localhost:5173>. The Vite development server forwards `/api/*` and `/health/*`
to `http://localhost:8000`, so frontend code uses relative API URLs in development and in the
final Caddy deployment.

Build the same production files that Caddy receives:

```sh
npm run build
npm run preview
```

The generated `web/dist/` directory is ignored by Git. Docker recreates it during the proxy
image build.

## Work on the mobile client

Start the complete root stack and configure the mobile client to use the computer's reachable
address, for example `http://192.168.1.20:8080/api/v1`. Caddy forwards those requests to the
same FastAPI application used by the web client. The exact address depends on the developer's
local network and device or emulator.

## Proxy and production web build

`proxy/Dockerfile` is a multi-stage image:

1. A Node stage runs `npm ci` and `npm run build` in `web/`.
2. A Caddy stage copies the resulting `dist/` directory into `/srv`.

`proxy/Caddyfile` sends API, Swagger, OpenAPI and health requests to the `api` container. All
other paths are served from `/srv`; unknown paths fall back to `index.html` for client-side
routing.

There is no nginx container and no long-running Vite container in the complete stack.

## Environment files

- Root `.env` configures the complete Docker Compose stack.
- `backend/.env` is only for running FastAPI or the worker natively from `backend/`.
- `web/.env` is only for Vite development and selects the local API proxy target.

All real `.env` files are ignored by Git. Example files contain no production credentials.
The checked-in Caddy configuration deliberately serves local HTTP on port 8080. For a real
HTTPS deployment, configure the deployment domain in Caddy, publish ports 80/443, set
`ENVIRONMENT=production`, use HTTPS URLs, set `COOKIE_SECURE=true`, and replace every
development password and signing secret.

## Current backend scope

Implemented now:

- Email/password and Google authentication, verification and recovery
- Rotating refresh tokens and revocable sessions
- Organizer workspaces, invitations and scoped permissions
- Event drafts, publication, visibility and duplication
- Ticket-type and predefined assigned-seat configuration
- Free checkout: inventory holds, zero-total orders, QR tickets, recipient claims, ticket
  delivery email and organizer attendee list
- Audit history and durable email delivery

Paid checkout, paid-sales activation, payments, refunds, issued ticket PDFs, admission,
support, analytics and platform administration remain future backend work.

Detailed references:

- `backend/README.md` - backend behavior and native setup
- `backend/CATALOG_API.md` - organizer and event API contract
- `backend/CHECKOUT_API.md` - free checkout, orders and ticket API contract
- `backend/VALIDATION.md` - existing backend validation evidence
- `docs/BiletFlow_Backend_Requirements.md` - shared backend plan
- `docs/database/` - target database design; its 66-table reference SQL is not an application migration

The legacy `api/` starter remains in the repository for branch compatibility, but the root
Compose stack no longer builds or runs it. New backend work belongs in `backend/`.
