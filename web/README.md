# BiletFlow web

The browser client for attendees, organizers and platform administrators. It is a React 19
single-page app written in strict TypeScript, bundled with Vite and routed with React Router.
It talks to the backend through same-origin `/api` requests and follows the same visual design
as the mobile app (shared colours, type scale and components).

---

## Contents

1. [Status](#status)
2. [Run it](#run-it)
3. [Folder structure](#folder-structure)
4. [How to add or change a screen](#how-to-add-or-change-a-screen)
5. [Routes](#routes)
6. [Backend contracts](#backend-contracts)
7. [Tests](#tests)
8. [What is left to do](#what-is-left-to-do)
9. [Localization](#localization)
10. [Accessibility checklist](#accessibility-checklist)
11. [HTTPS handoff](#https-handoff)
12. [Downloads and idempotency](#downloads-and-idempotency)
13. [Optional GA4 traffic collection](#optional-ga4-traffic-collection)

---

## Status

Checked against `main` at `56a6a3e` on 20 November 2026.

**Wired to the live backend**

- **Every screen in the current scope exists**, and every screen calls a merged backend route.
  Sign-in and account, discovery, event pages, free and simulated paid checkout, seat map,
  tickets (QR, PDF, delivery, entry confirmation), orders, calendar export, event reports,
  support, notifications, organizer workspace and event management, check-in history and CSV,
  paid-sales activation, seating setup and the platform admin portal (user/event/order/ticket
  search, user and event suspension, reports, moderation log, settings, CSV exports) all use the
  final contracts.
- **Promo codes, campaigns and refunds** follow the live backend (PR #63): server pricing and
  quotes, zero-total checkout, campaign create/edit/disable, QR preview and download, campaign
  reports, campaign links that survive sign-in, buyer refund requests that open a support case,
  organizer refunds and free-ticket cancellation.
- **Analytics, finance and event images** follow the merged contracts (PR #111,
  `backend/ANALYTICS_API.md`, `FINANCE_API.md`, `CATALOG_API.md`). The finance tab covers simulated
  payouts: reserving, history and the demo transitions. The gallery supports upload, cover,
  reorder and delete, and covers are shown on Discover and the event page. No screen shows
  "Not available yet" any more (#45).
- **Admin portal** includes paid-sales suspension and reinstatement per event, plus read-only
  payment, failed-payment and refund monitoring with CSV export (PR #111, `backend/ADMIN_API.md`).
- **Organizer workspace** can edit the organizer contact profile, owners can set each member's
  workspace permissions (profile, staff, finance), and owners can connect the organization to GA4.
- **Platform settings are read from the server.** Upload size limits for event images and support
  attachments come from `GET /api/v1/settings/public` (`upload_max_bytes`), not from constants.
- **Notifications** cover every kind the backend sends, including account/event/paid-sales
  moderation and simulated payout status.
- **Downloads, idempotency keys and event labels** (PR #62): one file helper for every binary
  transfer, an `Idempotency-Key` on holds, confirmations, checkout, activation and payment
  retries, and readable publication labels on the event page. See
  [Downloads and idempotency](#downloads-and-idempotency).
- **Kazakh, Russian and English** interface catalogs with 1,535 shared keys, profile language
  selection and localized dates, money, plurals, categories, statuses and notifications. See
  [Localization](#localization).
- **GA4 through the backend** (#131, PR #143), off unless the backend enables it: consenting
  people's event views, campaign landings and checkout starts go to `POST /analytics/measurements`
  (no Google script in the browser), owners connect the organization in the workspace, and the
  Analytics tab shows a Traffic section. See
  [Optional GA4 traffic collection](#optional-ga4-traffic-collection).
- **438 tests in 66 files** and a **Web CI workflow** (type check, tests, production build).
- **Accessibility fixes** include contrast, visible focus, labelled controls, keyboard seating
  and native modal action dialogs. Browser and screen-reader acceptance is still outstanding;
  see the [checklist](#accessibility-checklist).

**Still missing**

| Issue | What is missing on `main` |
|---|---|
| #107 | Event gallery: the Details tab uploads one image and previews it, but does not list the gallery, set the cover, reorder or delete images |
| #108 | Analytics and finance on the final contracts: both tabs still use the planned types; finance payouts and the analytics CSV export (`GET /events/{id}/analytics/export.csv`) are not in the web |
| #109 | Admin paid-sales suspension and payment, failed-payment and refund monitoring (`backend/ADMIN_API.md`) |
| #110 | Admin operations: support-case, activation, campaign and sync-conflict search, order and ticket detail, outbox jobs and notification deliveries with retry |
| #112 | Support uploads do not show the attachment scanning or quarantine status |
| #49 | HTTPS and security headers: staged in [HTTPS handoff](#https-handoff), not installed |
| #120 | Browser end-to-end tests |
| — | GA4 organization connection, funnel measurements and the organizer traffic report from #71 (see [GA4](#optional-ga4-traffic-collection)) |

Open PR #111 (Yershuak, branch `ershuku-web`) covers most of #107 to #109: the event gallery,
analytics and finance (with payouts) on the final contracts, and admin paid-sales suspension
with payment and refund monitoring and their CSV exports. It does not add the analytics CSV
export. Until it is merged, the table above describes `main`.

---

## Run it

**You need:** Node.js 22.22.2+ on 22.x, 24.15+ on 24.x, or 26+ (what jsdom, a test dependency,
requires), and a running backend.

Start the backend from the repository root:

```bash
docker compose up --build -d db migrate api worker mailpit
```

Then, from `web/`:

```bash
cp .env.example .env
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite forwards `/api/*` and `/health/*` to `VITE_API_PROXY_TARGET`
(default `http://localhost:8000`). Emails such as verification links arrive in Mailpit at
<http://localhost:8025>.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload and the API proxy |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Vitest unit and component tests (`npm run test:watch` to re-run on change) |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run translations:build` | Regenerate `src/i18n/locales/*.json` from `translations/core.tsv` |
| `npm run translations:audit` | Report interface text that is not in the catalogs |

In Docker, Caddy serves the built app on <http://localhost:8080>. After changing web code, rebuild
that image from the repository root: `docker compose up --build -d proxy`. Never commit `dist/`.

---

## Folder structure

```text
src/
  main.tsx              Entry point: mounts the app and the stylesheet
  app/                  App providers and the route table (routes.tsx)
  api/                  One module per backend area (auth, catalog, checkout, tickets, support, admin, …)
    client.ts           The single fetch wrapper: bearer token, one refresh retry, readable errors
    files.ts            Downloads and uploads (PDF, calendar, CSV, QR images, event images)
    errors.ts           Backend error code → user-facing message
    types/              Request/response types, one file per area
  components/
    ui/                 Shared building blocks: Button, PageHeading, Panel, StatusPill, EventCard,
                        DateTile, EventImage (authorized image loader), Field, Tabs,
                        Feedback (Loading/ErrorPanel/EmptyState), Toast, ActionDialog, NotAvailableYet
    layout/             AppShell, TopBar, AvatarMenu, phone TabBar, navigation, RequireAuth
  features/             One folder per area, each with its pages, components, hooks and helpers
    auth/  discover/  events/  checkout/  tickets/  orders/  account/
    support/  notifications/  organizer/  admin/
  i18n/                 t(), useLocale(), language switcher and the generated en/ru/kk catalogs
  analytics/            Consent-aware traffic measurements sent to the backend (no Google script)
  hooks/                useRequest (load with loading/error/reload), useCountdown,
                        usePublicSettings (platform limits from /settings/public)
  utils/                Formatting (dates, money, seats) and status → pill tone
  styles/               tokens.css (colours, type, spacing), base, layout, components,
                        and one stylesheet per feature; index.css imports them in order
translations/           core.tsv (shared web/mobile strings) and the audit's reviewed exceptions
scripts/                build-locales.mjs and audit-strings.mjs
tests/helpers/          Shared test fixtures
```

`features/organizer/event/` holds one file per event tab (Details, Ticket types, Seating, Paid
sales, Attendees, Check-ins, Staff, Campaigns, Analytics, Finance, History). Their parts live in
sub-folders (`details/` for the image gallery, `analytics/`, `finance/` for payouts, …).

---

## How to add or change a screen

1. **Put it in the right feature folder.** A page component goes in `features/<area>/`, its parts
   in `features/<area>/components/`. Keep files small (roughly under 200 lines) and one component
   per file.
2. **Call the API through `src/api/`.** Add a function to the area's module that wraps
   `request()` from `api/client.ts` (or `files.ts` for downloads and uploads), and add its types
   to `api/types/<area>.ts`. Never call `fetch` directly from a component. Follow the contract in
   the matching `backend/*API.md`.
3. **Load data with `useRequest`** and show `Loading`, `ErrorPanel` and `EmptyState` from
   `components/ui`.
4. **Show errors with `describeError`.** If the backend returns a new error code, add its message
   to `api/errors.ts`.
5. **Use the shared components** (`PageHeading`, `Panel`, `StatusPill`, `Button`, fields) instead
   of new markup. Use `utils/status.ts` to pick a pill tone for a ticket, order or event state.
6. **Translate every visible string.** Add the key with English, Russian and Kazakh wording to
   `translations/core.tsv`, run `npm run translations:build`, and render it with `t(key)` in a
   component that calls `useLocale()`. See [Localization](#localization).
7. **Style with tokens.** Use the CSS variables in `styles/tokens.css`; do not add new hex colours
   or pixel font sizes. Add feature styles to that feature's stylesheet.
8. **Register routes** in `app/routes.tsx` (or the feature's `routes.tsx`), and add primary
   sections to `components/layout/navigation.ts`.
9. **Planned endpoints.** The backend serves every endpoint the web uses, so new screens should
   be built on the documented contract (see [Backend contracts](#backend-contracts)). No screen
   uses the `NotAvailableYet` fallback (`isNotImplemented(error)` in `api/errors.ts`) any more;
   keep it only for a route the backend does not serve yet. Never show sample data in place of a
   missing endpoint.

---

## Routes

| Path | Who | Page |
|---|---|---|
| `/` | Anyone | Redirects to `/discover`; so does any unknown path |
| `/sign-in` | Anyone | Sign in, create account, forgot password, resend verification, Google, language |
| `/verify-email#token=`, `/reset-password#token=` | Anyone | Pages opened from emailed links |
| `/discover` | Anyone | Published events with search and category filter |
| `/events/:eventId` | Anyone | Event details, publication label, tickets, seat map, promo code, calendar, report, get help |
| `/c/:token` | Anyone | Campaign QR link: resolves the promo and opens the event |
| `/tickets`, `/tickets/:ticketId` | Signed in | Tickets: QR, PDF, delivery, admission status, entry confirmation |
| `/orders`, `/orders/:orderId` | Signed in | Orders: totals, promo, payment status, retry, cancellation, refund requests |
| `/support`, `/support/new`, `/support/cases/:caseId` | Signed in | Support cases and threads with attachments |
| `/notifications` | Signed in | Notification inbox |
| `/organizer` | Signed in | Workspaces, organizer profile, events grouped by status, team, permissions and invitations |
| `/organizer/events/:eventId` | Signed in | Event management tabs |
| `/staff-invitations/accept#token=` | Signed in | Join a workspace from an invitation |
| `/account` | Signed in | Profile, language preference, traffic-analytics consent, sessions |
| `/admin` → `/admin/users`, `/events`, `/orders`, `/tickets`, `/payments`, `/reports`, `/moderation`, `/settings`, `/exports` | Platform admins | Admin portal (the Admin tab is shown only to admins) |

The backend links emails to `/verify-email`, `/reset-password`, `/staff-invitations/accept`,
`/tickets/:id`, `/events/:id` and `/support/cases/:id` — keep those paths stable. Caddy falls back to
`index.html` for unknown paths so deep links work.

---

## Backend contracts

Every screen calls a merged backend route; types in `src/api/types/` mirror the backend schemas
file by file. The areas integrated last, and what they rely on:

| Screen | Endpoints | Contract |
|---|---|---|
| Organizer *Analytics* tab | `GET /events/{id}/analytics`, `GET /events/{id}/analytics/sales-series?bucket=day\|hour` | `backend/ANALYTICS_API.md`, `analytics_schemas.py` |
| Organizer *Finance* tab | `GET /events/{id}/finance`, `GET`/`POST /events/{id}/finance/payouts`, `POST …/payouts/{payout_id}/simulate` | `backend/FINANCE_API.md`, `finance_api.py` |
| Event gallery (Details tab), covers on Discover and the event page | `POST /events/{id}/images`, `PUT …/images/order`, `PUT …/images/{image_id}/cover`, `DELETE …/images/{image_id}`, `GET …/images/{image_id}/content` | `catalog_schemas.py`, `event_api.py` |
| Organizer profile and member permissions | `PATCH /organizations/{id}`, `PUT /organizations/{id}/members/{member_id}/permissions` | `catalog_schemas.py`, `organization_api.py` |
| Admin paid sales | `GET /admin/events/{id}/paid-sales`, `POST …/paid-sales/suspend`, `POST …/paid-sales/reinstate` | `backend/ADMIN_API.md` |
| Admin payments | `GET /admin/payments`, `/admin/failed-payments`, `/admin/refunds`, `GET /admin/exports/{kind}.csv` | `backend/ADMIN_API.md`, `admin_commerce.py` |
| Analytics *Traffic* section, workspace GA4 panel, traffic measurements | `GET /events/{id}/analytics/traffic`, `GET`/`PUT /organizations/{id}/ga4-connection`, `POST /analytics/measurements` | `backend/ANALYTICS_API.md`, `ga4_api.py` |
| Upload limits | `GET /settings/public` | `settings_api.py` |

Rules the client follows for these screens:

- **No client-side money maths.** Totals, net, balance, payable amount and percentages are shown
  exactly as the server returns them, in the currency it reports (`moneyLabel`, `percentLabel`).
- **No assumed limits.** Upload size comes from `upload_max_bytes`; without it the client skips its
  pre-check and the server's error is shown. Fixed backend rules (PNG/JPEG for event images, the
  payout transition order) are documented beside the code that mirrors them.
- **Retries are safe.** Payout reservations and admin paid-sales decisions send an
  `Idempotency-Key` that is reused when the same request is retried.
- **Images need the session.** Image URLs are API paths. Unpublished events require the bearer
  token, so `components/ui/EventImage` fetches them through `api/files.ts` and shows an object URL.
- **Demo money is labelled.** Analytics, finance and admin payment rows show simulation or sandbox
  pills. The payout simulator buttons disappear when the server reports the simulator is off (404).

Not built in the web, by design:

- **Private-event access grants** (`PUT`/`DELETE /events/{id}/access`) take a raw user id, and there
  is no user lookup an organizer may call, so the web has no form for them yet.
- **Scanner and offline routes** (`/scanner/*`, `/events/{id}/offline-operations`) belong to the
  mobile verification app. Offline sync is outside the MVP; the web's check-in history shows the
  sync conflicts it needs.

See [CONTRACT_REVIEW.md](CONTRACT_REVIEW.md) for the promo, campaign, checkout and refund review.

---

## Tests

```bash
npm test
```

There are 438 tests in 66 files (all passing on 20 November 2026), next to the code they test
(`*.test.ts(x)`); shared fixtures are in `tests/helpers/` and the jsdom setup in `src/test/`.
They cover the API client, file downloads, idempotency keys and error messages, formatting,
checkout rules and components (steps, seating, payment) and the checkout flow hook, seat and
promo helpers, payment states, the auth context and route guards, QR codes, support threads, the
notification bell, organizer forms, charts and pagination, admin settings, the request and
countdown hooks, the app shell, the orders page, campaign workspace, promo redirect and sign-in,
refund actions, zero-total checkout, accessible dialogs, contrast, the analytics and finance tabs
(payout validation, idempotent retries, simulator states), the event gallery, organizer profile
and member permissions, admin paid-sales and payment monitoring, moderation/payout notifications,
the public-settings cache, GA4 measurements (consent, allowed routes, no Google script), the
traffic section and the GA4 connection panel, all locale catalogs and interface-string auditing.

There are no browser end-to-end tests yet (#120). Component and source checks do not certify
screen-reader behaviour or a running deployment.

The "Web" GitHub Actions workflow (`.github/workflows/web.yml`) runs on pushes and pull requests
that change `web/**` or the workflow file. On Node 22 (latest patch) it runs `npm ci`,
`npm run typecheck`, `npm test` and `npx vite build`.

The repository's `Smoke` workflow (`.github/workflows/smoke.yml`) builds the Compose stack and
runs free admission, duplicate rejection, paid activation and payment, campaign discount and
report, and refund flows through the API. It complements the web tests rather than duplicating
them. Both smoke scripts passed against the local Compose stack on 2026-11-09 over HTTP. Browser
and screen-reader acceptance remain unverified; see
[the live validation record](CONTRACT_REVIEW.md#live-validation-and-ci).

---

## What is left to do

- **Close #107 and #109, finish #108:** PR #111 delivered the gallery (cover, reorder, delete),
  both tabs on the final contracts with finance payouts, and admin commerce, but the issues are
  still open. Still missing from #108: the analytics CSV export
  (`GET /events/{id}/analytics/export.csv`).
- **Admin operations (#110):** the remaining admin searches (support cases, activations,
  campaigns, sync conflicts), order and ticket detail, outbox jobs and notification deliveries
  with audited retry.
- **Upload scan status (#112):** show pending, clean and rejected scanning states on support
  attachments.
- **HTTPS (#49):** install and validate the staged configuration with the operations owner;
  `proxy/` and the repository-level operations docs belong to `@devops`.
- **Browser tests:** Playwright runs in CI since #120 (`e2e/`: campaign link, free
  registration, paid checkout, refund). Downloads and the Kazakh and Russian interface are not
  covered yet.
- **Accessibility:** complete the browser and screen-reader column of the checklist below.

---

## Localization

The interface is available in Kazakh (`kk`), Russian (`ru`) and English (`en`).

- **Source of truth.** [translations/core.tsv](translations/core.tsv) holds every interface
  string: one row per stable key, with English, Russian and Kazakh wording (1,535 keys). It is
  shared with the mobile app; see the [translation handoff](translations/README.md).
- **Generated catalogs.** `npm run translations:build` turns the TSV into
  `src/i18n/locales/{en,ru,kk}.json`. It fails on a missing language or a duplicate key. Do not
  edit the JSON files by hand.
- **Using a string.** Components call `t("area.key", { p0: value })` from `src/i18n` and
  `useLocale()` so they re-render when the language changes. Placeholders such as `{p0}` must be
  identical in all three languages. `quantityLabel()` uses `Intl.PluralRules`, including the
  Russian one/few/many forms; dates, money and categories follow the chosen locale.
- **Choosing the language.** `LanguageSwitcher` is in the top bar and on the sign-in page. Before
  sign-in the choice is cached in local storage (falling back to the browser language, then
  English); after sign-in the profile language takes precedence, and a signed-in switch is
  applied once the profile update succeeds. Switching keeps edited fields and active holds, and
  updates the document `lang` and title.
- **What is not translated.** Request fields, enum and status values sent to the API, URLs, IDs
  and user-authored text (event descriptions, names, support messages) stay as they are. Known
  notifications are rendered from their payload in the current language, even if stored in an
  older profile language; unknown future kinds keep the server's text.
- **Audit.** `npm run translations:audit` reports interface literals that are not in the catalog
  and currently finds none. Reviewed exceptions (code, route templates, header names, brands,
  example addresses, formatting) are listed with a reason in
  `translations/technical-strings.json`. The same check runs in the test suite, together with
  catalog parity, placeholders, Russian plurals, persistent language selection, error and
  notification copy, and unchanged API enum values.

---

## Accessibility checklist

"Source checked" means labels, native control order, focus styles and shared components were
reviewed in code. It does not mean a browser or screen reader was exercised. No browser acceptance
boxes are marked complete without that evidence.

| Pages | Source checked / fixes | Browser + screen reader |
|---|---|---|
| Sign-in, registration, verification, reset, invitations | Labelled fields, translated notices, visible focus, readable supporting copy | Pending |
| Discover and event details | Labelled search/filter/calendar/report controls; skip link targets a focusable main landmark | Pending |
| Checkout, campaign redirect, payment | Promo label separated from action buttons; labelled recipients; server quote; status feedback | Pending |
| Attendee seat map | Tab/Enter/Space plus arrow keys and Home/End; unavailable seats skipped; full spoken labels | Pending |
| Tickets, QR, entry confirmation, delivery | QR labels and state text; labelled download and refresh controls | Pending |
| Orders and refund requests | Cancellation modal with Escape/cancel, safe initial focus and focus restoration | Pending |
| Account, sessions and language | Profile labels, saved language, modal for signing out every session | Pending |
| Organizer workspace and team | Labelled creation/invitation/profile forms; permission checkboxes in a fieldset with a legend; modal for removing members/invitations | Pending |
| Organizer details and ticket types | Labelled forms, native focus order, visible focus | Pending |
| Organizer seating | Native seat buttons with location/state labels and pressed state | Pending |
| Organizer paid sales and staff | Labelled actions; modal for revoking assignments | Pending |
| Organizer attendees and check-ins | Reason modal for cancellations/refunds; labelled filters and conflict forms | Pending |
| Organizer campaigns and reports | Disable confirmation modal; QR alt text; report labels | Pending |
| Organizer analytics and finance | Focusable chart bars and table alternative; labelled filters; labelled payout amount and demo actions; simulation pills in text | Pending |
| Event gallery | Required image description sent as alt text; labelled move up/down buttons; delete confirmation modal | Pending |
| Support lists, new case and thread | Form/composer/file controls labelled; state feedback preserved | Pending |
| Notifications | Labelled inbox/filter controls; translated archived content | Pending |
| Admin users/events/orders/tickets/payments/reports/settings/exports/moderation | Labelled searches, filters, forms and actions; tablist for payment lists; readable pills | Pending |

Shared colour tests require at least 4.5:1 for body/meta/placeholder/error text and all pill tones,
and at least 3:1 for control borders and focus outlines. The focus ring uses two colours so it is
visible on dark and light surfaces. All native `window.confirm` / `window.prompt` calls were
replaced with one modal dialog implementation. The 18 colour tests and keyboard/dialog tests pass.

## HTTPS handoff

The staged [Caddyfile](operations/Caddyfile.demo) and
[operations guide](docs/operations/https.md) include HTTPS on `DEMO_HOST`, HSTS on HTTPS only,
CSP, frame restrictions, referrer policy and MIME sniffing protection. They preserve local HTTP
on port 8080 and allow same-origin APIs, system fonts, inline SVG and blob QR previews.
They have not been installed or validated in the running proxy (#49).
The observed local proxy currently sends none of the four non-HSTS security headers.

## Downloads and idempotency

All binary transfers use `src/api/files.ts`, including PDF and calendar downloads,
CSV exports, campaign QR images and uploads. It handles authentication refresh,
server-provided filenames (including UTF-8 filenames), and browser downloads.

Holds, free confirmation, paid checkout, activation, payment retries, payout reservations and admin
paid-sales decisions send an `Idempotency-Key` header. Each API invocation generates a fresh UUID, which is
preserved through the automatic authentication retry. These functions also accept
an explicit key: reuse the original key when retrying the same action; use a new
key when the action or payload changes.

The public event page displays readable publication labels: Draft, Published,
Unpublished and Cancelled.

## Optional GA4 traffic collection

GA4 (Google Analytics 4) measures website traffic; it does not replace the
organizer sales and attendance reports calculated from BiletFlow records. It is
off by default (`GA4_ENABLED=false` on the backend) and is configured only on the
server; see [ANALYTICS_API.md](../backend/ANALYTICS_API.md#ga4-traffic-and-funnel-integration-71).

The browser never loads a Google script and never talks to Google. For a
signed-in person who allowed traffic analytics in Account, the web posts
measurements to `POST /api/v1/analytics/measurements` (the contract the mobile
app uses too), and the server forwards them to GA4 when the event's
organization is connected:

| Measurement | When |
|---|---|
| `event_view` | A public event page (`/events/:eventId`) opens, once per visit |
| `campaign_landing` | A campaign link (`/c/:token`) resolves |
| `checkout_start` | Tickets are held |

Only the event ID, a random measurement ID, `platform: "web"` and the route
template (`/events/event`, `/c/campaign`) are sent. Anonymous visitors, people
without consent, and account, order, ticket, support, authentication and admin
routes are never measured. A refused or failed measurement never affects the page.

Organization owners connect or disconnect their events in the organizer
workspace (Google Analytics panel); while GA4 is off for the platform the panel
says so and offers no switch. Each event's Analytics tab has a Traffic section
that shows the funnel counts, or says plainly that GA4 is off, not connected or
unreachable (never zeros). Live collection and reporting have not been verified
with a configured property.
