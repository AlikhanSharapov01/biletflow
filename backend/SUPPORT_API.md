# Support cases, messages and live updates

BF-16 (SRS 4.13; transaction TX-18). Attendees open cases from an accessible event, their own
order or a ticket assigned to them; organizers open platform cases. Organizer support staff work
attendee cases, escalate them to the platform, and platform admins work organizer and escalated
cases. **Attachments are not implemented yet** (see "Not implemented").

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
| `POST /cases/{case_id}/messages` | Body `{"client_message_id": "<uuid>", "body": "..."}`. `201` new, `200` identical retry (`replayed: true`), `409 client_message_conflict` for the same id with a different body |
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

## Tables (`0008_support`)

| Table | Purpose |
|---|---|
| `support_case` | One thread: requester, organization/event/order/ticket context (composite foreign keys keep them consistent), kind, category, status, assignee, escalation, `last_seq` |
| `support_message` | Append-only; unique `(case_id, author_user_id, client_message_id)` and `(case_id, seq)` |
| `case_change` | Append-only status/assignment/escalation history with `seq` |

Differences from the reference DDL: status value is `waiting_for_customer`; `seq` columns and
`last_seq`; `support_case_ck9` forbids order/ticket/escalation on platform cases.

## Not implemented

- **Attachments** (`stored_file`, `support_attachment`, upload limits, content validation,
  quarantine/malware handling, short-lived authorized downloads) are explicitly later. No
  attachment endpoint, table or storage dependency exists.
- Email-channel notifications through the BF-15 fan-out: support events create in-app inbox entries (`support_reply`, `support_status`) while the email link is sent by the support worker (`support_email`).
- Locale-specific email text (support emails are English).
