# Integration status

Whole-project status per requirement area (BF-01 to BF-22 in
[the backend requirements](../BiletFlow_Backend_Requirements.md)), with the open work in
dependency order. Replaces the milestone checklist in issue #58, which predates PR #64.

- **Baseline:** `main` at `7dd19e0` (merge of PR #64), 12 November 2026; updated 13 November 2026
  for PRs #86–#95 (issues #65, #66, #68, #69, #79, #80, #82, #83, #84).
- **Sources checked:** `backend/app/**`, `web/src/api/**`, `mobile/src/api/**` and their feature
  screens, `backend/VALIDATION.md`, the `*_API.md` contracts, merged PRs, open issues and the
  GitHub Actions runs on `main`. Audit tracker: #85.
- Anything not checked against code, tests or a CI run is marked **not verified**.

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
| Backend PostgreSQL suite ([VALIDATION.md](../../backend/VALIDATION.md)) | Each of PRs #91–#95 ran the full suite locally on 13 Nov. With the bundled font (#82) the font case passes on macOS (545 passed, 0 failed on that branch). Not yet rerun as one combined suite after all five merged | Client flows, remote storage |
| Process-kill harness (`backend/tests/crash/`, opt-in `RUN_CRASH_TESTS=1`) | 10 scenarios: API/worker killed or frozen at commit, storage and SMTP boundaries; no duplicated orders, tickets, refunds, finance rows or files (#83, extended by #65 and #68) | Docker restart policy, power loss, remote storage |
| Load harness (`backend/tests/load/`, opt-in `RUN_LOAD_TESTS=1`) | 50 checkouts for 40 tickets plus 10 scanners: admission p95 312 ms alone, 453 ms with 5 analytics clients, 743 ms with 20 (target 2 s); no overselling or duplicate admission (#80) | Docker/Caddy, separate client machine, soak; the baseline is still a proposal |
| GitHub Actions on `7dd19e0` | *Backend API*, *Smoke* and *Backup* workflows succeeded | Browser or device behaviour |
| *Smoke* workflow (`tools/smoke_*.py`, API only) | Free registration and admission, duplicate and forged-QR rejection, paid activation and payment, campaign link/discount/report, refund | Any screen. #48 was closed on this API-level smoke; there is no browser (Playwright) suite in the repository |
| *Backup* workflow | Writers stopped during backup; an online backup that loses an image is detected; restore into a fresh stack checks orders, tickets, linked PDFs/images/attachments, audit, outbox keys and pending work (#69) | Remote object storage (#77) |
| *Web* workflow (last run `2a81549`) and *Mobile app* workflow (last run `acf17d7`) | Typecheck, unit tests, web build | End-to-end use against the API |

## Status matrix

Legend: **Yes**, **Partial**, **No**, **n/a** (not part of that client), **not verified**.

| Area | API complete | Merged | Web integrated | Mobile integrated | Acceptance verified | Open issues |
|---|---|---|---|---|---|---|
| BF-01 Accounts and sessions | Yes | Early `main` (issue #3) | Yes | Yes (Google sign-in is web only, by decision 0001) | API smoke covers register/verify/sign-in; client journeys not verified | — |
| BF-02 Organizations and staff | Yes | Early `main` (issue #4) | Yes | Yes | API smoke covers staff scan grant; rest not verified | — |
| BF-03 Events, discovery, images | Yes (image delete failed with 503 in the Compose stack until #95 granted the app role DELETE on `event_media`) | Early `main` (issue #4); images #64, #95 | Partial: image upload calls the live route; gallery order/cover/delete not wired | Yes: gallery upload, cover and delete; the event page does not show the cover yet; not verified on a device | Not verified | #45, #51 |
| BF-04 Venues and seating | Yes | Early `main` (issue #4); holds #25 | Yes | Yes | Backend concurrency tests only | — |
| BF-05 Ticket types and holds | Partial: hold length and limits ignore platform settings | #25, #64 (counters) | Yes; organizer counters not verified | Yes; organizer counters not verified | Backend tests; load harness shows no overselling (#89) | #70 |
| BF-06 Paid-sales activation | Partial: activation fee ignores platform settings | #25 | Yes | Yes | API smoke | #70 |
| BF-07 Checkout and free registration | Yes | #16, #25, #61 (promo) | Yes, including promo and zero-total | Yes, including promo and zero-total; not verified on a device | API smoke | #51 |
| BF-08 Payments (simulated) | Yes: stale refund results are ignored, unprocessable provider events are quarantined, request keys are stable (#93) | #25, #93 | Yes | Yes | API smoke; AC-07/08 backend tests and process-kill harness | — |
| BF-09 Campaigns and campaign QR | Partial: report not reconciled with analytics (fulfilment revalidation done in #91) | #61, #91 | Yes (PR #63) | Yes: list, create, edit, disable, QR, report; not verified on a device | API smoke | #67, #51 |
| BF-10 Tickets, PDF, delivery | Yes: committed PDFs kept, abandoned writes swept (#94); bundled Unicode font for Kazakh/Russian (#92) | #16, #24, #92, #94 | Yes | Yes (PDF via share sheet) | Backend and process-kill tests; client journeys not verified | — |
| BF-11 Online admission | Yes | #18, #24 | n/a (check-in history and CSV only) | Yes | API smoke; local p95 well under 2 s with and without analytics load (#89, baseline still proposed) | — |
| BF-12 Offline verification and sync | Yes | #24 | n/a | Partial: QR offline scanning on `main` (PR #59); physical-entry rule is an [open decision](../decisions/0002-decisions-to-confirm.md) | Not verified on devices | #53, #83 |
| BF-13 Refunds and cancellations (full-order only) | Yes (retry fix in #93) | #61, #93 | Yes (PR #63) | Yes: attendee request and cancel, organizer refund and ticket cancel; not verified on a device | API smoke | #51 |
| BF-14 Finance and simulated payouts | Partial: fees ignore platform settings | #64 | Yes: summary, payout request and simulator steps; not verified on a device | Partial: summary on planned contract; payouts not wired | Not verified | #70, #45, #51 |
| BF-15 Notifications | Partial: no admin view of exhausted deliveries; no moderation notices | #24, #61, #64 | Yes (inbox) | Yes (inbox) | Not verified | #73, #74 |
| BF-16 Support and attachments | Partial: no malware scan/quarantine; no recovery of abandoned uploads | #24 | Yes | Yes; document picker not tested on devices | Not verified | #75, #76, #53 |
| BF-17 Calendar | Yes | #24 | Yes | Yes | Not verified | — |
| BF-18 Organizer analytics | Partial: no export; campaign report reconciliation | #64 | Partial: planned contract (#45 analytics task open) | Yes; not verified on a device | Not verified; load not measured | #67, #81, #80, #45, #51 |
| BF-19 GA4 | No | — | Partial: optional consent-aware page views only (`web/README.md`); live property not verified | No | No | #71 |
| BF-20 History, duplication, audit | Partial: no request/job correlation IDs | Early `main`, #24, #64 (filters) | Yes | Yes | Not verified | #78 |
| BF-21 Administration | Partial: settings not applied to commerce; search/detail, failure views and notices missing | #24, #64 (commerce monitoring) | Partial: paid-sales suspend and payment/refund monitoring from #64 are not wired | Partial: same | Not verified | #70, #72, #73, #74 |
| BF-22 Operations and integration | Partial: local file storage only, no metrics | #59 (issue #57), #60 (issue #56), #87–#89, #95 | n/a | n/a | Backup/restore drill with file checks and smoke in CI; local load and process-kill harnesses; HTTPS not verified | #49, #77, #78 |
| SRS 7 Localization (kk/ru/en) | Yes (#43) | #64 | Yes (#46, PR #63) | No | Not verified | #52 |

### Gaps no issue tracks yet

- Admin paid-sales suspension and payment/refund monitoring (merged in #64) appear in neither
  client, and #45/#51 do not list them.
- Finance payout actions and gallery reorder/cover/delete are not in #45/#51 either; both list
  only "Finance tab" and "image upload".

## Remaining work in dependency order

From the audit in #85. Each step depends on the ones before it; no dates are attached.

Done on 12–13 November: #65, #66, #68, #69 (step 1 and part of step 2), #79, #82 (step 4) and
#80, #83, #84 (step 5 harnesses and docs).

1. **Campaign reporting, prospective settings, protected uploads:** #67, #70, #75, #76.
2. **Admin failure handling, triage and notices; object storage; observability:** #73, #72, #74,
   #77, #78. Object storage (#77) must keep the backup protocol from #69.
3. **GA4 and export, client integration:** #71, #81; web #45; mobile #51 (device
   click-through), #52, #55; shared HTTPS #49.
4. **Acceptance on the integrated stack:** devices #53 and builds #54; rerun the load (#80) and
   process-kill (#83) harnesses and the restore drill (#69) after steps 1–2 change the code, then
   update this document and `backend/VALIDATION.md` with the results.

Client work for areas already merged (#45, #51) does not have to wait for steps 1–2. It must be
rechecked if those steps change a contract.

Conditional, not blocking: payment-provider sandbox (merchant access) and live GA4 data
(property credentials).

## Out of scope (do not reopen)

Partial refunds and refund deductions, real-money payouts, advanced disputes and the other
exclusions in requirements §1.2. Issue #35 originally asked for "full or partial" refunds; only
the full-order refund was built, which matches the baseline.

## Decisions still to confirm

Proposed defaults and the offline physical-entry and retrospective-sync semantics are listed in
[decision 0002](../decisions/0002-decisions-to-confirm.md). Until the project owner confirms
them they stay proposals, even where the code already uses a value.
