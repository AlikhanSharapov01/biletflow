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
4. [Installable builds](#installable-builds)
5. [Tests](#tests)
6. [Folder structure](#folder-structure)
7. [How to add or change a screen](#how-to-add-or-change-a-screen)
8. [Screens](#screens)
9. [How scanning works](#how-scanning-works)
10. [What is left to do](#what-is-left-to-do)

---

## Status

Checked against the code on 19 November 2026. Whole-project status:
[integration status](../docs/integration/status.md).

Since 8 November the app has been connected to the final contracts for promo campaigns, refunds,
analytics, finance (summary and payouts) and the event gallery (#51, PR #97), translated (#52,
PR #98 and #100), given one shared payment panel (#55, PR #99) and installable builds (#54,
PR #101). Later PRs added moderation notices and the hold time from the settings (PR #105), the
admin payments, refunds and paid-sales suspension (#113, PR #126), and event covers with the
analytics CSV export (#114, PR #127). Offline QR scanning came earlier, in PR #59.

How far each part was checked: the main screens have tests with a mocked API, and PRs #97, #105,
#126 and #127 compared the real responses from `docker compose up` with the app's types. Checkout and the payment panel,
covers, the analytics CSV, the Russian interface and a local Android release build were also
clicked through on an Android emulator. Campaigns, refunds, finance and payouts, and the gallery
upload were checked against the API but not clicked through on screen.

| Area | State |
|---|---|
| Sign in, create account, forgot password, resend verification | Done |
| Verify email / reset password from an emailed link | Done (paste the link or its token) |
| Discover: search, category filter, gallery cover on each card | Done |
| Event page: cover image, details, tickets, seat map, promo code, calendar export, report event, get help | Done |
| Free registration and simulated paid checkout | Done. Checkout and the order screen share one payment panel (#55); the "held for N minutes" line reads the platform hold time from `GET /settings/public` |
| Tickets: QR, PDF (share sheet), delivery, admission status, entry confirmation | Done |
| Orders: totals, payment retry, cancel registration, refund request | Done |
| Support cases: list, new case, thread, attachments ("Checking file…" while the virus scan is pending, then Ready or Blocked), staff actions | Done (#116) |
| Notifications: inbox and unread badge in the top bar; moderation notices open the organizer's event or the account | Done |
| Account: profile, language, traffic-analytics consent, sessions, sign out everywhere | Done |
| Organizer: workspaces, team, invitations, create event, all 11 event tabs (campaigns, analytics with CSV export and GA4 traffic, finance and payouts, gallery, offline sync conflicts) | Done |
| Platform admin portal (11 sections) | Done, shown only to platform admins: payments, failed payments and refunds with exact filters and CSV export, and suspend/reinstate of an event's paid sales (#113); read-only inspection of support cases, orders, activations, campaigns and sync conflicts, and jobs and deliveries with retry (#116) |
| Scanner: scan, admit, undo, counts | Done |
| Scanner: entry confirmation (second QR or 8-digit code) | Done |
| Scanner: manual guest search | Done |
| Offline scanning (bonus) | Done for QR scans. A passing offline scan reads "Looks valid – connect to confirm entry" and never lets anyone in ([decision 0003](../docs/decisions/0003-confirmed-decisions.md), #115), see [How scanning works](#how-scanning-works) |
| Installable builds: EAS profiles, icon, splash | Done for Android (local release build tested on an emulator). No iOS build has been made: it needs the team's Expo and Apple accounts |
| Google sign-in | Web only (decision 0001) |
| Kazakh, Russian and English | Done (#52, #133): the web's catalogs plus app-only text; Account → Language |

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

Then press `i` for the iOS Simulator or `a` for Android. Because `expo-dev-client` is installed,
`npx expo start` serves a **development build** first: `i` and `a` open the development build when
one is installed on that simulator or emulator, and fall back to Expo Go otherwise. To use Expo Go
on a phone, press `s` to switch to Expo Go before scanning the QR code.

**Development build on the iOS Simulator (EAS).** Expo Go works for most screens, but a
development build is the BiletFlow app itself (its own icon, identifier and native settings) that
still loads code from your Metro server. The simulator build needs an Expo account, not an Apple
developer account:

```bash
cd mobile
npx eas-cli login
npx eas-cli init            # once: links the project and adds its id to app.json
npx eas-cli build --profile development-simulator --platform ios
npx eas-cli build:run --platform ios --latest   # install the finished build on the simulator
npx expo start              # then press i
```

For Android, `--profile development --platform android` gives an APK for an emulator or phone.
The API address of a development build comes from `EXPO_PUBLIC_API_URL` when Metro starts, as
above, so one build works with any backend. The project has not been linked to an EAS account yet
(`app.json` has no project id); the first `eas-cli init` adds it. More profiles are in
[Installable builds](#installable-builds).

| Command | What it does |
|---|---|
| `npx expo start` | Start the development server |
| `npx expo start -c` | Same, clearing the bundler cache (use after changing `EXPO_PUBLIC_API_URL`) |
| `npm run typecheck` | Type check |
| `npm test` | Run the tests |
| `node scripts/audit-strings.js` | List interface text that is not translated (also part of `npm test`) |

After pulling, run `npm ci` again when `package-lock.json` changed. For example,
`offlineVerify.test.ts` and the type check fail with `Cannot find module '@noble/curves/ed25519'`
on an older install.

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
4. On an Android emulator where `10.0.2.2` requests hang, tunnel the port instead:
   `adb reverse tcp:8000 tcp:8000`, then use `http://localhost:8000/api/v1`.

**Accounts:** create one in the app (or on the web) and verify it through Mailpit
(<http://localhost:8025>): copy the verification link from the email and paste it into *I have a
verification link* on the sign-in screen.

---

## Installable builds

Builds install like a normal app, with the BiletFlow icon, so testers don't need Expo Go. The
API address is built in, so each build points at one backend.

| Profile (`eas.json`) | What it is | Use it for |
|---|---|---|
| `development` | Development client (APK on Android) that loads code from `npx expo start` | Developers; any API address via `EXPO_PUBLIC_API_URL` when starting Metro |
| `development-simulator` | The same for the iOS Simulator | Developers on a Mac |
| `preview` | Standalone app (APK on Android) with the code inside | Testers and demos |
| `production` | Store build | Later, if the app is published |

**With EAS (iOS and Android, built in the cloud).** You need an Expo account; iOS device builds
also need an Apple developer account.

```bash
cd mobile
npx eas-cli login
npx eas-cli init            # once: links the project and adds its id to app.json
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL \
  --value http://<server-ip>:8080/api/v1 --visibility plaintext
npx eas-cli build --profile preview --platform android   # or ios, or all
```

EAS prints a link and QR code to install the build. Set `EXPO_PUBLIC_API_URL` for each environment
(`development`, `preview`, `production`) the same way. The `development` and
`development-simulator` profiles are described in [Run it](#run-it). So far only a local Android
release build has been made (below); no EAS build has been run.

**Locally (Android only, on any OS).** You need Android Studio's SDK and JDK 17 or newer.

```bash
cd mobile
npx expo prebuild --platform android --clean      # writes android/, which git ignores
cd android
EXPO_PUBLIC_API_URL=http://<server-ip>:8080/api/v1 ./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk; install with: adb install -r <that file>
```

This release APK is signed with the debug key from the template, which is fine for testing but not
for a store. `npx expo run:android` builds and installs the development client instead. iOS builds
need a Mac with Xcode (`npx expo run:ios`) or EAS.

**On Windows**, native compilation can fail with `ninja: error: mkdir(...): No such file or
directory`: React Native's generated build folders pass Windows' 260-character path limit, and the
Ninja 1.10 bundled with the SDK's CMake 3.22 cannot use long paths. What worked:

1. Turn on *Enable Win32 long paths* in Windows (needs admin once).
2. Clone the repository to a short folder, such as `C:\bf`.
3. Download CMake 3.31 or newer and Ninja 1.12 or newer, put `ninja.exe` in CMake's `bin` folder, and
   add `cmake.dir=C\:/path/to/cmake-3.31.6-windows-x86_64` to `android/local.properties`.

A `subst` drive letter does not help: Gradle then sees the project and `node_modules` on different
drives. macOS and Linux do not have this problem.

The app identifier is `kz.biletflow.app` on both platforms. The demo API is plain HTTP, so builds
allow cleartext traffic (`expo-build-properties` on Android, `NSAppTransportSecurity` on iOS);
remove that once the server has HTTPS (#49). The icon, adaptive icon and splash image in
`assets/images/` are drawn from the app's brand mark (`components/ui/Brand.tsx`) in Noto Serif.

---

## Tests

```bash
npm test
```

Jest with the `jest-expo` preset and React Native Testing Library. Tests sit next to the code
(`*.test.ts(x)`): **66 files, 277 tests**, all passing on 20 November 2026. They cover:

- **Helpers ported from the web, with the web's tests:** checkout, seats, payment, promo, the
  hold time, ticket status, order summary, support threads, notification targets, organizer
  forms, charts, history filters, campaigns, admin settings and admin payment filters.
- **Screens rendered with a mocked API:** Discover, event page and its cover, checkout and the
  shared payment panel, campaign link, tickets, ticket detail, order, support case, new case,
  notifications (including moderation notices), organizer workspace and event, the Campaigns,
  Analytics (with CSV export) and Finance tabs, the event gallery, ticket-type form, invitation,
  account, sessions, verify email, reset password, admin sections, and admin payments, refunds
  and paid-sales suspension.
- **The scanner:** outcome messages, the check-in request body, the scan → confirmation → admit
  flow, entry-code input and guest search.
- **Offline scanning:** the local check (signed entry confirmation, tampered or wrong-ticket
  confirmations, expiry slack, duplicates, revoked tickets, admission window), saving a scan to
  the queue before it is shown, and uploading the queue.
- **Shared UI and API:** list rows, the QR code drawing, date helpers and idempotency keys.
- **Translations:** checkout, finance and the scanner's error results rendered in Kazakh and
  Russian with no English left; the web's catalogs kept identical; and `scripts/audit-strings.js`,
  which fails when new interface text is not translated. The offline result and the seat line are
  in the Kazakh/Russian check, and the audit also catches text added with `lines.push(...)` (#133).

`src/i18n/catalogs.test.ts` compares the app's catalogs with `web/src/i18n/locales/`, so run the
tests from a full checkout of the repository, not from a copy of `mobile/` alone.

In React Native Testing Library 14, `render` and `fireEvent` are async: write
`await render(...)` and `await fireEvent.press(...)`. Native modules without a JavaScript version
(for example `expo-secure-store`) are mocked in `jest.setup.js`.

CI (`.github/workflows/mobile.yml`) runs `npm ci`, `npm run typecheck` and `npm test -- --ci` on
Node 22.13 for every push and pull request that changes `mobile/` or the workflow. A change to
the web's catalogs alone does not start it, even though `catalogs.test.ts` reads them.

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
    errors.ts           Backend error code → message
    offline.ts          Offline scanning: device registration, offline package, sync
    session.ts          Shared token refresh (rotating refresh tokens)
    tokenStorage.ts     Keychain / keystore storage
    types/              Request/response types per area
  components/
    ui/                 Buttons, Panel, PageHeading, FactList, ListRow, SegmentedTabs, StatusPill,
                        QrCode, ReasonDialog, confirmAction, FormMessage, States, fields…
    layout/             Screen, ScrollScreen, TopBar (bell + avatar), BackHeader, NavIcon (tab bar line icons)
  features/             One folder per area, like the web
    auth/ discover/ events/ checkout/ tickets/ orders/ support/ notifications/
    account/ organizer/ admin/ scanner/
  hooks/                useRequest, useCountdown, useAppActive, useEventImage (cached covers)
  context/              Toast provider
  i18n/                 t(), useLocale(); locales/ holds the web's en/kk/ru catalogs (copied
                          unchanged) and locales/mobile/ the app-only text
  theme/                Colours, radii and the system font equal to the web tokens (a parity test enforces it); type scale and press-spring motion tokens
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
5. **Text:** write interface text as `t("key")` and call `useLocale()` in the component. Reuse a
   web key when the wording exists; otherwise add a `mobile.*` key to all three files in
   `src/i18n/locales/mobile/`. Never edit the copied web catalogs. Never show sample data.
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
| `/check-in` (tab), `/events/[eventId]/scan` | Scanner, with the offline bar |
| `/account` (tab), `/account/sessions` | Account (with Language) and sessions |
| `/admin`, `/admin/[section]` | Platform admin portal |

The organizer event screen has 11 tabs: Details (with the gallery and cover), Ticket types,
Seating, Paid sales, Attendees, Check-ins (with the offline sync conflicts to review), Staff,
Campaigns, Analytics (with CSV export), Finance (with payouts) and History.

The admin portal has 9 sections: Users, Events (with paid-sales suspend/reinstate), Orders,
Tickets, Payments (payments, failed payments, refunds), Reports, Moderation log, Settings and
Exports.

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
7. **Offline (bonus, QR scans only):**
   - **Prepare:** while online, *Prepare for offline* on the scan screen registers the phone
     (`POST /scanner/devices`, one device key per account in the keychain) and downloads the
     event's offline package (`POST /scanner/events/{id}/offline-packages`). The package is saved
     in the app's private files, and the bar shows until when it is valid.
   - **Check on the phone:** when a scan can't reach the server, the app looks the ticket up in
     the package by the QR's hash. It checks the admission window, revoked tickets and tickets
     already admitted, and then requires the guest's entry confirmation QR, whose signature it
     verifies with the package's public key. A typed 8-digit code can't be checked offline.
   - **Queue:** a passing scan is saved to the queue before its result is shown; a scan that
     could not be saved is not shown as passing. The queue survives a restart.
   - **Sync:** queued scans upload with `POST /scanner/offline/sync` on *Sync now*, or by
     themselves once the server answers again. The server decides each one: accepted, a
     `conflict` for the organizer to review (Check-ins tab), or rejected. Only accepted scans
     count as attendance. Guest search, typed codes and undo need a connection.

   **What an offline result means:** [decision 0003](../docs/decisions/0003-confirmed-decisions.md)
   (19 November 2026) keeps the baseline. An offline scan that passes means "looks valid, connect
   to confirm before entry". It never lets anyone through the door by itself and must not look
   like an admission. The app shows it as "Looks valid – connect to confirm entry" on a neutral
   slate panel with a warning vibration, never the green admitted panel or the success vibration,
   and offers no *Undo* (#115). Entry is confirmed only once the phone is back online and the scan
   syncs.

Campaign (promo) QR codes are rejected as "Not a ticket". The full contract is in
[`backend/ADMISSION_API.md`](../backend/ADMISSION_API.md).

---

## What is left to do

- **Real iPhone and Android checks (#53):** the camera (ticket QR, entry confirmation QR,
  campaign QR rejected as "Not a ticket"), the share sheet (PDF, calendar, CSV), document picker,
  clipboard, deep links and sign-in after the app was in the background have been tested with
  mocks and partly on an Android emulator. Check them on real phones and add the device checklist
  with results to this README.
- **iOS build:** needs the team's Expo and Apple accounts. Run `eas-cli init` and the EAS steps in
  [Run it](#run-it) and [Installable builds](#installable-builds); only a local Android build has
  been made and tested so far.
- **Click-through of the connected screens:** campaigns, refunds, finance and payouts, and the
  gallery upload were checked against the API (#51) but not yet on a simulator or emulator.
- **Translation review (#52):** the app-only Kazakh and Russian text
  (`src/i18n/locales/mobile/`) was written by the developer, not a native speaker; have it read.
- **Optional clean-up:** renaming the session kind `scanner` to something like `native` in the
  backend (decision 0001).
- **Out of scope for now (decision 0001):** push notifications, Google sign-in on mobile, offline
  browsing, app-store publication.
