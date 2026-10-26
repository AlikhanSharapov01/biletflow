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
| `GET /cases` | Paginated list. `view=mine` (default, own cases) or `view=queue` (cases the caller works as support or platform). Filters `status`, `category`, `event_id`; `limit` 1-100 (default 50), `offset`. Returns `{items,total,limit,offset}` ordered by last activity |
| `GET /cases/{case_id}` | Case with `viewer_roles` and `last_seq` |
| `POST /cases/{case_id}/messages` | Body `{"client_message_id": "<uuid>", "body": "...", "attachment_ids": []}`. `201` new, `200` identical retry (`replayed: true`), `409 client_message_conflict` for the same id with a different body or a different `attachment_ids` list |
| `POST /cases/{case_id}/attachments?filename=<name>` | Upload one file (raw body). See "Attachments" |
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
participant (requester, support, platform) may upload, also to a resolved case. Response `201`:

```json
{"file_id": "<uuid>", "mime_type": "image/png", "size_bytes": 1234,
 "sha256": "<hex>", "status": "clean", "expires_at": "<timestamp>"}
```

- Allowed types: `image/png`, `image/jpeg`, `application/pdf`. Any other declared type is
  `415 unsupported_media_type` before the body is read. The leading bytes must match the declared
  type (magic number), otherwise `422 attachment_rejected`; a `stored_file` row with status
  `rejected` is kept for audit and no bytes are stored.
- `413 attachment_too_large` above `ATTACHMENT_MAX_BYTES` (checked while the body streams in);
  `422 attachment_empty` for an empty body; `422 invalid_input` for a missing or over-long
  (200 characters) `filename`. Path separators and control characters in `filename` become `_`.
- `429 rate_limited`: 20 uploads per minute per account. Non-participants get `404 case_not_found`.
- `expires_at` is one hour after the upload: until then the uploader can link the file.

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
object. The response carries `Content-Type` of the stored type, `Content-Disposition: attachment`
(ASCII `filename` plus UTF-8 `filename*`), `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`.

**Storage and configuration**: bytes are stored through `app/storage.py` (`FileStorage`,
`LocalFileStorage`) under `support/<case_id>/<file_id>`, metadata in `stored_file` and
`support_attachment` (migration `0009_files_admission`). The local backend writes atomically below
`STORAGE_ROOT` (default `var/storage`, relative to the working directory; use a persistent volume
in production); an S3-style backend is a future `FileStorage` implementation selected in
`storage_from_settings`. Settings: `STORAGE_ROOT`, `ATTACHMENT_MAX_BYTES` (default 5 MiB),
`ATTACHMENT_MAX_PER_MESSAGE` (default 5, max 20), `ATTACHMENT_LINK_SECONDS` (default 300).
Audit: `support.attachment_uploaded` (file id, size and type only). Upload validation is
synchronous: a file goes `pending` -> `clean` in the same request.

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
| `stored_file` | Private object metadata: key, purpose, validated type, size, SHA-256, `status` (`pending`, `clean`, `rejected`, ...), uploader, display name |
| `support_attachment` | Links one clean file (unique) to one message of the same case, with its display name |

Differences from the reference DDL: status value is `waiting_for_customer`; `seq` columns and
`last_seq`; `support_case_ck9` forbids order/ticket/escalation on platform cases.

## Not implemented

- Asynchronous malware scanning of attachments (uploads are validated by content type and size only; the `pending`/`quarantined` states are kept for a future scanner).
- Cleanup of uploaded files that are never linked.
- Email-channel notifications through the BF-15 fan-out: support events create in-app inbox entries (`support_reply`, `support_status`) while the email link is sent by the support worker (`support_email`).
- Locale-specific email text (support emails are English).
