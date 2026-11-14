# 0001 — The mobile app covers the whole product, plus the scanner

- **Status:** Accepted (decided by the project owner, 7 November 2026)
- **Supersedes:** the "scanner only" mobile scope in `AGENTS.md`, `mobile/README.md` and the
  "native attendee/organizer apps" exclusion in `docs/BiletFlow_Backend_Requirements.md` §1.2

## Context

Until now the iOS/Android app was defined as an event-staff scanner. Attendees and organizers
used the web app, and the mobile app also carried a Discover tab and an Organizer placeholder
that were planned for removal.

The project owner wants a phone user to be able to do everything the web app allows, with the
scanner as an extra capability.

## Decision

1. **Scope.** The mobile app offers every web feature: discovery, event pages, free and simulated
   paid checkout (including seat maps and promo codes), tickets (QR, PDF, delivery, entry
   confirmation), orders, support, notifications, account and sessions, the organizer workspace
   with every event tab, and the platform admin portal. It keeps the staff scanner.
2. **Same backend, same contracts.** Mobile calls the same `/api/v1` endpoints as the web and
   follows the same documented error codes. No mobile-only endpoints. Screens whose API is not
   built yet (promo campaigns, analytics, finance, refund actions, event images) show the same
   "Not available yet" state as the web.
3. **Sessions.** The app signs in with `client_kind: "scanner"`, which today means "native client:
   refresh token in the response body". Tokens stay in the device keychain/keystore. No backend
   change is needed; renaming the value to something like `native` can be a later cleanup.
4. **Sign-in is required.** The app opens on the sign-in screen; browsing without an account
   stays a web feature. Links from emails (verify email, reset password, staff invitation) are
   opened in the app by pasting the link or its token.
5. **Google sign-in** stays web-only for now (it relies on a browser redirect back to the web app).
6. **Files.** PDFs, calendar files and CSV exports are downloaded to the app's cache and handed to
   the system share sheet. Uploads use the system document picker.
7. **Security rules are unchanged.** The server still decides permissions, prices, inventory and
   admission. Showing or hiding a tab (for example Admin) is convenience only. A Campaign QR is
   never accepted as a ticket.

## Consequences

- `@mobile` owns the larger `mobile/` scope; `@qa` owns mobile tests (`mobile/src/**/*.test.*`).
- The mobile app now has a test runner (`npm test`, Jest with `jest-expo` and React Native
  Testing Library).
- Every new backend feature must be wired into both clients before it counts as done.
- Out of scope for now: push notifications, offline browsing, Google sign-in on mobile,
  app-store publication.

## Status note (12 November 2026)

The decision is unchanged. The APIs listed in point 2 as "not built yet" (promo campaigns,
analytics, finance, refund actions, event images) are now on `main` (PRs #61 and #64), so the
"Not available yet" state is no longer the expected result for them. Wiring them into the mobile
app is tracked in #51 and in the web in #45; current per-area progress is in the
[integration status](../integration/status.md). Ownership follows point 1: `@mobile` owns every
mobile screen, not only the scanner.
