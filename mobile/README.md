# BiletFlow mobile scanner

The iOS and Android app for **event staff** (the SRS "Event Admin"). Staff sign in, choose an
event they are assigned to, scan attendees' ticket QR codes with the camera, and record or undo
check-ins. Attendees and organizers use the web app; native attendee/organizer apps are out of
the MVP scope.

Built with Expo SDK 58, React Native 0.88, TypeScript (strict) and expo-router.

---

## Contents

1. [Status](#status)
2. [Run it](#run-it)
3. [Connecting to the backend](#connecting-to-the-backend)
4. [Folder structure](#folder-structure)
5. [How scanning works](#how-scanning-works)
6. [What is left to do](#what-is-left-to-do)

---

## Status

| SRS 4.8 requirement | State |
|---|---|
| Secure sign-in, tokens in the device keychain/keystore | Done |
| Show only events the user may scan | Done (events they own, or where they have "Scan tickets") |
| Scan ticket QR codes with the camera | Done |
| Clear result: valid, invalid, cancelled, refunded, already used, wrong event, not a ticket | Done |
| Record check-in and prevent double entry | Done (enforced by the server; retries are safe) |
| Undo an accidental check-in | Done (requires a reason and the "Undo check-ins" permission) |
| Registered vs checked-in counts | Done |
| Reject Campaign QR codes | Done (shown as "Not a ticket") |
| Search attendees manually | **Not done** (the backend endpoint exists) |
| Entry confirmation from the attendee | **Not done** (see below) |
| Offline scanning (bonus) | Not done (the backend supports it) |

The app also contains a **Discover** tab, an **Organizer** placeholder tab and self-registration.
These are outside the scanner's scope and are planned for removal.

---

## Run it

**You need:** Node.js 22, Xcode with an iOS Simulator (or Android Studio, or the Expo Go app on
a phone), and the backend running (from the repository root: `docker compose up --build`).

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_URL=http://<your-computer-ip>:8080/api/v1 npx expo start
```

Then press `i` for the iOS Simulator, `a` for Android, or scan the QR code with Expo Go.

| Command | What it does |
|---|---|
| `npx expo start` | Start the development server |
| `npx expo start -c` | Same, clearing the bundler cache (use after changing `EXPO_PUBLIC_API_URL`) |
| `npx tsc --noEmit` | Type check |

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

**"Couldn't reach the server"** means the request never reached the API:

1. Check the stack is running: open `http://<computer-ip>:8080/health/ready` in the device's
   browser — it should show `{"status":"ready"}`.
2. The URL is built into the app when the bundle is created. After changing it, restart with
   `npx expo start -c`, then reload the app (press `r` in the terminal, or open the Expo developer
   menu and choose *Reload*).
3. Port `8000` is only reachable from the computer itself; phones must use `8080`.

**Accounts:** create one on the web app and verify it through Mailpit (<http://localhost:8025>).
To scan an event, either own it (create it as an organizer) or be added on the event's *Staff*
tab with "Scan tickets".

---

## Folder structure

```text
src/
  app/                  expo-router routes. Each file is a thin wrapper that renders a screen
    (auth)/login.tsx      from features/. Paths here are the app's URLs — do not rename them.
    (app)/(tabs)/         Bottom tabs: index (Discover), organizer, check-in, account
    (app)/events/[eventId]/scan.tsx
  api/                  client, session (refresh), secure token storage, auth, scanner, catalog
    types/              Request/response types per area
  components/
    ui/                 Shared primitives: buttons, text, fields, panel, status pill, date tile, states
    layout/             Screen, TopBar, tab glyph
  features/
    auth/               Sign-in screen, form, auth context
    scanner/            Check-in event list, scan screen (camera, result, undo, counts), result codes
    discover/           Event list (out of scope, see Status)
    organizer/          Placeholder (out of scope)
    account/            Profile and sign-out
  context/              Toast provider
  theme/                Colours, fonts, radii and spacing shared with the web design
  utils/                Date and time helpers
```

To add a screen: create it in `features/<area>/`, keep route files in `src/app/` thin, use the
primitives from `components/ui`, and call the backend through a function in `src/api/`.

---

## How scanning works

1. **Check-in** tab → `GET /scanner/events` lists events the user may scan.
2. Opening an event shows the camera and the counts (`GET /scanner/events/{id}/counts`).
3. A scanned QR is sent unchanged to `POST /scanner/events/{id}/check-ins` with a fresh
   `operation_id`, so a retried request cannot admit twice.
4. The server's result code is shown as a large result panel (`features/scanner/outcomes.ts`).
5. *Undo* calls `POST /scanner/check-ins/{id}/reverse` with a reason.

The full contract is in [`backend/ADMISSION_API.md`](../backend/ADMISSION_API.md).

**Entry confirmation:** when the backend setting `ADMISSION_REQUIRE_ENTRY_CONFIRMATION` is `true`
(the default), every check-in also needs the attendee's short-lived entry confirmation (a second
QR or an 8-digit code, shown on the attendee's ticket page in the web app). The app cannot send it
yet, so such check-ins are rejected. For demos, set the setting to `false` in the root `.env`.

---

## What is left to do

**Required**
- Read the attendee's entry confirmation (scan the second QR or type the 8-digit code) and send it
  with the check-in; show clear messages for `sign_in_required`, `confirmation_expired`,
  `confirmation_used` and `invalid_confirmation`.
- Manual attendee search (`GET /scanner/events/{id}/attendees`) and check-in by ticket.
- Allow only staff/owners to use the app (today any verified account can sign in and simply sees
  no events).
- Remove the Discover and Organizer tabs and self-registration; make Check-in the first tab.

**Quality**
- Add tests (none yet) and an ESLint config so `npx expo lint` works.
- Set the real app name, slug and URL scheme in `app.json` (still `mobile`), and remove the
  leftover template assets and the broken `reset-project` script.
- Add a `.env.example` documenting `EXPO_PUBLIC_API_URL`.

**Bonus**
- Offline scanning: register the device, download the event package, queue scans and sync them
  (`backend/ADMISSION_API.md`, offline section).
