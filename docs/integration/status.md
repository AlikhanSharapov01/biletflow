# Integration status

Whole-project status per requirement area (BF-01 to BF-22 in
[the backend requirements](../BiletFlow_Backend_Requirements.md)). The tracker is #125, which
replaces the MVP checklist #58 and the audit tracker #85.

- **Result:** every requirement area is built in the backend and integrated in both clients, and
  every issue in #125 is closed. The project is ready to demonstrate.
- **Baseline:** `main` at `ddefdae` (merge of PR #160), 24 November 2026; checked on 26 November.
  Merged since the 19 November update: web PRs #111 and #145 (#107 to #110, #112, #132) and #143
  (GA4, #131); mobile PRs #128 (#116), #139 (#115), #141 (GA4, #131) and #142 (#133); PR #144
  (client contract check #122, Playwright end-to-end tests #120, acceptance walkthrough #121);
  PRs #146 and #159 (validation rerun, #117); PR #147 (API examples, #119); PR #148 (several API
  workers, #118); the web and mobile UX passes, PRs #149 to #158; PR #160 (security headers and
  HTTPS for the demo host, #49).
- **Sources checked:** merged PRs, the closed issues in #125, `backend/VALIDATION.md`,
  [acceptance.md](acceptance.md), [client-contract-check.md](client-contract-check.md) and the
  GitHub Actions runs on `main`.
- **Real phones (#53):** the mobile app was run on a real Android phone and a real iPhone through
  Expo Go, including sign-in, door scanning and support cases. A per-screen device log is not
  recorded here.

## What the columns mean

These are separate states. One does not imply the next.

| State | Meaning |
|---|---|
| **API complete** | The backend implements the BF requirements, with a contract in `backend/*_API.md` and backend tests. "Partial" means an open issue covers a missing or defective part. |
| **Merged** | The backend work is on `main` (PR numbers). |
| **Web / Mobile integrated** | The client on `main` calls the live contract for this area. "Planned contract" means the screen calls the route that now exists, but its types and behaviour have not been checked against the final contract. Since [decision 0001](../decisions/0001-mobile-app-full-scope.md), every feature needs both clients. |
| **Acceptance verified** | The relevant AC scenarios (requirements §10) were shown working on the integrated stack, not only in backend unit/integration tests. |

Section 12 of the requirements gives the rule: a feature can be API-complete before its client UI
exists, but it is not done until the end-to-end journey is integrated and verified.

## Evidence available on `main`

| Evidence | Result | What it does not prove |
|---|---|---|
| Backend PostgreSQL suite with the opt-in harnesses (*Validation* workflow) | On `8d31ee4`, 24 November: **904 passed, 0 failed, 0 skipped**, including the process-kill and load harnesses ([VALIDATION.md](../../backend/VALIDATION.md), #117) | Client flows |
| Process-kill harness (`backend/tests/crash/`) | 10 scenarios: API/worker killed or frozen at commit, storage and SMTP boundaries; no duplicated orders, tickets, refunds, finance rows or files. All passed in the 24 November run | Power loss; object storage outside the Compose host |
| Load harness (`backend/tests/load/`) | 50 checkouts for 40 tickets plus 10 scanners: no overselling or duplicate admission, and the 2 s admission p95 target met in every report, with and without analytics load (#118) | A separate client machine, soak tests |
| GitHub Actions on `main` | On `ddefdae`: *Backend API*, *Web*, *E2E*, *Smoke* and *Backup* succeeded. *Mobile app* last ran on `8d31ee4` (24 November) and succeeded | Device behaviour |
| *E2E* workflow (Playwright, #120) | Four browser journeys: free registration to admission, paid checkout with a failed and a retried payment, Campaign QR link to a discounted order, attendee refund request to organizer refund | Web screens outside these journeys |
| *Smoke* workflow (`tools/smoke_*.py`, API) | Free registration and admission, duplicate and forged-QR rejection, paid activation and payment, campaign link/discount/report, refund | Any screen |
| *Backup* workflow | Backup and restore of the database and the whole SeaweedFS bucket into a fresh stack, with order, ticket, file, audit and job checks (#69, #77) | Object storage outside the Compose host |
| Acceptance walkthrough AC-01 to AC-28 (#121) | **21 pass, 7 partial, 0 fail**, 20 November ([acceptance.md](acceptance.md)). Partial: the part that can run automatically passed; the rest needs hardware or timing a live run cannot produce | The walkthrough drives the API and the four browser journeys, not the mobile app |
| Client types against the final contracts (#122) | Checked for web and mobile ([client-contract-check.md](client-contract-check.md)) | Runtime behaviour |

## Status matrix

Every area is API-complete and merged. The acceptance column names the criteria from
[acceptance.md](acceptance.md); "partial" means the automatic part passed and the rest needs
hardware or timing (see that file).

| Area | Web integrated | Mobile integrated | Acceptance |
|---|---|---|---|
| BF-01 Accounts and sessions | Yes | Yes (Google sign-in is web only, by decision 0001) | AC-01 pass |
| BF-02 Organizations and staff | Yes | Yes | AC-18 pass |
| BF-03 Events, discovery, images | Yes: upload, cover, reorder and delete (#107) | Yes: upload, cover and delete; covers on Discover and the event page (#114) | AC-01 pass |
| BF-04 Venues and seating | Yes | Yes | AC-05 pass |
| BF-05 Ticket types and holds | Yes (the checkout hint shows the default 10-minute hold rather than reading the setting) | Yes: hold time read from `/settings/public` | AC-05 pass; AC-06 partial |
| BF-06 Paid-sales activation | Yes | Yes | AC-03 pass (API and browser); AC-04 pass |
| BF-07 Checkout and free registration | Yes, including promo and zero-total | Yes, including promo and zero-total | AC-02 pass (API and browser) |
| BF-08 Payments (simulated) | Yes | Yes | AC-07 pass (API and browser); AC-08 partial |
| BF-09 Campaigns and campaign QR | Yes | Yes: list, create, edit, disable, QR, report | AC-09 pass; AC-10 pass (API and browser) |
| BF-10 Tickets, PDF, delivery | Yes | Yes (PDF via share sheet) | AC-19 pass; AC-11 partial |
| BF-11 Online admission | n/a (check-in history and CSV) | Yes; used on real phones (#53) | AC-12, AC-13, AC-14 pass |
| BF-12 Offline verification and sync | n/a | Yes: a passing offline scan reads "Looks valid – connect to confirm entry" and never looks like an admission (#115, decision 0003) | AC-21 partial |
| BF-13 Refunds and cancellations (full-order only) | Yes | Yes | AC-15 pass (API and browser); AC-16, AC-17 pass |
| BF-14 Finance and simulated payouts | Yes, with payouts (#108, #132) | Yes, with payouts | AC-23 pass; AC-28 partial |
| BF-15 Notifications | Yes, including moderation and account notice links and the delivery admin (#110) | Yes, including admin jobs and deliveries with retry (#116) | AC-26 pass |
| BF-16 Support and attachments | Yes, with scan state (#112) | Yes, with scan state (#116); used on real phones (#53) | AC-20 partial |
| BF-17 Calendar | Yes | Yes | AC-22 pass |
| BF-18 Organizer analytics | Yes, with CSV export (#108) | Yes, with CSV export (#114) | AC-23 pass |
| BF-19 GA4 (optional, off by default) | Yes, through the backend contract (#131) | Yes, through the backend contract (#131) | AC-24 pass |
| BF-20 History, duplication, audit | Yes | Yes | AC-25 pass |
| BF-21 Administration | Yes: commerce (#109) and operations, jobs and deliveries (#110) | Yes: commerce (#113) and operations, jobs and deliveries (#116) | AC-28 partial |
| BF-22 Operations and integration | n/a | n/a | AC-26 pass; AC-27 partial (run by the *Backup* workflow). HTTPS is configured for a shared demo host (#49), which does not exist yet |
| SRS 7 Localization (kk/ru/en) | Yes | Yes (#52, #133) | Not an AC; both clients ship all three languages |

## Remaining work

None tracked: every issue in #125 is closed. Optional follow-ups, none of which blocks the
demonstration:

- The 7 partial acceptance criteria (AC-06, AC-08, AC-11, AC-20, AC-21, AC-27, AC-28) need a
  printer, a second offline device or clock-based timing to run end to end.
- A per-device checklist for the real-phone checks (#53) in `mobile/README.md`.
- An iOS build through EAS, which needs the team's Expo and Apple accounts (Expo Go works today).
- Calendar options on the order and ticket screens; server-side check-in history filters
  (clients show the newest 100 entries); a `randomUUID` fallback for the web app on plain HTTP;
  the web hold hint reading the setting; a backend design-rationale document; encryption at rest
  (a team decision).

Conditional, not blocking: payment-provider sandbox (merchant access) and live GA4 data
(property credentials).

## Out of scope (do not reopen)

Partial refunds and refund deductions, real-money payouts, advanced disputes and the other
exclusions in requirements §1.2. Issue #35 originally asked for "full or partial" refunds; only
the full-order refund was built, which matches the baseline.

## Decisions

The questions in [decision 0002](../decisions/0002-decisions-to-confirm.md) were answered in
[decision 0003](../decisions/0003-confirmed-decisions.md): an offline result needs online
confirmation before entry, the current sync rules stay, and all proposed defaults are confirmed.
The one consequence for the code, the mobile offline result screen (#115), was merged in PR #139.
