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
- **Five areas are built against planned APIs** and show a "Not available yet" state until the
  backend ships them: promo campaigns and codes, analytics, finance, refund/cancellation actions
  and event image upload.
- **Missing:** Kazakh and Russian interface text, an accessibility pass, end-to-end tests and
  page-level tests for most pages.

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

These screens are finished on the web side and call the endpoints below. Until the backend
implements them they show "Not available yet". **The request/response shapes were designed on
the web side and must be confirmed (or adjusted) when the backend is built.**

| Screen | Endpoints it calls |
|---|---|
| Promo code at checkout | `GET /events/{id}/promo-codes/{code}/preview`; `promo_code` in the hold request |
| Campaign QR link | `GET /campaign-links/{token}` → `{event_id, code}` |
| Organizer *Campaigns* tab | `GET/POST /events/{id}/campaigns`, `PUT …/{cid}`, `POST …/{cid}/disable`, `GET …/{cid}/qr.svg`, `GET …/{cid}/report` |
| Organizer *Analytics* tab | `GET /events/{id}/analytics?from=&to=&ticket_type_id=&campaign_id=`, `GET /events/{id}/analytics/sales-series?bucket=day\|hour` |
| Organizer *Finance* tab | `GET /events/{id}/finance` |
| Refund / cancel (attendee order page) | `POST /orders/{id}/refund-requests`, `POST /orders/{id}/cancel` with `{reason}` |
| Refund / cancel (organizer attendees) | `POST /orders/{id}/refunds`, `POST /events/{id}/tickets/{ticket_id}/cancel` with `{reason}` |
| Event image upload | `POST /events/{id}/images` |

Exact types are in `src/api/types/{promo,campaigns,analytics,finance}.ts`.

---

## Tests

```bash
npm test
```

There are 331 tests in 43 files, next to the code they test (`*.test.ts(x)`); shared fixtures
are in `tests/helpers/`. They cover the API client and error messages, formatting, checkout rules
and components (steps, seating, payment) and the checkout flow hook, seat and promo helpers,
payment states, the auth context and route guards, QR codes, support threads, the notification
bell, organizer forms, charts and pagination, admin settings, the request and countdown hooks, the
app shell, and one page-level test for the orders page.

There are no end-to-end browser tests yet. Apart from the orders page, pages have no page-level
tests, including the organizer tabs, support, admin, event and ticket pages.

The "Web" GitHub Actions workflow (`.github/workflows/web.yml`) runs on pushes and pull requests
that change `web/**` or the workflow file. On Node 22 (latest patch) it runs `npm ci`,
`npm run typecheck`, `npm test` and `npx vite build`.

---

## What is left to do

- **Translations:** all interface text is English. Add Kazakh and Russian (with English as the
  extra locale), use the saved profile language, and show category names in the chosen language.
- **Accessibility (WCAG 2.1 AA):** check contrast, focus order and labels across the new screens;
  replace `window.confirm` with an accessible dialog.
- **Tests:** page-level tests for checkout, the organizer tabs, support, admin, event and ticket pages;
  end-to-end tests for the core flow (create event → register → ticket → scan).
- **Backend-dependent:** once the endpoints in the table above exist, confirm the shapes and remove
  any adjustments; then test promo, analytics, finance and refunds end to end.
- **Small clean-ups:** merge the two blob-download helpers (`api/download.ts` and `api/files.ts`);
  show the event status on the public event page as a readable label; send an `Idempotency-Key`
  header on holds, checkout and activation once `request()` supports custom headers.
- **Not yet clicked through manually:** paid checkout with the simulator, the seat map, PDF/CSV
  downloads.
