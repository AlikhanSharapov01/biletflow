# Integration status

Whole-project status per requirement area (BF-01 to BF-22 in
[the backend requirements](../BiletFlow_Backend_Requirements.md)), with the remaining work grouped
by issue. The tracker is #125, which replaces the MVP checklist #58 and the audit tracker #85.

- **Baseline:** `main` at `ad5b53c` (merge of PR #127), 19 November 2026. Merged since the
  13 November update: PR #102 (#67, #70, #74), PR #104 (the `dauka-backend` branch: #71, #72,
  #73, #75, #76, #77, #78, #81), PR #105 (mobile: moderation notices open the organizer's event,
  hold time read from settings), PR #126 (mobile admin commerce, #113) and PR #127 (mobile event
  covers and analytics CSV export, #114). Web PR #111 (most of #107, #108 and #109) is open, not
  merged; nothing under `web/` has changed on `main` since 12 November.
- **Sources checked:** `backend/app/**`, `web/src/api/**`, `mobile/src/api/**` and their feature
  screens, `backend/VALIDATION.md`, the `*_API.md` contracts, `docker-compose.yml`,
  `.github/workflows/`, merged PRs, open PR #111, open issues #107–#125 and the GitHub Actions
  runs on `main`.
- Anything not checked against code, tests or a CI run is marked **not verified**.
- **Acceptance walkthrough** (AC-01 to AC-28, 20 November 2026): [acceptance.md](acceptance.md).
  **Client types against the final contracts:** [client-contract-check.md](client-contract-check.md).

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
| Backend PostgreSQL suite (*Backend API* workflow, PostgreSQL 17) | The workflow runs the whole suite on every push. On `ad5b53c`: **863 passed, 0 failed, 11 skipped** (the 10 opt-in process-kill cases and the opt-in load test); the same counts on `207cbde` and `cb5a9bd`, the merge of #104. The last local run in [VALIDATION.md](../../backend/VALIDATION.md) is from 13 November, before #102 and #104 | Client flows; the opt-in harnesses; the Compose services (Caddy, SeaweedFS, ClamAV) |
| Process-kill harness (`backend/tests/crash/`, opt-in `RUN_CRASH_TESTS=1`) | 10 scenarios: API/worker killed or frozen at commit, storage and SMTP boundaries; no duplicated orders, tickets, refunds, finance rows or files (#83, extended by #65 and #68). Last run 13 November, before #102/#104 and the move to S3-compatible storage (#77); not rerun since (#117) | Docker restart policy, power loss, the S3 storage path |
| Load harness (`backend/tests/load/`, opt-in `RUN_LOAD_TESTS=1`) | 50 checkouts for 40 tickets plus 10 scanners: admission p95 312 ms alone, 453 ms with 5 analytics clients, 743 ms with 20 (target 2 s); no overselling or duplicate admission (#80). Measured before #102/#104; not rerun since (#117). Reducing the analytics effect is #118 | Docker/Caddy, separate client machine, soak; the baseline is still a proposal, which decision 0003 does not cover |
| GitHub Actions on `main` | `ad5b53c` and `207cbde`: *Backend API* and *Mobile app* succeeded. *Smoke* and *Backup* on `cb5a9bd` (merge of #104) were **cancelled** after about a minute, during setup, not failed. They have not run on `main` since: they trigger only on changes to `backend/`, `docker-compose.yml`, their own `tools/` scripts or workflow file (*Smoke* also `web/`, `proxy/` and `.env.example`), and #126/#127 changed only `mobile/` and this document. Their last success on `main` is `b1b73d0` (#102). Both passed in PR #104's own runs on `8bc89e9`, whose tree is identical to `cb5a9bd` | Browser or device behaviour; a green *Smoke* and *Backup* run on `main` itself (#117) |
| *Smoke* workflow (`tools/smoke_*.py`, API only) | Free registration and admission, duplicate and forged-QR rejection, paid activation and payment, campaign link/discount/report, refund | Any screen. #48 was closed on this API-level smoke; there is no browser (Playwright) suite in the repository (#120) |
| *Backup* workflow | Writers stopped during backup; an online backup that loses an image is detected; restore into a fresh stack checks orders, tickets, linked PDFs/images/attachments, audit, outbox keys and pending work (#69). Since #104 it backs up the whole SeaweedFS bucket and waits for ClamAV before linking an attachment; that version has passed only in PR #104's runs | Object storage outside the Compose host |
| *Web* workflow (last run on `main`: `4ed9078`, 12 November) and *Mobile app* workflow (`ad5b53c`) | Typecheck, unit tests, web build | End-to-end use against the API |

No combined rerun of the full suite, the process-kill and load harnesses and the restore drill
on one `main` revision after #102/#104 is recorded yet. That is #117.

## Status matrix

Legend: **Yes**, **Partial**, **No**, **n/a** (not part of that client), **not verified**.
Real devices (#53), browser end-to-end tests (#120) and the acceptance walkthrough (#121) apply
to every row; the last column lists them only where a row depends on them specifically.

| Area | API complete | Merged | Web integrated | Mobile integrated | Acceptance verified | Open issues |
|---|---|---|---|---|---|---|
| BF-01 Accounts and sessions | Yes | Early `main` (issue #3) | Yes | Yes (Google sign-in is web only, by decision 0001) | API smoke covers register/verify/sign-in; client journeys not verified | — |
| BF-02 Organizations and staff | Yes | Early `main` (issue #4) | Yes | Yes | API smoke covers staff scan grant; rest not verified | — |
| BF-03 Events, discovery, images | Yes (image delete failed with 503 in the Compose stack until #95 granted the app role DELETE on `event_media`); images stored in SeaweedFS since #104 (#77) | Early `main` (issue #4); images #64, #95; storage #104 | Partial: upload only; order, cover, delete and covers on Discover and the event page not wired (in open PR #111) | Yes: gallery upload, cover and delete; the cover is shown on Discover cards and the event page (#114, PR #127; image download checked by script against the Compose stack; on-screen check not verified) | Not verified | #107 |
| BF-04 Venues and seating | Yes | Early `main` (issue #4); holds #25 | Yes | Yes | Backend concurrency tests only | — |
| BF-05 Ticket types and holds | Yes: hold length is the platform setting in force when the hold is created (#70); at most 3 active holds per account | #25, #64 (counters), #102 (#70) | Yes; organizer counters not verified. The checkout hint still says "10 minutes" in all three languages instead of reading the setting | Yes: hold time read from `/settings/public` (PR #105); organizer counters not verified | Backend tests; load harness shows no overselling (#89) | — (hint: no issue) |
| BF-06 Paid-sales activation | Yes: activation fee is the platform setting in force when the activation starts (#70) | #25, #102 (#70) | Yes (fee shown from the activation record) | Yes (same) | API smoke | — |
| BF-07 Checkout and free registration | Yes | #16, #25, #61 (promo) | Yes, including promo and zero-total | Yes, including promo and zero-total; not verified on a device | API smoke | — |
| BF-08 Payments (simulated) | Yes: stale refund results are ignored, unprocessable provider events are quarantined, request keys are stable (#93) | #25, #93 | Yes | Yes | API smoke; AC-07/08 backend tests and process-kill harness | — |
| BF-09 Campaigns and campaign QR | Yes: the report uses the analytics definitions and adds `pending_refunds_minor` and `definitions` (#67); fulfilment revalidation (#91) | #61, #91, #102 (#67) | Yes (PR #63); the two fields added by #67 are not shown | Yes: list, create, edit, disable, QR, report; the fields added by #67 are not shown; not verified on a device | API smoke; reconciliation in backend tests only | #122 |
| BF-10 Tickets, PDF, delivery | Yes: committed PDFs kept, abandoned writes swept (#94); bundled Unicode font for Kazakh/Russian (#92); stored in SeaweedFS since #104 | #16, #24, #92, #94, #104 (#77) | Yes | Yes (PDF via share sheet) | Backend and process-kill tests (process-kill not rerun with S3 storage); client journeys not verified | #117 |
| BF-11 Online admission | Yes | #18, #24 | n/a (check-in history and CSV only) | Yes | API smoke; local p95 well under 2 s with and without analytics load (#89), measured before #102/#104 | #118 |
| BF-12 Offline verification and sync | Yes; sync rules confirmed in [decision 0003](../decisions/0003-confirmed-decisions.md) | #24 | n/a | Partial: QR offline scanning (PR #59), but a passing offline scan shows "Accepted offline" in the admitted style, which decision 0003 does not allow | Not verified on devices | #115, #53 |
| BF-13 Refunds and cancellations (full-order only) | Yes (retry fix in #93) | #61, #93 | Yes (PR #63) | Yes: attendee request and cancel, organizer refund and ticket cancel; not verified on a device | API smoke | #122 |
| BF-14 Finance and simulated payouts | Yes: processing rate taken from the platform setting when the hold is created (#70); simulated payouts | #64, #102 (#70) | Partial: summary on the planned contract with the "not available yet" fallback; payouts not wired (in open PR #111) | Yes: summary, payout request and simulator steps; types match `FINANCE_API.md` (checked by script against the Compose stack, PR #127); not verified on a device | Not verified | #108, #122 |
| BF-15 Notifications | Yes: moderation notices to affected users (#74); admin list and bounded retry of exhausted deliveries (#73) | #24, #61, #64, #102 (#74), #104 (#73) | Partial: inbox works, but moderation notices fall back to the public event page and account notices have no link (fixed in open PR #111, no issue); delivery admin view not wired | Yes: inbox; moderation notices open the organizer event (PR #105); admin jobs and deliveries with retry (#116, PR #128, retry seen on the emulator) | Not verified | #110 |
| BF-16 Support and attachments | Yes: content checked against the declared type, ClamAV scan with fail-closed quarantine and worker re-scan (#75); interrupted and abandoned uploads recovered (#76); ClamAV runs in Compose | #24, #104 (#75, #76) | Partial: upload and download; scan state (checking, ready, blocked) not shown | Yes: upload and download, with scan state (Checking file… then Ready or Blocked, polled; #116, PR #128, seen on the emulator with ClamAV stopped and restarted); the same change fixes uploads from Android being refused with 415; document picker not tested on a physical device | Restore drill in PR #104 links an attachment after ClamAV is healthy; client journeys not verified | #112, #53 |
| BF-17 Calendar | Yes | #24 | Yes | Yes | Not verified | — |
| BF-18 Organizer analytics | Yes: CSV export with the report's filters (#81); campaign report reconciled (#67) | #64, #102 (#67), #104 (#81) | Partial: planned contract with the "not available yet" fallback; no CSV export. Open PR #111 moves to the final types but has no CSV export | Yes, with CSV export through the share sheet (#114, PR #127); types match `ANALYTICS_API.md` (checked by script against the Compose stack); on-screen check not verified | Not verified; analytics load measured only before #102/#104 | #108, #118, #122 |
| BF-19 GA4 | Yes, optional and off by default (`GA4_ENABLED=false`): organization connection, measurement endpoint, worker export of purchases and refunds, cached traffic report (#71); deterministic tests in the CI suite; live property not verified | #104 (#71) | Partial: consent-aware page views sent straight to GA4 from the browser (`web/README.md`); does not post the measurement contract or show the traffic report | No | No | — (client part: no issue) |
| BF-20 History, duplication, audit | Yes: request and job correlation IDs (`X-Request-ID`) carried into audit rows and outbox jobs (#78) | Early `main`, #24, #64 (filters), #104 (#78) | Yes | Yes | Not verified | — |
| BF-21 Administration | Yes: settings applied to new commerce operations (#70); moderation notices (#74); search across support cases, orders, activations, campaigns and sync conflicts with read-only detail (#72); jobs and deliveries with bounded retry (#73) | #24, #64 (commerce monitoring), #102 (#70, #74), #104 (#72, #73) | Partial: users, events, orders and tickets search, moderation, reports, settings and exports; paid-sales suspension and payment/refund lists not wired (in open PR #111); operations search and jobs/deliveries not wired | Yes: paid-sales suspend/reinstate and payment, failed-payment and refund lists with CSV export (#113, PR #126); inspection with read-only details and jobs/deliveries with retry (#116, PR #128); checked by script against the Compose stack, retry seen on the emulator | Not verified | #109, #110, #119, #122 |
| BF-22 Operations and integration | Yes: private S3-compatible storage on SeaweedFS with whole-bucket backup (#77); ClamAV service; correlation IDs, redacted structured logs and in-process metrics (#78) | #59 (issue #57), #60 (issue #56), #87–#89, #95, #104 (#77, #78) | n/a | n/a | Restore drill with SeaweedFS and smoke passed only in PR #104's runs, not on `main`; process-kill and load harnesses not rerun with S3 storage; HTTPS not verified | #49, #117, #118 |
| SRS 7 Localization (kk/ru/en) | Yes (#43) | #64 | Yes (#46, PR #63) | Yes (#52): web catalogs plus app-only text; not verified on a device | Not verified | #53 |

## Remaining work

Tracked in #125. Done since the 13 November update: #67, #70, #74 (PR #102); #71, #72, #73,
#75, #76, #77, #78, #81 (PR #104); mobile moderation notices and hold time (PR #105); #113
(PR #126); #114 (PR #127). No date is attached to any of the steps below.

1. **Clients.** These can start now; recheck them if #119 or #122 changes a contract.
   - Web: #107 gallery cover, reorder and delete; #108 analytics and finance on the final
     contracts, with CSV export; #109 admin paid-sales suspension and payment/refund monitoring.
     Open PR #111 covers most of these three, but not the analytics CSV export. Then #110 admin
     operations search, jobs and deliveries; #112 upload scan status; #49 HTTPS and security
     headers for the shared demo.
   - Mobile: #115 offline result screen per [decision 0003](../decisions/0003-confirmed-decisions.md);
     #116 admin operations and upload scan status; #53 real iPhone and Android phones. #54
     (installable builds) was closed on 17 November, although #125 still lists the iOS build as
     left.
2. **Validation.** #117 rerun the process-kill and load harnesses and the restore drill on the
   current `main`, get green *Smoke* and *Backup* runs there, and record the results in
   `backend/VALIDATION.md`; #118 keep check-in fast while analytics runs; #119 example requests
   and errors for the #104 endpoints, which #110 and #116 build on.
3. **End-to-end and acceptance.** #122 compare client types with the final contracts; #120
   browser end-to-end tests with Playwright in CI; #121 walk through AC-01 to AC-28 on the
   integrated stack, with results in `docs/integration/acceptance.md` linked from here. These
   need steps 1 and 2.
4. **Owner.** #123 open decisions (answered by decision 0003); #124 this report and the README.

Not yet in any issue:

- BF-19 clients: no client posts the measurement contract (`POST /api/v1/analytics/measurements`)
  or shows the organizer GA4 connection and traffic report. The web sends page views to GA4
  directly; the mobile app sends nothing.
- Web checkout hold hint: "10 minutes" is fixed text in kk/ru/en, while the hold length is now a
  platform setting. The mobile app reads it since PR #105; open PR #111 does not change the web
  text.
- Web moderation and account notice links: fixed in open PR #111, but none of #107–#112 lists them.

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
The one consequence for the code is #115, which changes the mobile offline result screen.
