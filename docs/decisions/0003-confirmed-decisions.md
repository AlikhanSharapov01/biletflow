# 0003 — Offline admission and planning defaults are confirmed

- **Status:** Accepted (decided by the project owner, 19 November 2026)
- **Answers:** every question in [decision 0002](0002-decisions-to-confirm.md), which is now closed
- **Related:** requirements §1.1, BF-12 boundary note, §12 item 4; issues #123, #115, #84

## Context

Decision 0002 listed what was still unconfirmed: whether an offline scan may let someone in (A1),
what a later sync means for an offline scan (A2), and the planning defaults the code had already
picked (B). The project owner has now answered all of them. In every case the answer keeps the
current baseline or the current code; nothing new is introduced.

## Decision

### A1. Offline results never let someone through the door

**Keep the baseline.** An offline scan that passes local checks means "looks valid, connect to
confirm before entry". It does not admit anyone by itself, and it must not be shown in the
admitted style. Physical entry still requires online confirmation.

The rules that already say this stay as they are: BF-12 and its boundary note, requirements §1.1
"Offline admission", the offline section of
[ADMISSION_API.md](../../backend/ADMISSION_API.md#devices-and-offline-operation-bf-12), and the
acceptance wording of AC-21.

The mobile app on `main` does not meet this yet: a passing offline scan shows "Accepted offline"
in the green admitted style. Issue #115 changes that screen.

### A2. Later sync keeps the current backend rules

The behaviour described in 0002 A2 and implemented in `backend/app/offline_service.py` is
confirmed as it is. An accepted offline operation becomes an authoritative check-in
(`source = offline_sync`) dated by the device's `captured_at`, with the server receipt time stored
separately. The answers to the four questions:

1. **Does device time decide whether a scan fell inside the admission window?** Yes. The admission
   window and the entry confirmation are judged at the device's `captured_at`, bounded by the
   offline package expiry. A capture after the package expired is rejected (`package_expired`).
2. **Event cancelled or suspended between the scan and the sync?** The operation is rejected with
   `admission_closed`. It is not recorded as a conflict. The event must still be published and not
   suspended when the sync arrives.
3. **Refund that started after the snapshot, for someone already let in offline?** The refund
   stands. The scan becomes a `conflict` for organizer review and no entry is counted. The same
   applies to a ticket admitted elsewhere or cancelled after the snapshot. Resolving a conflict
   records a note and can optionally reverse the other admission; it never adds an entry. No
   separate escalation is added.
4. **Do conflicts and rejected offline scans appear in attendance?** No. They appear only in the
   organizer's review list. Attendance counts only server-accepted check-ins.

Because of A1, these cases describe what happens to records, not to people at the door: nobody
should have been let in on an offline result alone.

### B. Planning defaults are confirmed product rules

All values in the 0002 B table are confirmed. Since #70 (merged in PR #102), new holds, quotes and
activations read the hold length, processing rate and activation fee from the admin platform
settings in force at that moment (see [ADMIN_API.md](../../backend/ADMIN_API.md#platform-settings)).
For those three, the value below is the confirmed default the setting starts from; an admin change
applies only to new records. The values were checked against the code on 19 November 2026.

| Topic | Confirmed value | Where |
|---|---|---|
| Checkout hold | 10 minutes (platform setting `hold_minutes`, range 1–60); at most 3 active holds per account (fixed) | `admin_schemas.py`, `checkout_schemas.py` |
| Processing fee (demo) | 3% (platform setting `processing_rate_bps` = 300) of the amount actually collected, rounded once per order | `admin_schemas.py`, `pricing.py` |
| Paid-sales activation fee (demo) | KZT 5,000 per event (platform setting `activation_fee_minor` = 500000), saved on the activation when it starts | `admin_schemas.py`, `activation_service.py` |
| Refund policy | Set per event by the organizer (allowed or not, optional cutoff no later than the start); full-order refunds only | `CATALOG_API.md`, `REFUNDS_API.md` |
| Entry confirmation lifetime | 120 seconds (configurable 30–600) | `config.py` |
| Entry confirmation required at the door | On by default, switchable with `ADMISSION_REQUIRE_ENTRY_CONFIRMATION` | `config.py` |
| Offline package lifetime | 12 hours (configurable 5 minutes to 48 hours), cut short by the scanner's session expiry or one hour after admission closes, whichever is earliest | `config.py`, `offline_service.py` |
| Simulated payout eligibility | Only after the event ends | `FINANCE_API.md` |
| Staff invitation lifetime | 7 days | `CATALOG_API.md` |
| Event gallery | 10 images per event; unlinked uploads cleaned after 1 hour | `CATALOG_API.md` |
| Support attachments | 5 MiB each, 5 per message, download links valid 5 minutes. The size limit is the platform setting `upload_max_mb` (default 5), never above the 5 MiB deployment cap | `config.py`, `ADMIN_API.md` |
| Ticket email resend | 60-second cooldown, at most 5 resends | `ticket_document_service.py` |
| Promo codes | One code per order; a refund does not give the redemption back | `CAMPAIGNS_API.md` |
| Account language | New accounts default to Russian; emails fall back to English | `NOTIFICATIONS_CALENDAR_API.md` |
| Audit and history retention | Kept for the life of the project; no production retention policy | Requirements §1.1 |

**Not covered here:** the load-test baseline (50 concurrent checkouts and 10 scanners, admission
p95 under 2 seconds) was not part of the 0002 B table and stays a proposal. It is revisited with
the load work in #117 and #118.

A later change to any of these values is a product decision and needs a new decision record. An
admin changing one of the four platform settings within its allowed range is normal operation and
does not.

## Consequences

- **Mobile (#115):** the offline scan result must say that the ticket looks valid and that the
  phone must connect to confirm before entry. It must not use the admitted style or the word
  "Accepted". `@qa` adds a regression for this screen.
- **Backend, web and database:** no change. The checked code already matches A2 and every value
  in B.
- **Documentation:** requirements §1.1, the BF-12 boundary note and §12 item 4 now call these items
  confirmed and point here. Text in the API documents that calls a value an "implementation
  default" stays accurate; that value is now also the confirmed product rule.

## Not reopened

- Refunds return the full order amount actually paid. Partial refunds and refund deductions are
  excluded (§1.1, §1.2).
- The mobile app covers every web feature plus the scanner ([decision 0001](0001-mobile-app-full-scope.md)).
- Payments and payouts are simulated; no real money moves (§1.2).
- Unrestricted disconnected admission and production-grade offline guarantees stay excluded (§1.2).
