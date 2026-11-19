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
6. [Screens still on planned contracts](#screens-still-on-planned-contracts)
7. [Tests](#tests)
8. [What is left to do](#what-is-left-to-do)
9. [Localization](#localization)
10. [Accessibility checklist](#accessibility-checklist)
11. [HTTPS handoff](#https-handoff)
12. [Downloads and idempotency](#downloads-and-idempotency)
13. [Optional GA4 traffic collection](#optional-ga4-traffic-collection)

---

## Status

Checked against `main` at `ad5b53c` on 19 November 2026.

**Wired to the live backend**

- **Every screen in the current scope exists**, and the backend now serves every endpoint the
  web calls. Sign-in and account, discovery, event pages, free and simulated paid checkout, seat
  map, tickets (QR, PDF, delivery, entry confirmation), orders, calendar export, event reports,
  support, notifications, organizer workspace and event management, check-in history and CSV,
  paid-sales activation, seating setup and the platform admin portal (user/event/order/ticket
  search, user and event suspension, reports, moderation log, settings, CSV exports) all use the
  final contracts.
- **Promo codes, campaigns and refunds** follow the live backend (PR #63): server pricing and
  quotes, zero-total checkout, campaign create/edit/disable, QR preview and download, campaign
  reports, campaign links that survive sign-in, buyer refund requests that open a support case,
  organizer refunds and free-ticket cancellation.
- **Downloads, idempotency keys and event labels** (PR #62): one file helper for every binary
  transfer, an `Idempotency-Key` on holds, confirmations, checkout, activation and payment
  retries, and readable publication labels on the event page. See
  [Downloads and idempotency](#downloads-and-idempotency).
- **Kazakh, Russian and English** interface catalogs with 1,365 shared keys, profile language
  selection and localized dates, money, plurals, categories, statuses and notifications. See
  [Localization](#localization).
- **Consent-aware GA4 page views**, off unless a measurement ID is configured and the user opts
  in. See [Optional GA4 traffic collection](#optional-ga4-traffic-collection).
- **391 tests in 55 files** and a **Web CI workflow** (type check, tests, production build).
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
                        DateTile, Field, Tabs, Feedback (Loading/ErrorPanel/EmptyState), Toast,
                        ActionDialog, NotAvailableYet
    layout/             AppShell, TopBar, AvatarMenu, phone TabBar, navigation, RequireAuth
  features/             One folder per area, each with its pages, components, hooks and helpers
    auth/  discover/  events/  checkout/  tickets/  orders/  account/
    support/  notifications/  organizer/  admin/
  i18n/                 t(), useLocale(), language switcher and the generated en/ru/kk catalogs
  analytics/            Consent-aware GA4 page views
  hooks/                useRequest (load with loading/error/reload), useCountdown
  utils/                Formatting (dates, money, seats) and status → pill tone
  styles/               tokens.css (colours, type, spacing), base, layout, components,
                        and one stylesheet per feature; index.css imports them in order
translations/           core.tsv (shared web/mobile strings) and the audit's reviewed exceptions
scripts/                build-locales.mjs and audit-strings.mjs
tests/helpers/          Shared test fixtures
```

`features/organizer/event/` holds one file per event tab (Details, Ticket types, Seating, Paid
sales, Attendees, Check-ins, Staff, Campaigns, Analytics, Finance, History).

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
9. **Planned endpoints.** The backend now serves every endpoint the web uses, so new screens should
   be built on the documented contract. The `Planned<T>` / `NotAvailableYet` fallback
   (`isNotImplemented(error)` in `api/errors.ts`) remains only for the screens listed under
   [Screens still on planned contracts](#screens-still-on-planned-contracts). Never show sample
   data in place of a missing endpoint.

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
| `/organizer` | Signed in | Workspaces, events grouped by status, team and invitations |
| `/organizer/events/:eventId` | Signed in | Event management tabs |
| `/staff-invitations/accept#token=` | Signed in | Join a workspace from an invitation |
| `/account` | Signed in | Profile, language preference, traffic-analytics consent, sessions |
| `/admin` → `/admin/users`, `/events`, `/orders`, `/tickets`, `/reports`, `/moderation`, `/settings`, `/exports` | Platform admins | Admin portal (the Admin tab is shown only to admins) |

The backend links emails to `/verify-email`, `/reset-password`, `/staff-invitations/accept`,
`/tickets/:id`, `/events/:id` and `/support/cases/:id` — keep those paths stable. Caddy falls back to
`index.html` for unknown paths so deep links work.

---

## Screens still on planned contracts

No screen is waiting for the backend any more. These three were written against planned
contracts before the backend existed and still use the planned types and the `Planned<T>` /
`NotAvailableYet` fallback (`features/organizer/utils/planned.ts`). The backend serves every
route they call (`backend/ANALYTICS_API.md`, `backend/FINANCE_API.md`, `backend/CATALOG_API.md`),
so the fallback no longer appears against the current backend; the screens still have to be
moved to the final types and given the features those contracts added.

| Screen | Endpoints it calls | Still to do |
|---|---|---|
| Organizer *Analytics* tab | `GET /events/{id}/analytics?from=&to=&ticket_type_id=&campaign_id=`, `GET /events/{id}/analytics/sales-series?bucket=day\|hour` | Final types, CSV export (#108) |
| Organizer *Finance* tab | `GET /events/{id}/finance` | Final summary fields, payouts (#108) |
| Event image panel (Details tab) | `POST /events/{id}/images` | Gallery list, cover, reorder, delete (#107) |

Planned types are in `src/api/types/{analytics,finance}.ts`; the image type is beside its API
function in `src/api/eventAdmin.ts`. Every other screen uses confirmed types in `src/api/types/`.
See [CONTRACT_REVIEW.md](CONTRACT_REVIEW.md) for the promo, campaign, checkout and refund review.
PR #111 moves all three screens to the final contracts.

---

## Tests

```bash
npm test
```

There are 391 tests in 55 files (all passing on 19 November 2026), next to the code they test
(`*.test.ts(x)`); shared fixtures are in `tests/helpers/` and the jsdom setup in `src/test/`.
They cover the API client, file downloads, idempotency keys and error messages, formatting,
checkout rules and components (steps, seating, payment) and the checkout flow hook, seat and
promo helpers, payment states, the auth context and route guards, QR codes, support threads, the
notification bell, organizer forms, charts and pagination, admin settings, the request and
countdown hooks, the app shell, the orders page, campaign workspace, promo redirect and sign-in,
refund actions, zero-total checkout, accessible dialogs, contrast, GA4 path sanitizing and
consent, all locale catalogs and interface-string auditing.

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

- **Gallery (#107):** list the event's images, set the cover, reorder and delete.
- **Analytics and finance (#108):** move both tabs to the final contracts, add finance payouts
  and the analytics CSV export. PR #111 covers everything here except the CSV export.
- **Admin commerce (#109):** paid-sales suspension and reinstatement, and payment, failed-payment
  and refund monitoring with CSV export. Covered by PR #111.
- **Admin operations (#110):** the remaining admin searches (support cases, activations,
  campaigns, sync conflicts), order and ticket detail, outbox jobs and notification deliveries
  with audited retry.
- **Upload scan status (#112):** show pending, clean and rejected scanning states on support
  attachments.
- **GA4 reporting (from #71):** organization connection toggle, funnel measurements through the
  backend and the organizer traffic report.
- **HTTPS (#49):** install and validate the staged configuration with the operations owner;
  `proxy/` and the repository-level operations docs belong to `@devops`.
- **Browser tests (#120):** add browser end-to-end tests in CI, then exercise checkout,
  downloads and all three languages in a real browser.
- **Accessibility:** complete the browser and screen-reader column of the checklist below.

---

## Localization

The interface is available in Kazakh (`kk`), Russian (`ru`) and English (`en`).

- **Source of truth.** [translations/core.tsv](translations/core.tsv) holds every interface
  string: one row per stable key, with English, Russian and Kazakh wording (1,365 keys). It is
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
| Organizer workspace and team | Labelled creation/invitation forms; modal for removing members/invitations | Pending |
| Organizer details and ticket types | Labelled forms, native focus order, visible focus | Pending |
| Organizer seating | Native seat buttons with location/state labels and pressed state | Pending |
| Organizer paid sales and staff | Labelled actions; modal for revoking assignments | Pending |
| Organizer attendees and check-ins | Reason modal for cancellations/refunds; labelled filters and conflict forms | Pending |
| Organizer campaigns and reports | Disable confirmation modal; QR alt text; report labels | Pending |
| Organizer analytics and finance | Focusable chart bars and table alternative; labelled filters; planned API states retained | Pending |
| Support lists, new case and thread | Form/composer/file controls labelled; state feedback preserved | Pending |
| Notifications | Labelled inbox/filter controls; translated archived content | Pending |
| Admin users/events/orders/tickets/reports/settings/exports/moderation | Labelled searches, forms and actions; readable pills | Pending |

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

Holds, free confirmation, paid checkout, activation and payment retries send an
`Idempotency-Key` header. Each API invocation generates a fresh UUID, which is
preserved through the automatic authentication retry. These functions also accept
an explicit key: reuse the original key when retrying the same action; use a new
key when the action or payload changes.

The public event page displays readable publication labels: Draft, Published,
Unpublished and Cancelled.

## Optional GA4 traffic collection

GA4 (Google Analytics 4) measures website traffic; it does not replace the
organizer sales and attendance reports calculated from BiletFlow records.

Set `VITE_GA4_MEASUREMENT_ID=G-...` in the web build environment and rebuild.
Users opt in or revoke consent through the optional traffic analytics checkbox
in Account. Without a valid measurement ID or saved consent, no Google script
is loaded. Anonymous visitors are not tracked.

Only Discover and event-detail route templates are sent. Event IDs, query
strings, hashes, search terms and original referrers are excluded. Account,
order, ticket, support, authentication and admin routes are not tracked.

In the GA4 web stream, **disable Enhanced Measurement entirely** so automatic
history, form, outbound-click and other events cannot bypass the sanitized
manual page views. Do not install a second GA/GTM tag. See Google's
[manual pageview documentation](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites).

Verify collection in GA4 Realtime with a consenting test account, then revoke
consent and verify collection stops. Live collection has not been verified with
a configured property. Never put service-account credentials or API secrets in
Vite environment variables.

The backend side of the integration (#71, `backend/ANALYTICS_API.md`) is merged:
the organization GA4 connection (`/organizations/{id}/ga4-connection`), funnel
measurements (`POST /analytics/measurements`) and cached traffic aggregates
(`GET /events/{id}/analytics/traffic`). The web does not call any of them yet,
so there is no organizer traffic view or connection toggle, and traffic is only
visible in GA4 itself.
