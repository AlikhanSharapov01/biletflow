# BiletFlow web

The browser client for organizers and attendees. It is a React 19 single-page application
written in TypeScript, bundled by Vite, and routed on the client with React Router. It talks
to the FastAPI backend through the same-origin `/api` proxy and covers every attendee and
organizer flow the backend currently exposes.

For native development use Node.js 22.12 or newer. The Docker build already supplies a
compatible Node 22 environment and runs `npm ci && npm run build` for Caddy.

## Run it

Start the backend from the repository root:

```sh
docker compose up --build -d db migrate api worker mailpit
```

Then, from this directory:

```sh
cp .env.example .env
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` and `/health/*` to the backend address in
`VITE_API_PROXY_TARGET`, which defaults to `http://localhost:8000`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite development server with hot reload and the API proxy |
| `npm run typecheck` | TypeScript check in strict mode |
| `npm test` | Vitest unit and component tests (jsdom) |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |

Do not commit `dist/`; the root proxy image builds it and copies it into Caddy. After changing
the web client, rebuild that image from the repository root with
`docker compose up --build -d proxy`.

## Routes

| Path | Who | Page |
|---|---|---|
| `/sign-in` | Anyone | Email/password sign-in, registration, password-reset request, verification resend, Google sign-in |
| `/verify-email#token=` | Anyone | Confirms the email address from the emailed link |
| `/reset-password#token=` | Anyone | Sets a new password from the emailed link |
| `/discover` | Anyone | Published events with title search and category filter, kept in the URL (`?q=&category=`) |
| `/events/:eventId` | Anyone | Event details and, when signed in, free ticket reservation |
| `/tickets`, `/tickets/:ticketId` | Signed in | Tickets claimed by this account; the detail page shows the QR code and prints |
| `/orders`, `/orders/:orderId` | Signed in | Registrations made by this account and the tickets they issued |
| `/organizer` | Signed in | Organizer workspaces, event list, event creation, team members and invitations |
| `/organizer/events/:eventId` | Signed in | Event management: details, ticket types, attendees, staff, history |
| `/staff-invitations/accept#token=` | Signed in | Joins a workspace from an invitation email |
| `/account` | Signed in | Profile editing, signed-in sessions, revoke, sign out everywhere |

Discovery and event pages work without an account, so event links can be shared and later used
as campaign QR targets. Protected routes send anonymous visitors to `/sign-in` and return them
afterwards. Unknown paths redirect to `/discover`; the Caddy config already falls back to
`index.html` for client-side routing. The backend builds the three `#token=` links with
`FRONTEND_URL`, which is `http://localhost:8080` in the Compose stack and
`http://localhost:5173` for native backend runs.

## Flows covered

**Attendee.** Sign up, verify, sign in. Find an event, choose quantities of free tickets, hold
them for ten minutes (a countdown shows the deadline), name a recipient per ticket, confirm.
The order page lists each ticket; the recipient's own tickets open a page with the signed QR
code the scanner app verifies, and **Print ticket** uses a print stylesheet with a large
grayscale-safe QR. Tickets sent to another email appear under **My tickets** after that person
signs in, because the page claims them first. Paid ticket types are listed but marked
unavailable until the backend's paid checkout exists.

**Organizer.** Create a workspace, invite colleagues by email and remove members. Create an
event draft (a free RSVP ticket type is added automatically), then manage it on its own page:
edit every field including visibility and the registration, admission and refund windows; add
and edit ticket types; see issued tickets with their check-in status; assign team members to
the event with capabilities such as **Scan tickets**, which makes the event appear in the mobile
scanner app; read the immutable activity history; publish, unpublish, duplicate or cancel.

## Source layout

```text
src/
  main.tsx              React entry point, imports styles.css
  App.tsx               Router, providers and the route table
  api/
    client.ts           fetch wrapper: bearer token, one refresh-and-retry on 401, ApiError
    session.ts          in-memory access token and expiry listeners
    errors.ts           backend error codes mapped to messages
    types.ts            response and request shapes mirrored from the backend schemas
    auth.ts, catalog.ts, checkout.ts   typed API functions per backend area
  auth/
    AuthContext.tsx     session restore, sign-in, sign-out, profile state
    googleCallback.ts   reads and strips Google redirect parameters
  components/
    AppShell.tsx        sidebar layout; RequireAuth.tsx guards routes; Toast.tsx notifications
    CheckoutPanel.tsx   quantity selection, hold countdown, recipients, confirmation
    EventForm.tsx, TicketTypeForm.tsx   shared create/edit forms
    TicketQr.tsx        renders the signed QR payload
  hooks/                useRequest (load with stale-response protection), useCountdown
  pages/                one component per route; TokenPages.tsx holds the emailed-link pages
  utils/
    format.ts           dates, prices, seats, hash tokens
    checkout.ts         availability rules, hold lines, recipient payloads
    eventForm.ts        form models to backend payloads with validation
  test/setup.ts         Testing Library cleanup
```

Tests sit next to the code they cover (`*.test.ts`, `*.test.tsx`). The pure helpers in
`utils/` carry the business rules so they can be tested without a browser.

## Sessions and Google sign-in

Successful sign-in loads the profile from `/api/v1/me`. The access token stays in memory and
is attached by `api/client.ts`; the HttpOnly refresh cookie restores it after a reload. On a
401 the client refreshes once and retries. If the refresh fails, the auth context signs the
user out and the sign-in page explains why.

Google sign-in requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the backend
environment. Register the web app root as the Google OAuth redirect URI and set the exact same
value for `GOOGLE_REDIRECT_URI`: `http://localhost:5173/` with Vite or `http://localhost:8080/`
with the full Caddy stack. Google returns `code` and `state` to the browser root; the auth
context removes them from the address bar and completes the backend callback through the
same-origin `/api` proxy. Keep the browser and API on the same `localhost` host so the OAuth
binding and refresh cookies work. See the backend README’s **Enable Google sign-in** section
for provider setup.

## Waiting on the backend

These SRS features have no API yet, so the web has no screen for them: paid-sales activation
and paid checkout, promo codes and campaign QR codes, server-generated PDF tickets, support
cases, organizer analytics, platform administration, calendar export, and the assigned-seating
seat map (events configured with assigned seating show a notice instead of a checkout).
Kazakh and Russian interface text is also still to do.
