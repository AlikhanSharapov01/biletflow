# BiletFlow mobile app

The iOS and Android app for BiletFlow. A phone user can do **everything the web app offers**:
discover events, register or buy tickets, show tickets at the door, manage orders, open support
cases, read notifications, run an organizer workspace and use the platform admin portal. Event
staff also get the **ticket scanner**. The scope is recorded in
[`docs/decisions/0001-mobile-app-full-scope.md`](../docs/decisions/0001-mobile-app-full-scope.md):
the app is not a scanner-only client, and the mobile owner is responsible for every screen here.
A backend feature with a user-facing flow is done only once it works in both this app and the web.

Built with Expo SDK 58, React Native 0.88, TypeScript (strict) and expo-router. It uses the same
`/api/v1` endpoints, error codes and wording as the web app.

---

## Contents

1. [Status](#status)
2. [Run it](#run-it)
3. [Connecting to the backend](#connecting-to-the-backend)
4. [Tests](#tests)
5. [Folder structure](#folder-structure)
6. [How to add or change a screen](#how-to-add-or-change-a-screen)
7. [Screens](#screens)
8. [How scanning works](#how-scanning-works)
9. [What is left to do](#what-is-left-to-do)

---

## Status

The app uses the final contracts for promo campaigns, refunds, analytics, finance (summary and
payouts) and the event gallery (#51). They are covered by tests with a mocked API and still need
a click-through against `docker compose up` on a simulator or phone. Whole-project status: [integration status](../docs/integration/status.md).

| Area | State |
|---|---|
| Sign in, create account, forgot password, resend verification | Done |
| Verify email / reset password from an emailed link | Done (paste the link or its token) |
| Discover: search, category filter | Done |
| Event page: details, tickets, seat map, promo code, calendar export, report event, get help | Done |
| Free registration and simulated paid checkout | Done |
| Tickets: QR, PDF (share sheet), delivery, admission status, entry confirmation | Done |
| Orders: totals, payment retry, cancel registration, refund request | Done |
| Support cases: list, new case, thread, attachments, staff actions | Done |
| Notifications: inbox and unread badge in the top bar | Done |
| Account: profile, language, sessions, sign out everywhere | Done |
| Organizer: workspaces, team, invitations, create event, every event tab | Done |
| Platform admin portal (8 sections) | Done (shown only to platform admins); the paid-sales suspension and payment/refund monitoring added in #64 are not in the app yet |
| Scanner: scan, admit, undo, counts | Done |
| Scanner: entry confirmation (second QR or 8-digit code) | Done |
| Scanner: manual guest search | Done |
| Offline scanning (bonus) | Done (QR scans only). Whether staff may let someone in on an offline result is still open, see below |
| Google sign-in | Web only (decision 0001) |
| Kazakh, Russian and English | Done (#52): the web's catalogs plus app-only text; Account → Language |

Nothing here has been checked on a real phone yet (#53).

---

## Run it

**You need:** Node.js 22.13+ (or 24.3+), Xcode with an iOS Simulator (or Android Studio, or the
Expo Go app on a phone), and the backend running (from the repository root:
`docker compose up --build`).

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1 npx expo start
```

Then press `i` for the iOS Simulator, `a` for Android, or scan the QR code with Expo Go.

| Command | What it does |
|---|---|
| `npx expo start` | Start the development server |
| `npx expo start -c` | Same, clearing the bundler cache (use after changing `EXPO_PUBLIC_API_URL`) |
| `npm run typecheck` | Type check |
| `npm test` | Run the tests |

---

## Connecting to the backend

The app reads the API address from `EXPO_PUBLIC_API_URL` (it must end in `/api/v1`). If it is not
set, it uses `http://localhost:8000/api/v1`.

| Where the app runs | Use |
|---|---|
| iOS Simulator on the same Mac | `http://localhost:8000/api/v1` or `http://<mac-ip>:8080/api/v1` |
| Android emulator | `http://10.0.2.2:8000/api/v1` |
| Physical phone (same Wi-Fi) | `http://<computer-ip>:8080/api/v1` (through Caddy) |

Find your Mac's IP with `ipconfig getifaddr en0`.

**"Can't reach BiletFlow right now"** means the request never reached the API:

1. Check the stack is running: open `http://<computer-ip>:8080/health/ready` in the device's
   browser. It should show `{"status":"ready"}`.
2. The URL is built into the app when the bundle is created. After changing it, restart with
   `npx expo start -c`, then reload the app (press `r` in the terminal, or open the Expo developer
   menu and choose *Reload*).
3. Port `8000` is only reachable from the computer itself; phones must use `8080`.

**Accounts:** create one in the app (or on the web) and verify it through Mailpit
(<http://localhost:8025>): copy the verification link from the email and paste it into *I have a
verification link* on the sign-in screen.

---

## Tests

```bash
npm test
```

Jest with the `jest-expo` preset and React Native Testing Library. Tests sit next to the code
(`*.test.ts(x)`): 54 files. They cover:

- **Helpers ported from the web, with the web's tests:** checkout, seats, payment, promo, ticket
  status, support threads, notification targets, organizer forms, charts, history filters,
  campaigns and admin settings.
- **Screens rendered with a mocked API:** Discover, event page, checkout, campaign link, tickets,
  ticket detail, order, support case, new case, notifications, organizer workspace and event,
  ticket-type form, invitation, account, sessions, verify email, reset password and admin
  sections.
- **The scanner:** outcome messages, the check-in request body, the scan → confirmation → admit
  flow, entry-code input and guest search.
- **Shared UI:** list rows, the QR code drawing and date helpers.
- **Translations:** checkout, finance and every scanner result rendered in Kazakh and Russian with
  no English left; the web's catalogs kept identical; and `scripts/audit-strings.js`, which fails
  when new interface text is not translated.

In React Native Testing Library 14, `render` and `fireEvent` are async: write
`await render(...)` and `await fireEvent.press(...)`. Native modules without a JavaScript version
(for example `expo-secure-store`) are mocked in `jest.setup.js`.

CI (`.github/workflows/mobile.yml`) runs `npm run typecheck` and `npm test` whenever `mobile/`
changes.

---

## Folder structure

```text
src/
  app/                  expo-router routes. Each file is a one-line re-export of a screen in
    (auth)/               features/. Paths here are the app's URLs; do not rename them.
    (app)/(tabs)/         Bottom tabs: Discover, Tickets, Organizer, Check-in, Account
    (app)/…               Pushed screens: events, tickets, orders, support, notifications,
                          organizer, admin, account/sessions, c/[token], staff-invitations
  api/                  One module per backend area, ported from web/src/api (same names)
    http.ts             request(): bearer token from the keychain, one refresh retry, ApiError
    files.ts            Downloads to the share sheet, SVG text, raw-body uploads
    errors.ts           Backend error code → message; isNotImplemented() for planned endpoints
    session.ts          Shared token refresh (rotating refresh tokens)
    tokenStorage.ts     Keychain / keystore storage
    types/              Request/response types per area
  components/
    ui/                 Buttons, Panel, PageHeading, FactList, ListRow, SegmentedTabs, StatusPill,
                        QrCode, ReasonDialog, confirmAction, FormMessage, NotAvailableYet, fields…
    layout/             Screen, ScrollScreen, TopBar (bell + avatar), BackHeader, TabGlyph
  features/             One folder per area, like the web
    auth/ discover/ events/ checkout/ tickets/ orders/ support/ notifications/
    account/ organizer/ admin/ scanner/
  hooks/                useRequest, useCountdown, useAppActive
  context/              Toast provider
  theme/                Colours, fonts, radii and spacing shared with the web design
  utils/                Formatting, status tones, event times
```

---

## How to add or change a screen

1. **Route:** add a one-line file in `src/app/` that re-exports the screen, e.g.
   `export { OrdersScreen as default } from "@/features/orders/OrdersScreen";`.
2. **Screen:** put it in `features/<area>/`, its parts in `features/<area>/components/`. Keep
   files small (roughly under 200 lines), one component per file.
3. **Page frame:** use `ScrollScreen` (`header="top"` for a tab, the default "‹ Back" for a pushed
   screen).
4. **Data:** call the backend through `src/api/` and load with `useRequest`; show
   `LoadingState`, `ErrorPanel` and `EmptyState`. Show errors with `describeError`.
5. **Planned endpoints:** when `isNotImplemented(error)` is true, render `NotAvailableYet`. Never
   show sample data.
6. **Browser habits:** use `confirmAction` (not `window.confirm`), `ReasonDialog` (not
   `window.prompt`), `saveFile` for downloads, and poll only while `useAppActive()` is true.
7. **Styles:** `StyleSheet.create` with tokens from `@/theme`; no new hex colours.
8. **Navigation:** `useRouter()` with typed routes, e.g.
   `router.push({ pathname: "/orders/[orderId]", params: { orderId } })`. New routes get their
   types when `npx expo start` runs.
9. **Tests:** add a `*.test.tsx` next to the screen with the API module mocked.

---

## Screens

| Route | Screen |
|---|---|
| `/login`, `/verify-email`, `/reset-password` | Sign in / create account / forgot password; email links |
| `/` (tab) | Discover |
| `/events/[eventId]` | Event page with checkout |
| `/c/[token]` | Campaign link: opens the event with its promo code |
| `/tickets` (tab), `/tickets/[ticketId]` | Tickets and ticket detail |
| `/orders`, `/orders/[orderId]` | Orders |
| `/support`, `/support/new`, `/support/cases/[caseId]` | Support |
| `/notifications` | Notification inbox (also from the bell) |
| `/organizer` (tab), `/organizer/new-event`, `/organizer/events/[eventId]` | Organizer workspace and event management |
| `/staff-invitations/accept` | Join a workspace from an invitation link |
| `/check-in` (tab), `/events/[eventId]/scan` | Scanner |
| `/account` (tab), `/account/sessions` | Account and sessions |
| `/admin`, `/admin/[section]` | Platform admin portal |

Orders, Support, Notifications, Sessions and Admin are reached from the Account tab (and from
shortcuts on the Tickets tab and the bell).

---

## How scanning works

1. **Check-in** tab → `GET /scanner/events` lists events the user may scan (owned events, or
   staff with "Scan tickets").
2. Opening an event shows the camera and the counts (`GET /scanner/events/{id}/counts`).
3. A scanned QR is sent unchanged to `POST /scanner/events/{id}/check-ins` with a fresh
   `operation_id`, so a retried request cannot admit twice.
4. **Entry confirmation:** when the backend requires one (`ADMISSION_REQUIRE_ENTRY_CONFIRMATION`,
   on by default), the result asks for it. The guest opens their ticket and shows the entry
   confirmation; staff scan that second QR or type its 8-digit code, and the app sends it with the
   ticket.
5. **Find guest by name:** searches `GET /scanner/events/{id}/attendees` (name or exact email)
   and checks in by ticket id, with the same rules as a scan.
6. *Undo* calls `POST /scanner/check-ins/{id}/reverse` with a reason.
7. **Offline:** while online, *Prepare for offline* registers the phone and saves the event's
   signed list. If a scan then can't reach the server, the app checks the ticket and the guest's
   entry confirmation QR on the phone and queues the scan. Queued scans upload with
   `POST /scanner/offline/sync` on *Sync now*, or by themselves once the server answers again. An
   offline result is provisional until then. Typed codes, guest search and undo need a connection.

   **Open question:** a passing offline scan currently shows "Accepted offline" in the admitted
   style. The requirements and the backend contract say physical entry still needs online
   confirmation. Which rule applies, and what a later sync conflict means for someone already let
   in, is listed in [decision 0002](../docs/decisions/0002-decisions-to-confirm.md#a-offline-admission-semantics).
   Change the screen once that is answered.

Campaign (promo) QR codes are rejected as "Not a ticket". The full contract is in
[`backend/ADMISSION_API.md`](../backend/ADMISSION_API.md).

---

## What is left to do

- **Check the connected APIs (#51):** click promo, campaigns, refunds, analytics, finance and
  the event gallery through against `docker compose up`. The event page does not show the cover
  image yet. Also add the admin paid-sales and payment/refund
  monitoring screens from `backend/ADMIN_API.md`, which no issue covers yet.
- **Translation review (#52):** the app-only Kazakh and Russian text
  (`src/i18n/locales/mobile/`) was written by the developer, not a native speaker; have it read.
- **Device checks (#53):** the share sheet (PDF, calendar, CSV), document picker, clipboard and
  camera have been tested with mocks. Click them through on a real iPhone and Android phone.
- **Installable builds (#54).**
- **Optional clean-up:** renaming the session kind `scanner` to something like `native` in the
  backend (decision 0001).
- **Offline entry rule:** update the offline result screen once decision 0002 is answered.
- **Out of scope for now (decision 0001):** push notifications, Google sign-in on mobile, offline
  browsing, app-store publication.
