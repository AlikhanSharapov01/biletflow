# Support cases, messages and live updates

BF-16 (SRS 4.13; transaction TX-18). Attendees open cases from an accessible event, their own
order or a ticket assigned to them; organizers open platform cases. Organizer support staff work
attendee cases, escalate them to the platform, and platform admins work organizer and escalated
cases. Participants can attach PNG, JPEG and PDF files to messages (see "Attachments").

All REST endpoints are under `/api/v1/support`, require a verified signed-in account
(`Authorization: Bearer`), and return errors as `{"detail": {"code": "..."}}`.

## Who can see and do what

Access is derived from current relationships on every request, never from a stored participant
list and never from knowing an ID. A user without a relationship gets `404 case_not_found`.

| Relationship | Condition | Allowed |
|---|---|---|
| `requester` | Opened the case | Read, reply (a reply reopens a resolved case) |
| `support` | Organization owner, or active member with an active `support` event-staff capability on the case's event, and the organization is active (attendee cases only) | Read, reply, change status, assign, escalate |
| `platform` | Active row in `platform_admin`, and the case is an organizer platform case or has been escalated | Read, reply, change status, assign |

`assigned_to_user_id` grants nothing by itself: revoking a capability, an organization
suspension or a platform-admin revocation removes access at once, including for the assignee and
live WebSocket subscriptions. A requester who is only a requester receives `403 permission_denied`
for staff actions. Responses show `display_name`/`id` of people, never email addresses.

`platform_admin` is created by migration `0006_admin_moderation` (BF-21). Grants are made with
`python -m app.admin_cli grant EMAIL`; there is deliberately no HTTP grant endpoint.

## Opening a case

`POST /cases` body:

```json
{
  "kind": "attendee",
  "category": "delivery",
  "subject": "Ticket email missing",
  "body": "I did not get my ticket",
  "client_message_id": "<uuid>",
  "event_id": "<uuid>", "order_id": "<uuid>", "ticket_id": "<uuid>"
}
```

Categories: `delivery`, `payment`, `refund`, `seating`, `event_info`, `check_in`, `account`,
`technical`. `subject` 1-200 characters, `body` 1-5000 characters.

**Attendee case** (`kind: attendee`): at least one of `event_id`, `order_id`, `ticket_id`.

- `order_id` must be an order the caller bought (`404 order_not_found` otherwise).
- `ticket_id` must be a ticket currently assigned to the caller (`404 ticket_not_found`).
- Event, order and ticket must agree (`422 context_mismatch`); when both order and ticket are
  given the ticket must be an item of that order. The event and organization are derived from the
  order or ticket; with only `event_id` the event must be visible to the caller (published,
  private events need an access grant) or `404 event_not_found`.
- Event-only context is the only one that requires current visibility: a buyer can still ask
  about a cancelled or unpublished event through their order or ticket.
- A recipient who did not buy the ticket can link the ticket but not the buyer's order.

**Organizer platform case** (`kind: organizer_platform`): `organization_id` is required and the
caller must be the owner or hold `manage_profile` (`404 organization_not_found` for outsiders,
`403 permission_denied` for members without it). An optional `event_id` must belong to that
organization. Orders and tickets cannot be linked (`422`). Only the requester and platform admins
can see these cases; organization colleagues cannot.

`client_message_id` is the retry key of the first message. Repeating the identical request returns
`200` with the original case (`message.replayed: true`); the same key with a different payload
returns `409 client_message_conflict`. Concurrent retries create one case.

Response `201`: `{"case": CaseView, "message": MessageView}`.

## Endpoints

| Method and path | Purpose |
|---|---|
| `POST /cases` | Open a case (above) |
| `GET /cases` | Paginated list. `view=mine` (default, own cases) or `view=queue` (cases the caller works as support or platform). Filters `status`, `category`, `event_id` and the exact triage identifiers `case_id`, `requester_user_id`, `order_id`, `ticket_id` (they only narrow the caller's own view); `limit` 1-100 (default 50), `offset`. Returns `{items,total,limit,offset}` ordered by last activity |
| `GET /cases/{case_id}` | Case with `viewer_roles` and `last_seq` |
| `POST /cases/{case_id}/messages` | Body `{"client_message_id": "<uuid>", "body": "...", "attachment_ids": []}`. `201` new, `200` identical retry (`replayed: true`), `409 client_message_conflict` for the same id with a different body or a different `attachment_ids` list |
| `POST /cases/{case_id}/attachments?filename=<name>` | Upload one file (raw body). See "Attachments" |
| `GET /cases/{case_id}/uploads/{file_id}` | The caller's own upload and its current `status` (e.g. while quarantined) |
| `GET /cases/{case_id}/attachments/{attachment_id}/download-link` | Short-lived signed link `{url, expires_at}` |
| `GET /attachments/{attachment_id}/content?token=` | Download the bytes; the token is the credential |
| `GET /cases/{case_id}/messages` | Messages only, `?after=<seq>&limit=` |
| `GET /cases/{case_id}/updates` | Messages **and** history (status, assignment, escalation) in order, `?after=<seq>&limit=`; returns `{items,next_after,has_more}`. This is the polling baseline |
| `POST /cases/{case_id}/status` | Staff. Body `{"status": "...", "reason"?}` |
| `POST /cases/{case_id}/assignment` | Staff. Body `{"assignee_user_id": "<uuid>" | null, "reason"?}` |
| `POST /cases/{case_id}/escalation` | Organizer support staff, attendee cases. Body `{"reason": "..."}` |

### Status rules

Statuses: `open`, `in_progress`, `waiting_for_customer`, `resolved`.

- Staff may move a non-resolved case to any other status (`409 status_unchanged` for no change).
  `resolved` is terminal for staff: a staff status change, assignment, escalation or reply on a
  resolved case returns `409 case_resolved`.
- A **requester reply reopens** a resolved case (`resolved` -> `open`, `resolved_at` cleared) and
  moves `waiting_for_customer` -> `in_progress`. Both are recorded as history items with reason
  `requester_reply`.
- Every status change, assignment and escalation is a history item (`change_kind`, `before_value`,
  `after_value`, `reason`) and an audit row. History is append-only (database trigger).

### Assignment and escalation

- The assignee must currently hold the `support` relationship (or `platform` for platform cases):
  `422 assignee_not_eligible` otherwise. Unassign with `null`. Repeating the current assignment
  returns `409 assignment_unchanged`.
- Escalation sets `escalated_at`, grants platform admins access, clears an organizer-side
  assignee (extra assignment history item) and keeps the organizer's access. It returns
  `409 already_escalated`, `409 not_escalatable` (platform cases) or `403` for requesters and
  platform admins. The requester asks for escalation in the thread; they cannot escalate.

## Attachments

Files are uploaded first and linked to a message afterwards; they are never public.

**Upload** `POST /cases/{case_id}/attachments?filename=<display name>`: the request body is the
file itself (no multipart) and the `Content-Type` header is its declared type. Any case
participant (requester, support, platform) may upload, also to a resolved case. Response `201`
for a clean file, `202` for a quarantined one (same body):

```json
{"file_id": "<uuid>", "mime_type": "image/png", "size_bytes": 1234,
 "sha256": "<hex>", "status": "clean", "expires_at": "<timestamp>"}
```

- Allowed types: `image/png`, `image/jpeg`, `application/pdf`. Any other declared type is
  `415 unsupported_media_type` before the body is read.
- **Content validation** (`app/file_content.py`, standard library only): the whole file must be
  structurally valid for its declared type, not just start with its magic number. PNG: chunk
  lengths and CRCs, a valid header, a palette where required, image data that inflates to exactly
  the declared size (bounded, so decompression bombs are refused) and nothing after `IEND`. JPEG:
  the marker/segment sequence from start to end-of-image with a frame header before the first
  scan, and nothing after end-of-image. PDF: a version header, a final `startxref` pointing at a
  cross-reference table whose in-use entries point at the objects they name (or at a
  cross-reference stream), a trailer with `/Root`, and nothing after the final `%%EOF`. Failing
  files get `422 attachment_rejected`; a `stored_file` row with status `rejected` is kept and no
  bytes are stored. Damaged files that viewers silently repair (for example a wrong `startxref`
  offset) are rejected too.
- **Malware scanning** (`app/malware_scanner.py`): a valid file is streamed to ClamAV's clamd
  (`INSTREAM` over TCP) before anything is stored. Infected: `422 attachment_infected`, a
  `rejected` row with `scanned_at`, no bytes stored, and the signature name in the audit row only.
  Clean: status `clean` (`201`). No verdict (clamd unreachable, timed out or answering with an
  error): fail closed. The file is stored with status `quarantined` (`202`) and an
  `attachment_scan` job is queued; the worker retries the scan with back-off (at most a minute
  apart) until it gets a verdict or the one-hour link window ends. A quarantined file is never
  linkable, listed or downloadable. A later clean verdict makes it `clean`; an infected one makes
  it `rejected` and deletes its bytes. Poll `GET /cases/{case_id}/uploads/{file_id}` (uploader
  only; others get `404 attachment_not_found`) to see the status change.
- `413 attachment_too_large` above `ATTACHMENT_MAX_BYTES` (checked while the body streams in);
  `422 attachment_empty` for an empty body; `422 invalid_input` for a missing or over-long
  (200 characters) `filename`. Path separators and control characters in `filename` become `_`.
- `429 rate_limited`: 20 uploads per minute per account. Non-participants get `404 case_not_found`.
- `503 storage_unavailable` when the object store fails or cannot be reached; the write intent is
  fenced as `deleted` (never linkable, see the upload lifecycle below) and the upload can be
  retried.
- `expires_at` is one hour after the upload: until then the uploader can link the file.

**Upload lifecycle and recovery** (#76): storage writes cannot join a database transaction, so a
stored upload is a committed `pending` write intent first (with `cleanup_after` at the end of the
link window), then the object write outside any transaction, then a finalizing transaction that
re-checks the uploader's session and case access and turns the intent `clean` or `quarantined`.
Losing access in between (revoked permission or session, suspended account) fails the upload with
the usual `404 case_not_found`/`401` and discards it. A storage failure is
`503 storage_unavailable`. After any failure the request re-reads the intent under a row lock:
a finalized file is kept (a lost COMMIT acknowledgement can mean it was saved), an unfinalized
intent is fenced as `deleted` and its object removed. If even that check fails, nothing is
deleted and the worker retires the intent later. A finalize that finds its intent already fenced
by the worker answers `409 attachment_upload_expired`.

The worker's 15-second pass (`reconcile_attachments`) claims at most 50 due files per pass:
intents of interrupted uploads and clean or quarantined uploads never linked by the end of their
link window become `deleted` with their bytes removed; bytes of a file the worker found infected
are removed (it stays `rejected`). A failed delete is retried after five minutes, and one final
idempotent delete runs 24 hours after the upload for a writer that stalled past cleanup. A file
linked to a message is never selected, whatever its status; linking clears its schedule. Index:
`ix_support_attachment_cleanup` (migration `0018_attachment_cleanup`, which also schedules
unlinked uploads made before it).

**Linking**: send the `file_id`s as `attachment_ids` in `POST /cases/{id}/messages`. `POST /cases`
takes no attachments (a file can only be uploaded to an existing case): attach files to the first
follow-up message. At most
`ATTACHMENT_MAX_PER_MESSAGE` distinct ids (`422 invalid_input` otherwise). Every file must be clean,
uploaded by the caller to this case, unexpired and not yet linked to a message; otherwise
`409 attachment_not_available` with `{"code": ..., "file_id": "<uuid>"}`, and nothing in the
request is saved. A file belongs to exactly one message.

**Reading**: every message in `/messages`, `/updates`, the WebSocket and the send responses has
`attachments: [{id, file_id, original_filename, mime_type, size_bytes, created_at}]` (only files whose status is `clean`). The private
storage key is never returned.

**Download**: `GET /cases/{case_id}/attachments/{attachment_id}/download-link` (bearer, case
participants only) returns `{"url": "/api/v1/support/attachments/<id>/content?token=...",
"expires_at": ...}` valid for `ATTACHMENT_LINK_SECONDS` (default 300). Clients open that URL
directly (browser tab, `<img>`, mobile viewer); no `Authorization` header is needed because the
HMAC token (attachment id, user id, expiry, signed with `CHALLENGE_SECRET`) is the credential.
On every request the server verifies the token (`401 download_link_invalid` or
`401 download_link_expired`) and re-checks that the token's user is still active and still
related to the case; a user who lost access gets `404 attachment_not_found`, as does a missing
object. If the object store fails or cannot be reached the answer is `503 storage_unavailable`
(after the same checks). The response carries `Content-Type` of the stored type, `Content-Disposition: attachment`
(ASCII `filename` plus UTF-8 `filename*`), `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`.

**Storage and configuration**: bytes are stored through `app/storage.py` (`FileStorage`) under
`support/<case_id>/<file_id>`, metadata in `stored_file` and `support_attachment` (migration
`0009_files_admission`). `STORAGE_BACKEND` selects the backend: `local` (default) writes
atomically below `STORAGE_ROOT` (default `var/storage`, relative to the working directory);
`s3` (`S3FileStorage`, used by Docker Compose, #77) writes to one private bucket on an
S3-compatible service (`S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`), see the [README](README.md#private-file-storage). Objects are never
public in either backend. Settings: `STORAGE_ROOT`, `ATTACHMENT_MAX_BYTES` (default 5 MiB),
`ATTACHMENT_MAX_PER_MESSAGE` (default 5, max 20), `ATTACHMENT_LINK_SECONDS` (default 300),
`MALWARE_SCANNER` (`clamav`, the default, or `disabled`), `CLAMAV_HOST` (default `localhost`;
Compose sets `clamav`), `CLAMAV_PORT` (3310), `CLAMAV_TIMEOUT_SECONDS` (15). The Compose `clamav`
service runs `clamav/clamav:1.4`; the API and worker do not wait for it, so uploads are quarantined
until it has loaded its signatures. `MALWARE_SCANNER=disabled` is only for local development
without ClamAV: uploads are marked `clean` without a scan (`scanned_at` stays empty, the audit row
says `scanned: False`), and `ENVIRONMENT=production` refuses it. The default never marks a file
clean without a scan.

Audit: `support.attachment_uploaded` (file id, size, type, resulting `status`, `scanned`; for an
infected upload the `malware` signature name) and `support.attachment_scanned` (service actor
`attachment_scanner`: the worker's later verdict, `status` and `malware` when infected).

### Examples and errors

Identifiers, times and the hash are illustrative. Requests carry `Authorization: Bearer <access
token>` unless stated. Timestamps are ISO 8601 with a UTC offset; parse `Z` and `+00:00` alike.
Errors are `{"detail": {"code": "..."}}`; the common ones are `401 invalid_credentials` (no or
invalid token, revoked session, inactive or unverified account), `422 invalid_input` (a malformed
id, enum or number; the body lists `fields` without echoing the input), `503 database_unavailable`
and `500 internal_error`.

**List cases** with `GET /cases`. This request is a staff member's queue narrowed to one order:

```text
GET /api/v1/support/cases?view=queue&status=open&order_id=2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471&limit=20
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "c58a3f12-90be-47d4-a6e1-3b7d92c05f84",
      "kind": "attendee",
      "category": "delivery",
      "subject": "Ticket email missing",
      "status": "open",
      "requester": {"id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12", "display_name": "Aigerim S."},
      "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
      "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
      "order_id": "2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471",
      "ticket_id": null,
      "assigned_to": null,
      "escalated_at": null,
      "resolved_at": null,
      "last_seq": 1,
      "created_at": "2026-11-17T09:05:41.220Z",
      "updated_at": "2026-11-17T09:05:41.220Z",
      "viewer_roles": ["support"]
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

| Status | `code` | When |
|---|---|---|
| 422 | `invalid_input` | `view`, `status` or `category` is not one of its values; an id filter is not a UUID; `limit` is outside 1-100 or `offset` is negative |

The filters only narrow the caller's own scope: one that matches nothing, or names someone else's
case, returns an empty page, never `403` or `404`.

**Upload a file** with `POST /cases/{case_id}/attachments`. The body is the file itself, and
`Content-Type` is its type:

```text
POST /api/v1/support/cases/c58a3f12-90be-47d4-a6e1-3b7d92c05f84/attachments?filename=receipt.png
Authorization: Bearer <access token>
Content-Type: image/png
Content-Length: 1234

<1234 bytes of PNG data, no multipart>
```

Response `201` for a clean file:

```json
{
  "file_id": "9d41e7b3-2c58-4a06-b3f9-d07a15e8c624",
  "mime_type": "image/png",
  "size_bytes": 1234,
  "sha256": "99ccb282d215006b2ea4c361273ce1d4666a879961a11c0dacd9c77fa4183253",
  "status": "clean",
  "expires_at": "2026-11-17T10:12:08.331Z"
}
```

Response `202`, the same fields, when the scanner gave no verdict and the file is quarantined:

```json
{
  "file_id": "4b0c8e26-71fa-4d93-8e5b-a2c963d1f705",
  "mime_type": "image/png",
  "size_bytes": 1234,
  "sha256": "99ccb282d215006b2ea4c361273ce1d4666a879961a11c0dacd9c77fa4183253",
  "status": "quarantined",
  "expires_at": "2026-11-17T10:12:08.331Z"
}
```

| Status | `code` | When |
|---|---|---|
| 429 | `rate_limited` | More than 20 uploads per account in the rate window (60 s by default), or 200 per address. `Retry-After` gives the window in seconds |
| 415 | `unsupported_media_type` | `Content-Type` is not `image/png`, `image/jpeg` or `application/pdf`. Checked before the body is read |
| 422 | `invalid_input` | `filename` is missing, blank or longer than 200 characters, or `case_id` is not a UUID. Checked before the body is read |
| 404 | `case_not_found` | The caller is not a participant of the case (also when access is lost during the upload) |
| 413 | `attachment_too_large` | The declared or streamed size is above the current upload limit (`upload_max_bytes` of `GET /settings/public`) |
| 422 | `attachment_empty` | The body is empty |
| 422 | `attachment_rejected` | The content is not a structurally valid file of the declared type |
| 422 | `attachment_infected` | The malware scanner found a signature |
| 409 | `attachment_upload_expired` | The cleanup worker fenced the upload before it was finalized; upload again |
| 503 | `storage_unavailable` | The object store failed or could not be reached; upload again |

**Poll an upload** with `GET /cases/{case_id}/uploads/{file_id}`. Only the uploader sees it. The
response has the fields of the upload response, with the current `status`:

```text
GET /api/v1/support/cases/c58a3f12-90be-47d4-a6e1-3b7d92c05f84/uploads/4b0c8e26-71fa-4d93-8e5b-a2c963d1f705
Authorization: Bearer <access token>
```

```json
{
  "file_id": "4b0c8e26-71fa-4d93-8e5b-a2c963d1f705",
  "mime_type": "image/png",
  "size_bytes": 1234,
  "sha256": "99ccb282d215006b2ea4c361273ce1d4666a879961a11c0dacd9c77fa4183253",
  "status": "clean",
  "expires_at": "2026-11-17T10:12:08.331Z"
}
```

`status` is `clean` (may be linked), `quarantined` (waiting for the scanner), `rejected` (the
scanner later found an infection) or `deleted` (never linked, then cleaned up).

| Status | `code` | When |
|---|---|---|
| 404 | `case_not_found` | The caller is not a participant of the case |
| 404 | `attachment_not_found` | No such upload, it belongs to another case, or someone else uploaded it (a case participant who did not upload it gets this too) |

**Download the bytes** with `GET /attachments/{attachment_id}/content?token=`. The `url` returned
by the existing `download-link` route is this path with its token. Send no `Authorization` header:

```text
GET /api/v1/support/attachments/6e3f9a21-b058-4c7d-91a4-0d52c8e7b316/content?token=<signed token>
```

Response `200`: the raw bytes as the body, with these headers (the file name is that of the
upload):

```text
Content-Type: image/png
Content-Disposition: attachment; filename="receipt.png"; filename*=UTF-8''receipt.png
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

| Status | `code` | When |
|---|---|---|
| 401 | `download_link_invalid` | The token is malformed, forged, or issued for another attachment |
| 401 | `download_link_expired` | The token is past its expiry (300 s by default) |
| 404 | `attachment_not_found` | The token's user lost access to the case or is inactive, the attachment is not `clean`, or the object is missing |
| 422 | `invalid_input` | `token` is missing, empty or over 512 characters, or the id is not a UUID |
| 503 | `storage_unavailable` | The object store failed or could not be reached; ask for a new link or retry |

This route does not use the bearer token, so it never returns `401 invalid_credentials`.

### Stability

- **Stable.**
  - The upload response fields `file_id`, `mime_type`, `size_bytes`, `sha256` (64 hexadecimal
    characters) and `status`, plus the presence of `expires_at`.
  - `201` for a clean file and `202` for a quarantined one; `status` values `clean`,
    `quarantined` and `rejected`.
  - The `code` strings `unsupported_media_type`, `attachment_too_large`, `attachment_empty`,
    `attachment_rejected`, `attachment_infected`, `attachment_upload_expired`,
    `storage_unavailable`, `download_link_invalid`, `download_link_expired` and
    `attachment_not_found`, the `invalid_input` code (without its `fields`), and the `429` status
    of the upload limit.
  - The list envelope (`items`, `total`) and the new identifier filters `case_id`,
    `requester_user_id`, `order_id` and `ticket_id` (the case view itself is unchanged).
  - The download headers `Content-Disposition` (`attachment`, with `filename*`),
    `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- **May change.** Ignore unknown fields and statuses; no test asserts the following yet, so treat
  them as provisional.
  - The `expires_at` value (one hour after the upload today) and the exact `Retry-After` and window
    of the upload limit (a setting).
  - The `status` values `pending` and `deleted`: they belong to the upload lifecycle, and a client
    only meets `deleted` after cleanup.
  - The code `rate_limited` (the tests assert only the `429` status), the `case_not_found` code on
    the uploads route, and the `fields` list of `invalid_input`.
  - The exact `filename` fallback characters in `Content-Disposition`.

## Cursor, polling and ordering

Each case keeps a counter `last_seq`. Every message and history item takes the next number while
the case row is locked, so `seq` order equals commit order with no gaps and no late arrivals
behind a cursor. Clients remember the highest `seq` they processed and call
`GET /cases/{id}/updates?after=<seq>`; poll every few seconds when the socket is down. Replaying
the same page is safe (items are identified by `seq`/`id`). The reference DDL's
`(created_at, id)` cursor was replaced by `seq` because timestamps of concurrent transactions are
not commit-ordered.

## WebSocket live delivery

Path: **`/api/v1/support/ws`** (covered by the existing Caddy `/api/*` matcher; the Caddy
`reverse_proxy` forwards upgrades without extra configuration).

1. Connect. If the browser sends an `Origin`, it must be in `ALLOWED_ORIGINS` (otherwise close
   1008).
2. Within 10 seconds send `{"type":"auth","token":"<access token>"}`. A token in the URL is not
   supported (it would reach access logs). Failure: `{"type":"error","code":"unauthorized"}`
   then close 4401. Success: `{"type":"ready"}`.
3. `{"type":"subscribe","case_id":"<uuid>","after":<seq>}` (up to 20 per connection). Access is
   checked at subscribe: `{"type":"error","code":"case_not_found","case_id":...}` for outsiders,
   otherwise `{"type":"subscribed","case_id":...,"after":N}` followed by every item with
   `seq > N` as `{"type":"event","case_id":"...","item":{...}}` where `item` is a message
   (`type: message`) or history item (`type: change`) exactly as in `/updates`.
4. `{"type":"unsubscribe","case_id":...}`, `{"type":"ping"}` -> `{"type":"pong"}`. Malformed
   frames get `{"type":"error","code":"invalid_frame"}`.

Guarantees:

- A message or change is committed to PostgreSQL (with audit and outbox rows) **before** anything
  is pushed. The API process only wakes sockets after commit; delivery re-reads PostgreSQL, so a
  failed or absent socket, a lost wake-up or another API process never affects the business
  result, and reconnecting with the last `seq` recovers everything. A 2-second poll also covers
  commits made by other processes.
- Authorization is re-checked on **every delivery**. Staff whose capability is revoked, a
  suspended organization, a revoked platform admin or an ended session stop receiving: the server
  sends `{"type":"error","code":"case_not_found"}` (subscription removed) or `session_ended`
  (close 4401). An access token's own expiry is only checked at authentication; the connection
  lives as long as its session, so clients reconnect after refresh.
- The client is expected to deduplicate by `seq`. No typing indicators.

## Audit and notifications

Written in the same transaction as the business change: `support.case_opened`,
`support.message_sent` (message id only, never text), `support.status_changed`,
`support.assigned`, `support.escalated` (`audit_log` rows scoped to the organization and event).
The same transaction inserts `outbox_job` rows of kind `support_email` (deduplicated by
`support:<reason>:<ref>:<recipient>`) for the other participants: staff on a new case or customer
reply (the assignee when set), the requester and assignee on staff replies, status changes and
assignment, and staff plus platform admins on escalation. `python -m app.worker` sends them after
commit; the email carries only a link to `{FRONTEND_URL}/support/{case_id}`, never message text,
and is skipped if the recipient has lost access by then. In-app notification records belong to
BF-15 and are not created here.

## Tables (`0008_support`, attachments in `0009_files_admission`)

| Table | Purpose |
|---|---|
| `support_case` | One thread: requester, organization/event/order/ticket context (composite foreign keys keep them consistent), kind, category, status, assignee, escalation, `last_seq` |
| `support_message` | Append-only; unique `(case_id, author_user_id, client_message_id)` and `(case_id, seq)` |
| `case_change` | Append-only status/assignment/escalation history with `seq` |
| `stored_file` | Private object metadata: key, purpose, validated type, size, SHA-256, `status` (`pending`, `quarantined` awaiting a scan, `clean`, `rejected` malformed or infected, `deleted`), `scanned_at`, uploader, display name |
| `support_attachment` | Links one clean file (unique) to one message of the same case, with its display name |

Differences from the reference DDL: status value is `waiting_for_customer`; `seq` columns and
`last_seq`; `support_case_ck9` forbids order/ticket/escalation on platform cases.

## Not implemented

- Email-channel notifications through the BF-15 fan-out: support events create in-app inbox entries (`support_reply`, `support_status`) while the email link is sent by the support worker (`support_email`).

Support emails are localized (kk/ru/en with English fallback, using the account's locale); see
[NOTIFICATIONS_CALENDAR_API.md](NOTIFICATIONS_CALENDAR_API.md#recipient-locale).
