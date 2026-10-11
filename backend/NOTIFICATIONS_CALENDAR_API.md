# Notifications and calendar export

Stage E, backend plan BF-15 (transactional notifications, in-app part and event/ticket/support
fan-out) and BF-17 (calendar exports and links). All endpoints are under `/api/v1` and return
errors as `{"detail": {"code": "..."}}`.

## Calendar (BF-17)

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /events/{event_id}/calendar.ics` | optional | RFC 5545 file, `text/calendar; charset=utf-8`, sent as an attachment |
| `GET /events/{event_id}/calendar-links` | optional | `{google, outlook, office365, ics_path, ics_requires_sign_in, calendar_sequence}` |

Neither endpoint asks for write access to any calendar account, and no response contains an
attendee identity, admission token or access secret.

### Who may export

| Viewer | Result |
|---|---|
| Anyone (no sign-in) | Only a `public`, `published`, unsuspended event. This is the tokenless public URL |
| Signed-in, any | Also `unlisted` published events (no tokenless URL for them: sign-in is required) |
| Signed-in with an access grant | `private` published events |
| Ticket recipient or confirmed-order buyer | The event in any state except `draft`, including unpublished, suspended and cancelled, so a cancellation always reaches them |
| Organizer owner / event staff (any event capability) | Every state, including drafts |
| Everyone else | `404 event_not_found` (never reveals whether the event exists) |

An invalid bearer token returns `401`. A cancelled event is therefore invisible to the public
and to people without a ticket, but staff and ticket holders still receive the cancellation.

### File contents

- `UID` is the existing `event.calendar_uid` (`<uuid>@biletflow`) and never changes.
- `SEQUENCE` is `event.calendar_sequence`. The event edit and cancel endpoints already increment it.
- `DTSTAMP` and `LAST-MODIFIED` are `event.updated_at`, `CREATED` is `event.created_at`: repeated
  exports of an unchanged event are byte-identical.
- `DTSTART;TZID=<event.time_zone>` and `DTEND;TZID=...` use the event's named time zone, with a
  generated `VTIMEZONE` (explicit STANDARD/DAYLIGHT observances for the years the event spans,
  so it is also correct for zones that dropped DST).
- `SUMMARY`, `DESCRIPTION` (description plus the event URL), `LOCATION` (venue name, address,
  city) and `URL` (`{FRONTEND_URL}/events/{id}`, a plain page that applies its own permissions).
- `STATUS:CONFIRMED`, or `STATUS:CANCELLED` once the event is cancelled (`METHOD:PUBLISH`,
  higher `SEQUENCE`, same `UID`).
- Text is escaped and lines are folded at 75 octets, UTF-8 safe.

A downloaded file does not update itself in every client. After an update or cancellation, ticket
holders receive a notification (below) that tells them to download the file again.

### Service links

`google`, `outlook` (outlook.live.com) and `office365` (outlook.office.com) are pre-filled
"add event" URLs (title, UTC start/end, location, description; Google also gets `ctz`). They are
refused with `409 event_cancelled` for a cancelled event. `ics_requires_sign_in` tells a client
whether the `.ics` URL can be shared as a plain link (`false` only for public events).

## Notifications (BF-15)

### API

| Method and path | Purpose |
|---|---|
| `GET /notifications?unread_only=&limit=&offset=` | Own inbox, newest first, `limit` 1-100 (default 50) |
| `GET /notifications/unread-count` | `{"unread": n}` |
| `POST /notifications/{id}/read` | Marks one as read (idempotent, keeps the first `read_at`); someone else's id is `404 notification_not_found` |
| `POST /notifications/read-all` | `{"updated": n}` |

An item: `id, kind, locale, title, body, event_id, target {type, id}, payload, read_at,
created_at`. `title` and `body` are rendered in the saved locale. `target.type` is `event`,
`ticket` or `support_case`; the notification does not grant access to the target: opening it
goes through that record's own endpoint and permission check.

### Kinds

| Kind | Raised by | Channels |
|---|---|---|
| `event_updated` | `PUT /events/{id}` when title, description, start, end, time zone or venue changed | in-app, email |
| `event_cancelled` | `POST /events/{id}/cancel` | in-app, email |
| `ticket_delivered` | free-checkout confirmation (claimed recipient) and `POST /tickets/claim` | in-app only: the ticket email already comes from `ticket_delivery_email` |
| `support_reply`, `support_status` | the support module, through the hook below | in-app, email |

Audience for event notices: accounts that are the recipient of a ticket of the event, plus buyers
of its confirmed orders (updates: valid or checked-in tickets only; cancellations also include
refund states). Suspended accounts are skipped.

### Pipeline

```text
business transaction
  -> INSERT outbox_job(kind=notification_fanout, deduplication_key, payload ids only)   same commit
worker (python -m app.worker)
  -> lease job, resolve audience, INSERT notification + notification_delivery per recipient
  -> email_once: lease one pending email delivery, send, record sent / retry / failed
```

- A failed fan-out or email never rolls back or delays the business result; a worker outage
  loses nothing because the outbox row is already committed.
- Fan-out jobs retry with backoff (up to 5 attempts, then `dead`, `last_error`
  `notification_fanout_failed`/`notification_fanout_exhausted`).
- Email deliveries keep `attempt_count`, `next_attempt_at`, `last_error` and a final status
  (`sent`, or `failed` after 5 attempts: `email_delivery_failed`; `recipient_unavailable` when
  the account is suspended or unverified). Exception text is never stored or logged.
- Deduplication: the outbox key (`notify-event-updated:{event}:{calendar_sequence}`,
  `notify-event-cancelled:...`, `notify-ticket:{ticket}`, `notify-support-...`) makes replays
  of the same business operation a no-op, and `UNIQUE (recipient_user_id, deduplication_key)`
  on `notification` protects the fan-out itself. Ticket validity never depends on email.
- Payloads contain ids, event title/time and a status label only: no QR payload, token, message
  text or secret.

### Recipient locale

The notification stores the recipient's `app_user.locale` when it is one of `kk`, `ru`, `en`,
otherwise the fallback `ru` (the account default). Email is rendered from the stored locale.

### Hook for the support module

```python
from app.notification_service import enqueue_support_notice

enqueue_support_notice(
    db,                       # the session of the business transaction
    recipient_user_id=user.id,  # already authorised against the case by the caller
    case_id=case.id,
    change="reply",           # or "status"
    change_id=message.id,     # the persisted message / case_change id (deduplication identity)
    event_id=case.event_id,   # optional
    status="resolved",        # optional label for change="status"
)
```

Call it once per recipient inside the transaction that persists the reply or status change. Only
ids and the status label are stored. The email links to `{FRONTEND_URL}/support/cases/{case_id}`
(assumed front-end route; the web client may rename it).

Other hooks: `enqueue_event_notice(db, event, "updated" | "cancelled")` (call after bumping
`calendar_sequence`) and `enqueue_ticket_delivered(db, ticket_id, event_id)`.

## Tables (`0005_notifications_calendar`)

| Table | Purpose |
|---|---|
| `notification` | Inbox row per recipient: kind, saved locale, deduplication key, safe payload, `read_at`; index `ix_inbox` |
| `notification_delivery` | One row per channel (`in_app` is recorded as sent at creation, `email` carries retries) |

The calendar needs no table. Both tables follow `docs/database`. The migration has no downgrade.

## Known limits

- Fan-out expands the whole audience in one transaction; very large events would benefit from batching.
- Resending a delivery and an admin view of exhausted failures are not implemented (there is no
  platform-admin module yet); failed rows are queryable in `notification_delivery`.
- Payment, refund, payout and registration-confirmation notices, and the SRS "payment failure
  must not contradict a later success" check, belong to the commerce modules and are not wired.
- Cancelling an event with sold tickets is still refused by the catalogue until refunds exist,
  so `event_cancelled` currently reaches holders only of events cancelled without sales; the
  fan-out already handles refund states.
- Order/ticket-scoped calendar URLs are not separate: ticket holders use the event endpoints.
