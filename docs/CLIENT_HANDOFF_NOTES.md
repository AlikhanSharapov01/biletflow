# Client handoff notes for the `dauka-backend` increment

Backend changes that the mobile scanner (Adil) and the web client (Yershuak) must adopt. All paths are
relative to `/api/v1`. Errors are always `{"detail": {"code": "...", ...}}`. Request bodies reject unknown
fields (`422 invalid_input`). The per-area guides in `backend/*_API.md` are authoritative.

## For Adil: mobile scanner

### 1. Entry confirmation is required by default

With `ADMISSION_REQUIRE_ENTRY_CONFIRMATION=true` (the default) the current app gets
`409 sign_in_required` on every check-in. For demos before the app is updated, set
`ADMISSION_REQUIRE_ENTRY_CONFIRMATION=false` in `.env`.

`POST /scanner/events/{event_id}/check-ins` takes exactly one of `qr_payload` | `ticket_id`, plus:

- `entry_confirmation`: the attendee's token `biletflow:entry:<base64url claims>.<base64url sig>`
  (the attendee's second QR), or
- `entry_code`: 8 digits (`^\d{8}$`), typed from the attendee's screen or printed ticket;
- optional `device_id` (registered device uuid), `operation_id` (uuid retry key; same key and same
  ticket returns the original result with `replayed: true`), `captured_at` (ISO with offset).

Success `200`: `{result: "admitted", check_in_id, ticket_id, event_id, attendee_name, ticket_type_name,
seat | null, checked_in_at, replayed}`.

New or relevant 409 codes to map on the result screen:

| Code | Meaning / UI |
|---|---|
| `sign_in_required` | No proof sent, or the attendee's session ended: ask them to open the ticket and tap "Confirm entry" |
| `confirmation_expired` | Older than about 120 s: ask for a new one |
| `confirmation_used` | Consumed, replaced by a newer one, or spent by an admission that was later reversed |
| `invalid_confirmation` | 422 forged/malformed; 409 for another ticket or event |
| `ticket_unclaimed`, `wrong_event`, `admission_not_open`, `admission_closed`, `operation_conflict` | existing |
| `already_checked_in` (+`checked_in_at`), `ticket_not_valid` (+`status`) | existing; duplicates are reported before confirmation checks |

Also: 404 `ticket_not_found` / `event_not_found` / `device_not_found`, 403 `device_revoked` /
`permission_denied`, 422 `not_a_ticket_qr`.

Gate flow: scan the ticket QR (`biletflow:ticket:...`) and the entry QR (`biletflow:entry:...`); tell
them apart by prefix and send both in one request. Reversal
(`POST /scanner/check-ins/{id}/reverse {reason}`, needs `reverse_checkin`) spends the old confirmation, so
the attendee must request a fresh one to be re-admitted.

### 2. Device registration (needed for offline)

- `POST /scanner/devices {device_key: 8-128 chars [A-Za-z0-9._:-], label: 1-100}`: 201 first time, 200 for
  the same owner, `409 device_key_taken`, `403 device_revoked`. Store the returned `id` as `device_id`.
- `GET /scanner/devices`, `POST /scanner/devices/{id}/revoke`.
- `GET /scanner/signing-keys`: `{algorithm: "Ed25519", entry_confirmation: {purpose, key_id, public_key},
  offline_package: {...}}`; `public_key` is raw 32-byte Ed25519, base64url without padding.

### 3. Manual attendee search

`GET /scanner/events/{event_id}/attendees?q=<2..100 chars>&limit=1..25` (default 10). `q` is a partial name
(case-insensitive, wildcards literal) or an exact email. Returns an array of `{ticket_id, attendee_name,
ticket_type_name, seat | null, status, claimed, checked_in, check_in_id | null}` (no email). Check in with
`{ticket_id, entry_code | entry_confirmation}`. Staff without `scan` get 403, strangers 404.

### 4. Offline package and sync

- `POST /scanner/events/{event_id}/offline-packages {device_id}` returns 201 `{package_id, snapshot_version,
  expires_at, server_time, content_hash, signing_key_id, signature, manifest}`. Expiry is the earliest of
  `OFFLINE_PACKAGE_MINUTES` (720), admission close + 1 h, and session end.
- **Verify the package:** `body` = canonical JSON of `manifest` (keys sorted recursively, separators `,` and `:`,
  UTF-8, non-ASCII not escaped; Python `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`).
  Check `sha256(body) == content_hash` and Ed25519-verify `signature` (base64url) over
  `"offline_package" + 0x00 + body` with `signing-keys.offline_package.public_key`.
- **Verify a ticket offline:** `sha256_hex(qr_payload without "biletflow:ticket:")` must equal a
  `manifest.tickets[].qr_hash` whose `status == "valid"` and that is not in `manifest.revocations[]` or
  `admitted_ticket_ids[]`.
- **Verify an entry token offline:** strip `biletflow:entry:`, split at the first `.`, base64url-decode the
  claims bytes, Ed25519-verify the signature over `"entry_confirmation" + 0x00 + claimsBytes` with
  `manifest.entry_confirmation.public_key`; claims are `{v: 1, cid, tid, eid, iat, exp}` (unix seconds). Require
  `tid` = ticket id (the part of `qr_payload` before the `.`), `eid` = event id, and `iat-60 <= now <= exp+60`.
- `POST /scanner/offline/sync {device_id, package_id, device_time, operations: [1..200]}`; each operation is
  `{operation_id, sequence_number (>= 1, unique per package), kind: "check_in" | "reverse", captured_at,
  qr_payload?, entry_confirmation? | entry_code?, parent_operation_id? (reverse only), reason? (reverse only)}`.
  A reverse carries `reason` and `parent_operation_id` and nothing else.
- Response `{package_id, event_id, server_time, device_time, clock_skew_seconds, results: [{operation_id,
  sequence_number, status: "accepted" | "duplicate" | "conflict" | "rejected", code, original_status?,
  check_in_id?, ticket_id?, conflict_id?}], refreshed: {snapshot_version, revocations, admitted_ticket_ids,
  counts, package_hint}}`. Keep operations queued until a status is stored. Re-sending an identical operation
  is safe (`duplicate`); changed content gives `operation_payload_mismatch`.
- Whole-batch rejections: `device_revoked`, `package_revoked`, `scanner_not_authorized`; 404 `package_not_found`
  for a wrong device/package pair. Captures after `expires_at` give `package_expired`; outside the admission
  window `outside_admission_window`. The entry-token session check is skipped offline.
- Label offline results as provisional and show the snapshot age. Stop accepting offline once `expires_at` passes.

### 5. Unchanged

Auth (`client_kind: "scanner"`, body refresh-token rotation), `/me`, `/scanner/events`,
`/scanner/events/{id}`, `/scanner/events/{id}/counts` match `scanner.ts` and `scannerMocks.ts`. Switch
`EXPO_PUBLIC_SCANNER_MOCKS=false` to use the real API.

## For Yershuak: web client

Existing calls in `web/src/main.js` (`/auth/register`, `/auth/login`, `/auth/password/forgot`,
`/auth/logout`, `/me`) are unaffected.

- **Attendee "Confirm entry" screen (needed for any admission):**
  `POST /tickets/{ticket_id}/entry-confirmations` (bearer, claimed recipient only) returns 201 `{id,
  ticket_id, event_id, token, code, issued_at, expires_at, expires_in_seconds (<= 120), signing_key_id}`.
  Render `token` as a second QR beside the ticket QR and show the 8-digit `code` large, with a countdown and a
  Refresh button (a new request revokes the previous one). Errors: 404 `ticket_not_found`, 409
  `already_checked_in` / `ticket_not_valid` / `admission_closed` / `sign_in_required`, 429 `rate_limited`
  (5/min per account).
- **Ticket PDF and delivery:** `GET /tickets/{id}/pdf` (bearer; fetch as blob; `409 ticket_not_valid` for
  refunded/cancelled), `GET /tickets/{id}/delivery` returns `{status: none | queued | sending | delivered |
  failed, attempt_count, last_error, last_delivered_at, resend_count, can_resend, next_resend_at,
  recipient_email}`, `POST /tickets/{id}/delivery/resend` returns 202 (429 `resend_too_soon` /
  `resend_limit_reached`).
- **Notifications inbox:** `GET /notifications?unread_only=&limit=&offset=` returns a plain array of `{id, kind,
  locale, title, body, event_id, target: {type: event | ticket | support_case, id}, payload, read_at,
  created_at}`; `GET /notifications/unread-count` returns `{unread}`; `POST /notifications/{id}/read`;
  `POST /notifications/read-all` returns `{updated}`. Kinds: `event_updated`, `event_cancelled`,
  `ticket_delivered`, `support_reply`, `support_status`.
- **Calendar:** `GET /events/{id}/calendar-links` returns `{google, outlook, office365, ics_path,
  ics_requires_sign_in, calendar_sequence}` (409 `event_cancelled`); `GET /events/{id}/calendar.ics` is
  anonymous only for public events, otherwise send the bearer token and download as a blob.
- **Support UI (REST under `/support`):** `POST /cases {kind: "attendee" | "organizer_platform", category,
  subject, body, client_message_id (uuid you generate), event_id | order_id | ticket_id | organization_id}`
  returns 201 `{case, message}` (200 on an identical retry); `GET /cases?view=mine|queue&status=&category=
  &event_id=&limit=&offset=` returns `{items, total, limit, offset}`; `GET /cases/{id}` has `viewer_roles` and
  `last_seq`; `GET /cases/{id}/updates?after=<seq>&limit=` returns `{items (type message | change), next_after,
  has_more}` (poll as a fallback); `POST /cases/{id}/messages {client_message_id, body}`; staff:
  `POST /cases/{id}/status`, `/assignment`, `/escalation`. Statuses: `open`, `in_progress`,
  `waiting_for_customer`, `resolved`. Attachments: see "Increment 2" below.
- **Support WebSocket:** `ws(s)://<host>/api/v1/support/ws` through Caddy on :8080. **The Vite dev proxy needs
  `ws: true` for `/api`**, otherwise connect via :8080. First frame within 10 s: `{"type": "auth", "token":
  "<access token>"}`, answered by `{"type": "ready"}` (else an `unauthorized` error and close 4401). Then
  `{"type": "subscribe", "case_id": ..., "after": <last seq>}`, followed by `{"type": "event", "case_id",
  "item": {...}}` frames (same shape as `/updates`); `unsubscribe`; `ping` gets `pong`. Errors: `invalid_frame`,
  `too_many_subscriptions` (20), `case_not_found`, `session_ended` (close 4401: refresh the token and reconnect
  with the last seq). De-duplicate by `seq`. The browser `Origin` must be in `ALLOWED_ORIGINS`.
- **Routes the backend links to:** `/verify-email#token=`, `/reset-password#token=`,
  `/staff-invitations/accept#token=`, `/tickets/{id}`, `/events/{id}`, `/support/cases/{case_id}`.
- **Admin:** everything under `/admin` (`GET /admin/me` gives 403 `admin_required` for non-admins; lists
  return `{items, total, limit, offset}`; `PUT /admin/settings/{key} {value, expected_version}` gives 409
  `setting_version_conflict`; CSV at `/admin/exports/{users|events|orders|tickets}.csv`). Platform admins are
  granted only by the operator CLI: `python -m app.admin_cli grant EMAIL`. Users report events with
  `POST /events/{id}/reports {category, description}` (200 + `duplicate: true` on repeats, 429
  `report_rate_limited`).

## Increment 2 (2026-10-26)

New in this increment: protected support attachments, stored ticket PDFs, a read-only check-in preview, organizer
check-in history and the attendee admission status. Nothing here changes an existing request or response shape
except where marked. The guides `backend/SUPPORT_API.md`, `backend/TICKET_PDF_API.md` and
`backend/ADMISSION_API.md` are authoritative. All paths are relative to `/api/v1`.

### For Adil: mobile scanner

- **Verification preview (optional, read-only).** `POST /scanner/events/{event_id}/verifications` (capability
  `scan`, 60 requests per minute per account) takes the same body as a check-in without `operation_id` and
  `captured_at` (exactly one of `qr_payload` | `ticket_id`, plus `entry_confirmation` | `entry_code`, optional
  `device_id`). It admits nobody, consumes no entry confirmation and writes no audit entry, so use it to show a
  "would admit" / "reject" screen before the real check-in. Response `200`: `{result: "would_admit" | "rejected",
  code (null, or the check-in code such as already_checked_in or confirmation_expired), ticket_id, event_id,
  attendee_name, ticket_type_name, seat | null, ticket_status, checked_in_at (only for already_checked_in),
  confirmation: "valid" | "not_required" | "missing" | "expired" | "used" | "invalid" | "sign_in_required" | null,
  checked_at}`. A rejection is still HTTP 200; 404/403/422 keep their usual meaning (`ticket_not_found`,
  `permission_denied`, `not_a_ticket_qr`, `invalid_confirmation`), and `429 rate_limited` after 60 previews a
  minute. A preview never guarantees the later check-in (another gate may admit the ticket first or the
  confirmation may expire), so always send the real check-in.
- **Offline conflicts (organizer review, no scanner change).** `POST /sync-conflicts/{id}/resolve` now also
  accepts `reverse_existing_check_in: true` with `reversal_reason`; the response adds `reversed_check_in_id`.
  This is for the organizer web screens, not for the scanner.

### For Yershuak: web client

- **Support attachments (upload, then link to a message, then download).**
  1. Upload one file to an existing case: `POST /support/cases/{case_id}/attachments?filename=<display name>`
     with the file itself as the raw request body (no multipart) and `Content-Type` set to `image/png`,
     `image/jpeg` or `application/pdf`. Response `201`: `{file_id, mime_type, size_bytes, sha256, status:
     "clean", expires_at}`. Upload as soon as the user picks a file; the file can be linked until `expires_at`
     (one hour). Errors: `415 unsupported_media_type`, `413 attachment_too_large` (default limit 5 MiB, see
     `ATTACHMENT_MAX_BYTES`), `422 attachment_empty`, `422 attachment_rejected` (the content does not match the
     type), `422 invalid_input` (missing `filename`), `429 rate_limited` (20 uploads per minute), `404
     case_not_found`.
  2. Send the message with the ids: `POST /support/cases/{id}/messages {client_message_id, body,
     attachment_ids: [file_id, ...]}`, at most 5 distinct ids (`ATTACHMENT_MAX_PER_MESSAGE`; more than 5 `attachment_ids` gives `422 invalid_input`). A file that is
     already linked, expired, someone else's or from another case gives `409 attachment_not_available` with
     `{code, file_id}` and nothing is saved. **Attachments cannot be sent with `POST /support/cases`** (a case
     must exist before a file can be uploaded): put files on the first follow-up message.
  3. Messages (in `/messages`, `/updates`, the WebSocket `event` frames and the send responses) now carry
     `attachments: [{id, file_id, original_filename, mime_type, size_bytes, created_at}]` (an empty array when
     none). Use `id` for the download link below.
  4. Download: `GET /support/cases/{case_id}/attachments/{attachment_id}/download-link` (bearer) returns `{url,
     expires_at}` where `url` is `/api/v1/support/attachments/<id>/content?token=...`, valid for about 300
     seconds. Open it directly (new tab, `<img src>`, link); no `Authorization` header is needed because the
     token is the credential. Request a new link for every click instead of caching the URL. The response has
     `Content-Disposition: attachment`, so images shown inline need a fetched blob or the link in an `<img>`
     tag. Errors: `401 download_link_invalid` / `download_link_expired`, `404 attachment_not_found` (also after
     the user lost access to the case).
- **Ticket PDF is now attached to the delivery email.** The ticket email is `multipart/mixed` with
  `biletflow-ticket-<id>.pdf` attached; `GET /tickets/{id}/pdf` and the delivery/resend endpoints are unchanged
  (the PDF is now stored privately and served from the stored copy for valid tickets). Delivery still works
  without the attachment if rendering fails, so do not assume it is always present. Mailpit
  (http://localhost:8025) shows the attachment.
- **Organizer check-in history** (staff with `attendees`; staff without it get `403 permission_denied`).
  `GET /events/{event_id}/check-ins?from=&to=&source=online|offline_sync&state=current|reversed&ticket_type_id=
  &q=&limit=1..200&offset=` returns `{items, total, limit, offset}`; each item is `{check_in_id, ticket_id,
  attendee_name, ticket_type_name, seat | null, source, accepted_at, captured_at, scanner: {id, display_name},
  device_label | null, operation_id, reversed_at | null, reversal: {reason, actor: {id, display_name},
  created_at} | null}`. `to` before `from` gives `422 invalid_range`; `q` is 2 to 100 characters (partial name,
  email never matched). Reversed admissions stay in the list.
- **Check-in CSV.** `GET /events/{event_id}/check-ins.csv` with the same filters (no paging) returns a download
  (`text/csv`, UTF-8 with BOM, `check-ins-<event_id>.csv`). Fetch it as a blob with the bearer token. More than
  10 000 matching rows gives `413 export_too_large`: narrow the date range.
- **Attendee admission status.** `GET /tickets/{ticket_id}/admission` (buyer or claimed recipient; others get
  `404 ticket_not_found`) returns `{ticket_id, status, checked_in_at, reversed_at, admission_window: {opens_at,
  closes_at}}`. Poll it (or use the ticket screen) to show "You are checked in" or "Admission was reversed".
- **Admin/organizer note.** Conflict review resolution (`POST /sync-conflicts/{id}/resolve`) can now also reverse
  the conflicting admission: `reverse_existing_check_in: true` plus `reversal_reason` (1 to 500 characters;
  needs `reverse_checkin` as well, else `403 permission_denied`); `409 no_admission_to_reverse` /
  `409 already_reversed`.

### Operations note for both

Uploaded files and ticket PDFs live below `STORAGE_ROOT`. In Docker Compose this is the `file_storage` volume at
`/app/var/storage` shared by `api` and `worker`; `docker compose down --volumes` deletes it. After pulling this
increment, rebuild and re-run the `migrate` service (`docker compose up --build`) so migration
`0009_files_admission` is applied and the app database role is granted on the two new tables.
