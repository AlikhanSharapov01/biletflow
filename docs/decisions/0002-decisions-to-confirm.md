# 0002 — Decisions still to confirm

- **Status:** Open. Nothing here is accepted until the project owner confirms it.
- **Related:** requirements §1.1 (planning defaults), BF-12 boundary note, §12 item 4;
  [decision 0001](0001-mobile-app-full-scope.md); issue #84.

## Why this record exists

The requirements separate confirmed decisions (§1) from proposed planning defaults (§1.1). Since
then the code has picked concrete values for many of those proposals, and the mobile app has
started showing offline scan results. A value being in the code does not make it a confirmed
requirement. This record lists what still needs an answer, so nobody treats it as settled by
accident.

When the owner answers an item, record the answer in a new decision (or in requirements §1), then
remove it from this list.

## A. Offline admission semantics

### A1. Can a provisional offline result let someone through the door?

- **Requirements today (BF-12 boundary, §1.1 "Offline admission"):** the proposed baseline
  requires online confirmation before physical entry. Offline mode prepares, verifies locally,
  queues and syncs, but does not promise disconnected admission.
- **Backend contract ([ADMISSION_API.md](../../backend/ADMISSION_API.md#devices-and-offline-operation-bf-12)):**
  says the same: physical entry still requires the online confirmation rule.
- **Mobile app on `main`:** an offline scan that passes local checks shows **"Accepted offline"**
  with the green admitted style and the line "Provisional until this phone syncs". Door staff
  will read that as "let them in".

The two disagree. The options:

1. **Keep the baseline.** An offline result means "looks valid, wait for a connection before
   entry". The mobile result screen must say so and must not use the admitted style.
2. **Allow provisional entry.** Staff may admit on an offline result. This accepts the stale-state
   risk the requirements describe: a refund, sign-out or admission on another device after the
   last sync is not visible at the door. It changes §1.1 and BF-12, and the acceptance wording of
   AC-21.

### A2. What does a later sync mean for someone already let in?

Current backend behaviour (`backend/app/offline_service.py`), to be confirmed or changed:

- An accepted offline operation becomes an authoritative check-in (`source = offline_sync`)
  dated by the device's `captured_at`, with the server receipt time stored separately.
- The admission window and the entry confirmation are judged at device capture time, bounded by
  the package expiry. The event must still be published and not suspended at sync time, otherwise
  the operation is rejected with `admission_closed`.
- A ticket admitted elsewhere, or refunded/cancelled after the snapshot, becomes a `conflict` for
  organizer review. No second entry is counted. Resolving it records a note and can optionally
  reverse the other admission; it never adds an entry.
- Rejected operations are kept and visible to the organizer, but they are not attendance.

Questions for the owner:

1. Is it acceptable that device time decides whether a scan fell inside the admission window?
2. If an event is cancelled or suspended between the scan and the sync, should the scan still be
   rejected, or recorded as a conflict?
3. Should a refund that started after the snapshot stay in force when the attendee was already
   let in offline, or should that case be escalated to a person? (Today the refund stands and the
   scan is a conflict.)
4. Should conflicts and rejected offline scans of people who did go in appear in attendance
   reports, or only in the review list? (Today only in the review list.)

## B. Proposed defaults now used by the code

These are the §1.1 and §12 item 4 proposals, with the value the code currently uses. Each one is
an implementation default, not a confirmed product rule.

| Topic | Current value | Where |
|---|---|---|
| Checkout hold | 10 minutes; at most 3 active holds per account | `checkout_schemas.py` |
| Processing fee (demo) | 3% of the amount actually collected, rounded once per order | `pricing.py` |
| Paid-sales activation fee (demo) | KZT 5,000 per event | `activation_service.py` |
| Platform settings for the three values above | Saved and versioned by admins, but checkout and activation still use the constants (#70) | `ADMIN_API.md` |
| Refund policy | Set per event by the organizer (allowed or not, optional cutoff no later than the start); full-order refunds only | `CATALOG_API.md`, `REFUNDS_API.md` |
| Entry confirmation lifetime | 120 seconds (configurable 30–600) | `config.py` |
| Entry confirmation required at the door | On by default, switchable with `ADMISSION_REQUIRE_ENTRY_CONFIRMATION` | `config.py` |
| Offline package lifetime | 12 hours (configurable 5 minutes to 48 hours) | `config.py` |
| Simulated payout eligibility | Only after the event ends | `FINANCE_API.md` |
| Staff invitation lifetime | 7 days | `CATALOG_API.md` |
| Event gallery | 10 images per event; unlinked uploads cleaned after 1 hour | `CATALOG_API.md` |
| Support attachments | 5 MiB each, 5 per message, download links valid 5 minutes | `config.py` |
| Ticket email resend | 60-second cooldown, at most 5 resends | `ticket_document_service.py` |
| Promo codes | One code per order; a refund does not give the redemption back | `CAMPAIGNS_API.md` |
| Account language | New accounts default to Russian; emails fall back to English | `NOTIFICATIONS_CALENDAR_API.md` |
| Audit and history retention | Kept for the life of the project; no production retention policy | Requirements §1.1 |

## Not open

These are already decided and are not reopened here:

- Refunds return the full order amount actually paid. Partial refunds and refund deductions are
  excluded (§1.1, §1.2), even though an early version of issue #35 mentioned them.
- The mobile app covers every web feature plus the scanner ([decision 0001](0001-mobile-app-full-scope.md)).
- Payments and payouts are simulated; no real money moves (§1.2).
