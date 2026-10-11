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
  `waiting_for_customer`, `resolved`. Attachments are not implemented.
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
