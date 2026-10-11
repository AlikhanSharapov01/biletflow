# Online admission (scanner) API

Stage D, online scope (SRS 4.8, backend plan BF-11). Signed-in attendee entry confirmation,
offline packages and device registration come later; see [Not yet implemented](#not-yet-implemented).

All endpoints are under `/api/v1/scanner`, need a verified signed-in account
(`Authorization: Bearer`) and return errors as `{"detail": {"code": "..."}}`.
Field names match `mobile/src/api/scanner.ts`, so the scanner app can switch off its mocks with
`EXPO_PUBLIC_SCANNER_MOCKS=false`.

## Who may scan

The organization owner, or organizer staff assigned to the event with the `scan` capability
(`PUT /events/{event_id}/staff`). Reversing a check-in needs `reverse_checkin`.
Anyone else gets `404 event_not_found`; staff without the capability get `403 permission_denied`.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /events` | Published events the caller may scan, ordered by start time |
| `GET /events/{event_id}` | One assigned event; `404` when it is not assigned |
| `GET /events/{event_id}/counts` | `{"event_id", "registered", "admitted"}` |
| `POST /events/{event_id}/check-ins` | Admit a ticket by its QR payload |
| `POST /check-ins/{check_in_id}/reverse` | Undo an admission; body `{"reason": "..."}` |

Event shape:

```json
{
  "id": "…", "title": "Scanner Demo Night",
  "venue": {"name": "…", "address": "…", "city": "…"},
  "starts_at": "…", "ends_at": "…", "time_zone": "Asia/Almaty",
  "admission_opens_at": "…", "admission_closes_at": "…",
  "time_status": "upcoming | active | completed"
}
```

## Check-in contract

Request:

```json
{
  "qr_payload": "biletflow:ticket:<ticket id>.<signature>",
  "operation_id": "optional client UUID for safe retries",
  "captured_at": "optional ISO time the device read the code"
}
```

| Status | `detail.code` | Meaning for the scanner screen |
|---|---|---|
| `200` | — | Admitted. Body: `result`, `check_in_id`, `ticket_id`, `event_id`, `attendee_name`, `ticket_type_name`, `seat`, `checked_in_at`, `replayed` |
| `409` | `already_checked_in` | Already used; `detail.checked_in_at` says when |
| `409` | `ticket_not_valid` | Cancelled, refunded or refund pending; `detail.status` says which |
| `409` | `ticket_unclaimed` | Ticket was bought for someone who has not linked it to an account |
| `409` | `wrong_event` | Genuine ticket for a different event |
| `409` | `admission_not_open` / `admission_closed` | Outside the admission window, or the event is not live |
| `409` | `operation_conflict` | `operation_id` was already used for a different ticket, or for an admission that was since reversed |
| `404` | `ticket_not_found` | Forged or edited QR |
| `422` | `not_a_ticket_qr` | Not a ticket QR at all, for example a campaign QR |
| `404` / `403` | `event_not_found` / `permission_denied` | Caller is not an authorized scanner for this event |
| `401` | `invalid_credentials` | Session expired |

Resending the same `operation_id` for the same ticket returns the original admission with
`"replayed": true`, so a scanner can retry after a network timeout without seeing a false
"already used".

## How one-time admission is guaranteed

The admission decision is one conditional update:
`UPDATE ticket SET status = 'checked_in' WHERE id = … AND status = 'valid'`.
When two scanners race, PostgreSQL lets only the first row update succeed; the second sees
`checked_in` and returns `already_checked_in`. The partial unique index
`uq_current_check_in (ticket_id) WHERE reversed_at IS NULL` backs this up in the database.
A test runs two scanners in parallel and expects exactly one admission.

QR codes are checked by looking up the SHA-256 of the signed payload in `ticket.qr_token_hash`;
the server never needs to trust anything the client says about the ticket.

## Reversal

`POST /check-ins/{id}/reverse` with a non-empty reason marks the check-in reversed, writes a
`check_in_reversal` row and returns the ticket to `valid`, so it can be admitted again. The
original check-in row is kept. Both admission and reversal are written to the event history
(`admission.checked_in`, `admission.reversed`).

## Tables (`0004_admission`)

| Table | Purpose |
|---|---|
| `check_in` | One row per accepted admission: ticket, event, scanner, session, operation id, times, `reversed_at` |
| `check_in_reversal` | One row per reversal with actor and reason |

`entry_confirmation_id` and `device_id` are nullable columns without foreign keys until those
tables exist, the same approach as the payment columns in `0003_checkout`.

## Demo smoke test

With the Docker stack running (`docker compose up --build -d db migrate api worker mailpit`):

```sh
cd backend
uv run python ../tools/smoke_admission.py
```

It registers accounts through real verification emails in Mailpit, issues a free ticket, assigns
a scanner and prints each step: admitted, then duplicate, unassigned, forged and campaign scans
rejected.

## Not yet implemented

- **Signed-in attendee entry confirmation** (BF-11): a short-lived proof from the attendee's
  account that the scanner checks together with the ticket QR. Today the ticket QR is shown only
  to its claimed recipient in their account, but a screenshot would still work.
- Manual attendee search for scanners, scanner device registration, offline packages and sync.
