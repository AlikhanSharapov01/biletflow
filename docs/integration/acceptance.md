# Acceptance walkthrough AC-01 to AC-28 (#121)

- **Date:** 20 November 2026
- **Stack:** `docker compose up --build` from the repository at `main` `6e8873e` plus the
  changes for #120, #122 and #135, with `.env.example` (development settings, simulated payments,
  Mailpit for e-mail, ClamAV and S3-compatible storage as in CI).
- **Result:** **21 pass, 7 partial, 0 fail, 0 not run.**
  No criterion failed. Partial means the part that can be run automatically passed and the rest is
  named in the evidence column. Nothing was run on a phone or tablet, so **no criterion is
  verified on the mobile app** (see [what this does not cover](#what-this-does-not-cover)).

## How it was done

Two automated tools, both in the repository, so the run can be repeated and compared:

| Tool | What it does |
|---|---|
| [`tools/acceptance_walkthrough.py`](../../tools/acceptance_walkthrough.py) | Drives the running stack through the API for every AC with its own accounts and events: concurrency (two buyers, two scanners), refunds through the simulator, event cancellation, calendar, support, worker stop and restart. Prints PASS, PARTIAL or FAIL with the evidence and exits 1 on any FAIL. |
| [`e2e/`](../../e2e) (Playwright, workflow *E2E*, issue #120) | Four journeys in a real browser: free registration to admission, paid checkout with a failed and a retried payment, Campaign QR link to a discounted order, attendee refund request to organizer refund. They cover the web side of AC-02, AC-03, AC-07, AC-10 and AC-15 (marked "API + web (browser)" below). |

The "log" for each criterion is the evidence column; the full console output of the run is the
tool's output (run `cd backend && uv run python ../tools/acceptance_walkthrough.py`).

## Results

| AC | Criterion | Date | Client checked | Result | Evidence |
|---|---|---|---|---|---|
| AC-01 | Anonymous visitor browses, then tries to get a ticket | 2026-11-20 | API; mobile not verified | **PASS** | browse 200; hold without sign-in 401 |
| AC-02 | Free event: zero-value order, tickets and delivery without a provider payment | 2026-11-20 | API + web (browser); mobile not verified | **PASS** | order 0, no payment, QR issued, ticket email delivered |
| AC-03 | Paid event not activated: paid checkout rejected, free types still work | 2026-11-20 | API + web (browser); mobile not verified | **PASS** | paid hold 409 paid_sales_inactive; free registration works |
| AC-04 | Activation prerequisites complete: only the intended event enables paid sales | 2026-11-20 | API; mobile not verified | **PASS** | event A sells; event B of the same organizer still refuses paid holds |
| AC-05 | Two buyers compete for the last place | 2026-11-20 | API; mobile not verified | **PASS** | concurrent holds -> [201, 409] |
| AC-06 | Hold abandoned or expired: inventory and campaign reservation released | 2026-11-20 | API; mobile not verified | **PARTIAL** | abandoned hold releases the place and the redemption; the time-based expiry is covered by backend tests (test_checkout_reliability, sweeper) |
| AC-07 | Payment fails, repeats or arrives out of order | 2026-11-20 | API + web (browser); mobile not verified | **PASS** | failure: no ticket; retry: one ticket; late capture: duplicate_charge refund, ticket untouched |
| AC-08 | Payment succeeds after its inventory was sold elsewhere | 2026-11-20 | backend tests; mobile not verified | **PARTIAL** | needs an expired hold plus a competing sale, which a live run cannot time; covered by backend tests test_paid_orders (late_payment, blocked_fulfillment) and test_checkout_reliability |
| AC-09 | Two buyers use the last campaign redemption | 2026-11-20 | API; mobile not verified | **PASS** | concurrent holds with the last redemption -> [201, 409] |
| AC-10 | Campaign link with a modified discount; campaign QR is never an admission token | 2026-11-20 | API + web (browser); mobile not verified | **PASS** | tampered token and client discount refused; server discount 40000; scanner rejects the link |
| AC-11 | PDF downloaded twice: one ticket, one admission | 2026-11-20 | API; mobile not verified | **PARTIAL** | both PDFs carry the same ticket id and the second admission is refused; scanning a printed A4 page, in colour and grayscale, needs a printer and a phone |
| AC-12 | Missing sign-in or access: admission rejected with a meaningful error | 2026-11-20 | API; mobile not verified | **PASS** | no session 401; unassigned account 404; attendee token 404 |
| AC-13 | Two online scanners scan the same valid ticket | 2026-11-20 | API; mobile not verified | **PASS** | concurrent scans -> [200, 409] |
| AC-14 | Staff reverse an accidental check-in | 2026-11-20 | API; mobile not verified | **PASS** | scan-only staff refused; owner reversed; history kept; re-entry needs a fresh confirmation |
| AC-15 | Refund approved: old ticket invalid at once, seat quarantined | 2026-11-20 | API + web (browser); mobile not verified | **PASS** | ticket refused at once; order refund_pending; place not resold |
| AC-16 | Refund pending or failed, then succeeds: no resale before success | 2026-11-20 | API; mobile not verified | **PASS** | failure kept the place closed; success released it once; the replacement has a new id and QR |
| AC-17 | Event cancelled while payments and holds exist | 2026-11-20 | API; mobile not verified | **PASS** | sales, admission and the open hold stop; the paid order is refunded and its ticket invalid |
| AC-18 | Staff revoked, or another organizer's event | 2026-11-20 | API; mobile not verified | **PASS** | revoked staff lose the event list and admission; another organizer's records are closed |
| AC-19 | Recipient opens a ticket claim | 2026-11-20 | API; mobile not verified | **PASS** | only the addressed verified account claims; the buyer's order stays private |
| AC-20 | Support message and attachment: persisted once, authorized people only | 2026-11-20 | API; mobile not verified | **PARTIAL** | a retried create is persisted once and strangers are refused; the mobile reconnect and missed-update recovery path is covered by backend tests (test_support) and needs a device |
| AC-21 | Offline devices conflict or use stale refund data | 2026-11-20 | backend tests; mobile not verified | **PARTIAL** | needs two offline devices syncing; covered by backend tests test_offline and the crash/recovery harness; mobile offline scanning is not verified on a device |
| AC-22 | Calendar exported, then event updated and cancelled | 2026-11-20 | API; mobile not verified | **PASS** | same UID; SEQUENCE rises on update and cancellation; the ticket holder gets STATUS:CANCELLED |
| AC-23 | Sales, discount, refund and re-purchase: totals match the records | 2026-11-20 | API; mobile not verified | **PASS** | gross 1200000, refunds 360000, net 737200; campaign report equals analytics |
| AC-24 | GA4 disabled: core flows work, the traffic panel says unavailable, not zero | 2026-11-20 | API; mobile not verified | **PASS** | core flow fine; traffic state 'disabled' with metrics null (never zeros) |
| AC-25 | Past event duplicated into a fresh draft | 2026-11-20 | API; mobile not verified | **PASS** | copy is a draft with no orders, tickets or revenue; the original is unchanged |
| AC-26 | API or worker stops after a business commit: restart completes the work once | 2026-11-20 | API; mobile not verified | **PASS** | order committed while the worker was down; one ticket email after restart, no duplicate |
| AC-27 | Database and storage restored: orders, tickets, files, audit and jobs consistent | 2026-11-20 | CI; mobile not verified | **PARTIAL** | run by the Backup workflow in CI (backup and restore drill with file checks); not repeated by this script |
| AC-28 | Demonstration payment viewed or exported keeps its simulation label | 2026-11-20 | API; mobile not verified | **PARTIAL** | API order, analytics and finance carry the label; the on-screen banner is asserted by the browser tests; the admin payments CSV export was not opened |

## What this does not cover

- **Mobile app (all 28).** There was no phone or emulator in this run. Every criterion that names
  the scanner or a mobile screen (AC-11 to AC-14, AC-18, AC-21) is proved through the same API the
  app calls, not through the app. The mobile status in `status.md` is unchanged by this document.
- **Web screens beyond the four browser journeys.** Rows marked "API" were proved through the API
  only; the web screens for them (support chat, calendar links, analytics, event history, admin)
  were not clicked through in this run.
- **AC-06, AC-08, AC-21 (time and devices).** A hold expiring by the clock, a payment arriving after
  the place was sold elsewhere, and two offline devices syncing cannot be timed reliably in a live
  run. They are covered by backend tests and the crash harness, which were not re-run here.
- **AC-11 print.** The PDF and the second admission were checked; scanning a printed A4 page in
  colour and grayscale needs a printer and a phone.
- **AC-27.** The backup and restore drill is run by the *Backup* workflow in CI; this walkthrough
  did not repeat it.
- **AC-28.** The admin payments CSV export was not opened; the order, analytics and finance
  responses and the on-screen banner (browser tests) carry the simulation label.
- **GA4 with a real property** (AC-24 beyond the "disabled" state) needs credentials.

## Defects found

No acceptance criterion failed, so no bug issue is required by #121. The browser run found one
defect outside the AC list; it should be filed:

- **Web: checkout fails when the page is opened over plain HTTP at any address other than
  `localhost`.** Reserving a ticket shows "crypto.randomUUID is not a function". Browsers only expose
  `crypto.randomUUID()` on secure origins (HTTPS or `localhost`), and the web client calls it for
  every idempotency key (`web/src/api/checkout.ts`, `paidCheckout.ts`, `paidSales.ts`,
  `support/components/Composer.tsx`, `support/retryKey.ts`). It will hit a shared demo served over
  `http://<ip>:8080` until TLS exists (#49). The mobile app uses `expo-crypto` and is not affected.
  Suggested fix: a small helper that falls back to `crypto.getRandomValues` (or the `uuid`
  package) when `randomUUID` is missing. Affects AC-02, AC-07 and AC-10 on a non-localhost demo.

## Notes on the tools

- `acceptance_walkthrough.py` takes AC numbers as arguments to run a subset and
  `--markdown FILE` to write the results table. AC-26 stops and starts the worker, so it needs
  `ACCEPT_COMPOSE` (for example `docker compose -p biletflow`); without it that criterion reports
  NOT RUN.
- Corrections made while preparing this run were mistakes in the tool, not in the product: a
  repeated entry-confirmation request after admission (correctly refused), an image that was not a
  valid PNG (correctly rejected by the upload check), the cancellation calendar file being limited to
  ticket holders and staff (as documented), and a list check that assumed the event was on the
  first page.
