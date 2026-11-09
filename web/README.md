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
6. [Screens waiting for the backend](#screens-waiting-for-the-backend)
7. [Tests](#tests)
8. [What is left to do](#what-is-left-to-do)

---

## Status

- **Every screen in the current scope exists.** Screens backed by an existing API are fully
  wired: sign-in and account, discovery, event pages, free and simulated paid checkout, seat map,
  tickets (QR, PDF, delivery, entry confirmation), orders, calendar export, event reports,
  support, notifications, organizer workspace and event management, check-in history, paid-sales
  activation, seating setup and the platform admin portal.
- **Campaigns, promo checkout and refunds** now follow the merged backend contracts, including
  server pricing, zero-total checkout, campaign reports and refund support-case links.
- **Three areas still need backend endpoints:** analytics, finance and event image upload.
- **Kazakh, Russian and English** interface catalogs, profile language selection and localized
  dates, money, categories, statuses and notifications are implemented. The shared mobile handoff
  is [translations/core.tsv](translations/core.tsv).
- **Accessibility fixes** include contrast, visible focus, labelled controls, keyboard seating
  and native modal action dialogs. Browser/screen-reader acceptance and live Docker verification
  remain outstanding; see the checklists below.

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
| `npm test` | Vitest unit and component tests |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |

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
    errors.ts           Backend error code → user-facing message
    types/              Request/response types, one file per area
  components/
    ui/                 Shared building blocks: Button, PageHeading, Panel, StatusPill, EventCard,
                        DateTile, Field, Tabs, Feedback (Loading/ErrorPanel/EmptyState), Toast,
                        NotAvailableYet
    layout/             AppShell, TopBar, AvatarMenu, phone TabBar, navigation, RequireAuth
  features/             One folder per area, each with its pages, components, hooks and helpers
    auth/  discover/  events/  checkout/  tickets/  orders/  account/
    support/  notifications/  organizer/  admin/
  hooks/                useRequest (load with loading/error/reload), useCountdown
  utils/                Formatting (dates, money, seats) and status → pill tone
  styles/               tokens.css (colours, type, spacing), base, layout, components,
                        and one stylesheet per feature; index.css imports them in order
```

`features/organizer/event/` holds one file per event tab (Details, Ticket types, Seating, Paid
sales, Attendees, Check-ins, Staff, Campaigns, Analytics, Finance, History).

---

## How to add or change a screen

1. **Put it in the right feature folder.** A page component goes in `features/<area>/`, its parts
   in `features/<area>/components/`. Keep files small (roughly under 200 lines) and one component
   per file.
2. **Call the API through `src/api/`.** Add a function to the area's module that wraps
   `request()` from `api/client.ts`, and add its types to `api/types/<area>.ts`. Never call `fetch`
   directly from a component.
3. **Load data with `useRequest`** and show `Loading`, `ErrorPanel` and `EmptyState` from
   `components/ui`.
4. **Show errors with `describeError`.** If the backend returns a new error code, add its message
   to `api/errors.ts`.
5. **Use the shared components** (`PageHeading`, `Panel`, `StatusPill`, `Button`, fields) instead
   of new markup. Use `utils/status.ts` to pick a pill tone for a ticket, order or event state.
6. **Style with tokens.** Use the CSS variables in `styles/tokens.css`; do not add new hex colours
   or pixel font sizes. Add feature styles to that feature's stylesheet.
7. **Register routes** in `app/routes.tsx` (or the feature's `routes.tsx`), and add primary
   sections to `components/layout/navigation.ts`.
8. **For an endpoint the backend has not built yet**, call it anyway and check
   `isNotImplemented(error)` from `api/errors.ts`; when it is true, render `NotAvailableYet`.
   Never show sample data in its place.

---

## Routes

| Path | Who | Page |
|---|---|---|
| `/sign-in` | Anyone | Sign in, create account, forgot password, resend verification, Google |
| `/verify-email#token=`, `/reset-password#token=` | Anyone | Pages opened from emailed links |
| `/discover` | Anyone | Published events with search and category filter |
| `/events/:eventId` | Anyone | Event details, tickets, seat map, promo code, calendar, report, get help |
| `/c/:token` | Anyone | Campaign QR link: resolves the promo and opens the event |
| `/tickets`, `/tickets/:ticketId` | Signed in | Tickets: QR, PDF, delivery, admission status, entry confirmation |
| `/orders`, `/orders/:orderId` | Signed in | Orders: totals, payment status, retry, refunds |
| `/support`, `/support/new`, `/support/cases/:caseId` | Signed in | Support cases and threads |
| `/notifications` | Signed in | Notification inbox |
| `/organizer` | Signed in | Workspaces, events grouped by status, team and invitations |
| `/organizer/events/:eventId` | Signed in | Event management tabs |
| `/staff-invitations/accept#token=` | Signed in | Join a workspace from an invitation |
| `/account` | Signed in | Profile, language preference, sessions |
| `/admin/users`, `/events`, `/orders`, `/tickets`, `/reports`, `/moderation`, `/settings`, `/exports` | Platform admins | Admin portal (the Admin tab is shown only to admins) |

The backend links emails to `/verify-email`, `/reset-password`, `/staff-invitations/accept`,
`/tickets/:id`, `/events/:id` and `/support/cases/:id` — keep those paths stable. Caddy falls back to
`index.html` for unknown paths so deep links work.

---

## Screens waiting for the backend

These three screens still use planned contracts and show "Not available yet" until their
endpoints exist. Their shapes must be confirmed when the backend is implemented. The fetched
`origin/main` at `eec9a75` contains campaigns and refunds, but no `ANALYTICS_API.md`, final finance
contract or event-image upload route. See [CONTRACT_REVIEW.md](CONTRACT_REVIEW.md).

| Screen | Endpoints it calls |
|---|---|
| Organizer *Analytics* tab | `GET /events/{id}/analytics?from=&to=&ticket_type_id=&campaign_id=`, `GET /events/{id}/analytics/sales-series?bucket=day\|hour` |
| Organizer *Finance* tab | `GET /events/{id}/finance` |
| Event image upload | `POST /events/{id}/images` |

Planned types are in `src/api/types/{analytics,finance}.ts`; the image type is beside its API
function. Confirmed promo/campaign/checkout/refund contracts are in `src/api/types/`.

---

## Tests

```bash
npm test
```

There are 391 tests in 55 files, next to the code they test (`*.test.ts(x)`); shared fixtures
are in `tests/helpers/`. They cover the API client and error messages, formatting, checkout rules
and components (steps, seating, payment) and the checkout flow hook, seat and promo helpers,
payment states, the auth context and route guards, QR codes, support threads, the notification
bell, organizer forms, charts and pagination, admin settings, the request and countdown hooks, the
app shell, the orders page, campaign workspace, promo redirect/sign-in, refund actions,
zero-total checkout, accessible dialogs, contrast, all locale catalogs and interface-string auditing.

There are no full browser end-to-end tests yet. Component and source checks do not certify
screen-reader behaviour or a running deployment.

The "Web" GitHub Actions workflow (`.github/workflows/web.yml`) runs on pushes and pull requests
that change `web/**` or the workflow file. On Node 22 (latest patch) it runs `npm ci`,
`npm run typecheck`, `npm test` and `npx vite build`.

The fetched main branch also has Adil's `Smoke` workflow: it builds Compose and runs free
admission, duplicate rejection, paid activation/payment, campaign discount/report and refund
flows. It was reviewed rather than duplicated. Both scripts passed against the local Compose
stack on 2026-11-09 over HTTP, despite direct Docker engine access being denied. The proxy was
serving the current production build. GitHub job status and browser/screen-reader acceptance
remain unverified; see [the live validation record](CONTRACT_REVIEW.md#live-validation-and-ci).

---

## What is left to do

- **Browser verification:** API smoke flows have passed; exercise the actual checkout screens,
  downloads and all locales in a browser. Chrome/Edge automation could not attach successfully
  in this session, so no browser acceptance is claimed.
- **Accessibility:** complete the browser and screen-reader column of the checklist below.
- **Backend-dependent:** integrate analytics, finance and image upload when final contracts land.
- **HTTPS:** install and validate the staged configuration with the operations owner. The current
  directory restriction prevents editing `proxy/` or the repository-level operations docs.
- **Browser tests:** add full browser automation alongside the existing API smoke coverage.

## Translation setup

The 1,365 shared keys and en/ru/kk wording are in [translations/core.tsv](translations/core.tsv).
The generated catalogs are `src/i18n/locales/{en,ru,kk}.json`; see the
[translation handoff](translations/README.md) for Adil and future changes.

```bash
npm run translations:build
npm run translations:audit
```

The audit currently finds no unreviewed interface literals. Reviewed exceptions identify code,
route/header names, brands, example addresses and formatting. They are not untranslated UI copy.
User-authored text and unknown future server content remain original data. Known notifications
are rendered in the currently selected language even if stored in an older profile language.

Profile language takes precedence after sign-in; anonymous choices are cached locally. Switching
language preserves edited fields and active holds. Tests verify catalog parity, placeholders,
Russian plural forms, persistent language selection, existing error messages, notification copy
and unchanged API enum values while the interface is translated.

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
They have not been installed or validated in the running proxy.
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
a configured property. Traffic is viewed in GA4; an organizer traffic dashboard
still requires backend reporting integration. Never put service-account
credentials or API secrets in Vite environment variables.
