# Online admission (scanner) API

Stage D (SRS 4.8, backend plan BF-11 and BF-12): online admission, signed-in attendee entry
confirmation, manual attendee search, scanner devices, offline verification packages and batch
synchronization. See [Not yet implemented](#not-yet-implemented) for what is still open.

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
  "entry_confirmation": "biletflow:entry:... (token from the attendee), or",
  "entry_code": "12345678 (8 digits, for printed tickets)",
  "device_id": "optional registered scanner device",
  "operation_id": "optional client UUID for safe retries",
  "captured_at": "optional ISO time the device read the code"
}
```

Send `ticket_id` (from [manual search](#manual-attendee-search)) instead of `qr_payload`; exactly one
of the two is required (`422` otherwise). Manual check-in follows every rule of a scan.

| Status | `detail.code` | Meaning for the scanner screen |
|---|---|---|
| `200` | — | Admitted. Body: `result`, `check_in_id`, `ticket_id`, `event_id`, `attendee_name`, `ticket_type_name`, `seat`, `checked_in_at`, `replayed` |
| `409` | `already_checked_in` | Already used; `detail.checked_in_at` says when |
| `409` | `ticket_not_valid` | Cancelled, refunded or refund pending; `detail.status` says which |
| `409` | `sign_in_required` | No entry confirmation was sent, or the attendee's session has ended |
| `409` | `confirmation_expired` | The confirmation is older than its short lifetime; ask the attendee for a new one |
| `409` | `confirmation_used` | Already consumed or replaced by a newer one (also after a reversal) |
| `422` / `409` | `invalid_confirmation` | Forged, edited, wrong purpose, or issued for another ticket/event |
| `404` / `403` | `device_not_found` / `device_revoked` | `device_id` is not an active device of this scanner |
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

## Entry confirmation (BF-11)

Rule: a ticket QR proves possession; admission also needs proof that the attendee is signed in
now. Controlled by `ADMISSION_REQUIRE_ENTRY_CONFIRMATION` (default `true`); when `false`,
check-in behaves exactly as before and ignores the confirmation fields.

`POST /api/v1/tickets/{ticket_id}/entry-confirmations` (attendee, signed in, must be the ticket's
claimed recipient and the ticket `valid`) returns `201`:

```json
{ "id": "...", "ticket_id": "...", "event_id": "...",
  "token": "biletflow:entry:<claims>.<signature>",
  "code": "04817392", "issued_at": "...", "expires_at": "...", "expires_in_seconds": 120,
  "signing_key_id": "..." }
```

* Short-lived (`ENTRY_CONFIRMATION_SECONDS`, default 120, never beyond the attendee's session),
  bound to one ticket and one event, signed with Ed25519 under its own purpose key.
* Show `token` as a QR beside the ticket, or read out `code` for a printed ticket.
* Asking again revokes the earlier confirmation, so a ticket has at most one live confirmation.
* Check-in consumes it in the same transaction as the admission (conditional update plus the
  unique `check_in.entry_confirmation_id`). If anything fails, nothing is consumed. A retry of
  the same `operation_id` returns the original admission without needing the confirmation again.
* A used ticket reports `already_checked_in` first, so duplicates are not masked.
* After a reversal the old confirmation stays spent: re-admission needs a fresh one.
* Errors for the request itself: `404 ticket_not_found` (not the recipient, or not a ticket),
  `409 ticket_not_valid` / `already_checked_in` (with `status`), `409 admission_closed`,
  `429` when requested too often.
* Token purposes never mix: the ticket QR (HMAC, `biletflow:ticket:`), the entry confirmation
  (`biletflow:entry:`, Ed25519 key "entry_confirmation") and the offline package (Ed25519 key
  "offline_package") use separate keys and prefixes; each is rejected where another is expected.

## Manual attendee search

`GET /scanner/events/{event_id}/attendees?q=<2+ characters>&limit=10` (scan permission on the
event; strangers get `404`, staff without `scan` get `403`). `q` matches part of the attendee
name (wildcards are literal) or an exact e-mail address. Each hit contains only:
`ticket_id, attendee_name, ticket_type_name, seat, status, claimed, checked_in, check_in_id`.
No e-mail, order, buyer or payment data. Check in with `{"ticket_id": ...}` as above.

## Devices and offline operation (BF-12)

Offline preparation, local verification, queuing and sync are supported; physical entry still
requires the online confirmation rule (see the requirements' boundary note). Results computed on
the device are provisional until synced.

| Method and path | Purpose |
|---|---|
| `GET /scanner/signing-keys` | Public Ed25519 keys and key ids for entry confirmations and packages |
| `POST /scanner/devices` | Register `{device_key (8-128 chars), label}`; `201` new, `200` same owner again, `409 device_key_taken` |
| `GET /scanner/devices` | The caller's devices |
| `POST /scanner/devices/{id}/revoke` | Stop a device; its uploads are rejected afterwards |
| `POST /scanner/events/{event_id}/offline-packages` | Body `{device_id}`; scan permission; returns the signed package |
| `POST /scanner/offline/sync` | Upload queued operations (1-200 per call) |
| `GET /events/{event_id}/sync-conflicts?status=open` (or `resolved`) | Organizer review list (capability `attendees`) |
| `POST /sync-conflicts/{id}/resolve` | `{note}`; records the gate outcome, never adds an entry |
| `GET /events/{event_id}/offline-operations?status=` | Every uploaded operation, including rejected ones |

### Package

`201` body: `package_id, snapshot_version, expires_at, server_time, content_hash,
signing_key_id, signature, manifest`. `signature` is Ed25519 over
`"offline_package" + 0x00 + canonical JSON of manifest` (sorted keys, separators `,` `:`, UTF-8),
checked with `signing-keys.offline_package.public_key`. The package expires after
`OFFLINE_PACKAGE_MINUTES` (default 720), one hour after admission closes, or when the session
ends, whichever is first. The manifest holds the event and window, `snapshot_version`
(the event's availability version), `generated_at`, the entry-confirmation public key, claimed
`tickets` (`ticket_id`, `qr_hash`, `ticket_type_name`, `holder` such as "Aru A.", `seat`,
`status`), `revocations` (refund pending, refunded, cancelled) and `admitted_ticket_ids`.
A device verifies a scanned ticket by `sha256_hex(payload without "biletflow:ticket:")`
against `qr_hash`, and an entry confirmation by Ed25519 over `"entry_confirmation" + 0x00 +
base64url-decoded claims` (claims: `cid, tid, eid, iat, exp`).

### Sync

```json
{ "device_id": "...", "package_id": "...", "device_time": "ISO time on the device now",
  "operations": [
    { "operation_id": "uuid", "sequence_number": 1, "kind": "check_in",
      "captured_at": "device time of the scan", "qr_payload": "...",
      "entry_confirmation": "..." },
    { "operation_id": "uuid", "sequence_number": 2, "kind": "reverse",
      "captured_at": "...", "parent_operation_id": "uuid of the check_in", "reason": "..." } ] }
```

Operations are processed in sequence order in one transaction; each gets an outcome
`{operation_id, sequence_number, status, code, check_in_id, ticket_id, conflict_id, original_status}`:

| `status` | `code` examples | Meaning |
|---|---|---|
| `accepted` | none | Became an authoritative `check_in` (`source = offline_sync`) or reversal |
| `duplicate` | original code | Same `operation_id` and content uploaded before; nothing changes; `original_status` says what it was |
| `conflict` | `already_checked_in`, `ticket_not_valid` | Admitted elsewhere, or refunded/cancelled since the snapshot; stored for organizer review, no second entry counted |
| `rejected` | `wrong_event`, `ticket_not_found`, `not_a_ticket_qr`, `ticket_unclaimed`, `sign_in_required`, `invalid_confirmation`, `confirmation_expired`, `confirmation_used`, `package_expired`, `outside_admission_window`, `admission_closed`, `operation_payload_mismatch`, `sequence_conflict`, `parent_not_found`, `parent_not_accepted`, `already_reversed`, `permission_denied`, `invalid_operation`, `device_revoked`, `package_revoked`, `scanner_not_authorized` | Not applied; kept and visible to the organizer |

Response also has `server_time`, `device_time`, `clock_skew_seconds` and `refreshed`
(`snapshot_version`, `revocations`, `admitted_ticket_ids`, `counts`).

Time: `captured_at` and `device_time` are device claims and are stored separately
(`offline_operation.captured_at`, `.device_reported_at`) from server receipt/processing time
(`created_at`, `processed_at`, `check_in.accepted_at`). The server never uses device clocks to
decide who was first; the order of acceptance is server order. Device time is only used for
two bounds: capture after `package.expires_at` is `package_expired`, and capture outside the
admission window is `outside_admission_window`.
An offline confirmation is accepted if its signature and bindings hold, it is unused, and the
capture time is within its lifetime (plus 60 s slack); the attendee's later sign-out cannot be
known by a disconnected device, so the session check applies only online.

Errors for the call itself: `404 package_not_found` (not this scanner's package or device).
If the device or package was revoked, or the scanner lost the `scan` permission, the call still
returns `200` and every operation is `rejected` (`device_revoked`, `package_revoked`,
`scanner_not_authorized`).

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

`0007_entry_offline` adds:

| Table | Purpose |
|---|---|
| `entry_confirmation` | Hashed token and code, ticket, event, attendee, session, expiry, `consumed_at`, `revoked_at`; unique live row per ticket |
| `scanner_device` | Registered installation, owned by one scanner account |
| `offline_package` | Issued package: device, session, snapshot version, expiry, content hash |
| `offline_operation` | Every uploaded operation with device and server times and its outcome; unique per (device, operation id) and (package, sequence) |
| `sync_conflict` | Open/resolved organizer review of a conflicting operation |

`check_in.entry_confirmation_id` and `device_id` now have composite foreign keys. Differences
from the long-term database specification: no `stored_file` (the manifest is regenerated; only
its hash is kept), `entry_confirmation.code_hash` was added, and the parent keys on `ticket` and
`auth_session` that would need new unique indexes are plain foreign keys checked in the service.

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

- Offline manifest in object storage (`stored_file`); it is generated per request.
- Real-time pushes of revocations to connected scanners; devices pull `refreshed` on sync.
- Reversing an accepted entry from the conflict review screen (use the reverse endpoint).
