# Backend validation — 24 September 2026

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

See [the repeatable commands](README.md#tests), [authentication smoke results](../docs/database/auth_smoke_validation.json), and [catalogue/migration smoke results](../docs/database/catalog_smoke_validation.json). Coverage is supporting evidence, not a claim of production security certification. Real Google consent and frontend/mobile integration remain to be exercised with their configuration and clients.

The live catalogue smoke used the restricted application role through the running API and background worker. It left a clearly fictional published event with 12 free configured seats for browsing. It created no order, ticket or payment, and revoked the two smoke accounts' sessions afterwards. The repeatable seed contains two categories and one fictional venue/layout; paid-price fixtures remain for the commerce stage.

## Current local services

- API documentation: <http://localhost:8000/docs>
- Local email inbox: <http://localhost:8025>
- PostgreSQL: `127.0.0.1:55432`, database `biletflow`, schema `biletflow`.
- Local connection settings and generated secrets: `backend/.env` (ignored by source control). Do not paste or commit them.
- The separately named `biletflow_auth_test` database is disposable test data only.

Because Docker Desktop could not start, this session uses EDB's portable PostgreSQL binaries and Mailpit's official Windows binary. No Windows database service was installed. PostgreSQL is under `%TEMP%/biletflow-auth-postgres-01a0c53f`; its data remains there until explicitly removed. Preserve it or take a database backup before clearing temporary files. This is a local demonstration; use the documented Compose volume for the team setup.

The API, worker and Mailpit were started as hidden background processes. Their process IDs are in the project-local `tmp/auth-processes.json`; their startup logs are in `tmp/auth-*.log`. To stop them, first inspect each recorded process ID's executable and command line, then stop only the matching BiletFlow process (Windows can reuse old IDs). Stop PostgreSQL with its `pg_ctl.exe -D <runtime-directory>/data stop`. The helper `tmp/setup_auth_postgres.py` can restart this local database while the downloaded runtime remains present. Standard ongoing startup is documented in the backend README.
