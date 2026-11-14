# Ticket PDF and delivery API

Backend plan BF-10 (ticket presentation). All endpoints are under `/api/v1/tickets`, need a
verified signed-in account (`Authorization: Bearer`) and return errors as
`{"detail": {"code": "..."}}`. No migration: delivery status is derived from the existing
`outbox_job` rows, so the schema stays at `0004_admission`.

## Endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `GET /tickets/{ticket_id}/pdf` | claimed recipient only | Download the A4 ticket PDF |
| `GET /tickets/{ticket_id}/delivery` | buyer of the order, or claimed recipient | Email delivery status |
| `POST /tickets/{ticket_id}/delivery/resend` | buyer of the order, or claimed recipient | Queue another ticket email |

Anyone else (other attendees, the organizer, an unclaimed recipient) gets
`404 ticket_not_found`, identical to an unknown ID. Knowing an ID grants nothing.

## PDF

* `200`, `application/pdf`, `Content-Disposition: attachment; filename="biletflow-ticket-<id>.pdf"`,
  `Cache-Control: no-store`. One A4 page, pure black on white (no colour operators), so it prints
  in grayscale.
* Content: event title, date and time in the event's own zone (`Asia/Almaty, UTC+05:00`), venue
  and city, seat (section/row/seat) when assigned, ticket type, attendee name, ticket ID, a
  `VALID` marker and entry instructions. Event data comes from the order-time snapshot, so later
  event edits do not rewrite an issued ticket.
* QR: drawn as vector squares, about 113 mm wide including a four-module quiet zone, error
  correction level M. It encodes exactly the canonical `qr_payload` (`biletflow:ticket:<token>`)
  that `GET /tickets/{id}` returns to the recipient. The token is not printed as text.
* No price, discount, order, payment or card data of any kind.
* Downloading repeatedly is a pure read: it creates no ticket, never rotates the token
  (`token_version`, `qr_token_hash` unchanged), and every copy encodes the same QR. A PDF proves
  possession only; admission still checks current server state and the attendee's sign-in
  (see [ADMISSION_API.md](ADMISSION_API.md)).
* Text uses DejaVu Sans, so Kazakh and Russian event titles, venues, ticket types and attendee
  names are embedded as real Unicode text (see [Fonts](#fonts)).

### Fonts

* DejaVu Sans 2.37 regular and bold are bundled in `app/fonts/` (`DejaVuSans.ttf`,
  `DejaVuSans-Bold.ttf`) with the upstream `LICENSE`. They come unchanged from the official
  release archive `dejavu-fonts-ttf-2.37.zip` at
  <https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37>. The Bitstream Vera /
  Arev license allows redistribution with the software if the license accompanies it and the
  fonts are not renamed or sold on their own; DejaVu's changes are public domain.
* Both faces cover the Russian alphabet and the Kazakh letters ә ғ қ ң ө ұ ү һ і in both cases.
  The font is subset into each PDF, so the text extracts and prints correctly.
* No setup is needed on Windows, macOS, Linux or Docker: the bundled directory is searched first,
  then the usual Linux DejaVu directories (`/usr/share/fonts/truetype/dejavu`,
  `/usr/share/fonts/dejavu`, `/usr/share/fonts/TTF`). The backend runs from source (`uv sync`
  installs dependencies only; there is no wheel), and the Docker image copies `app/` including
  `app/fonts/`.
* **Missing font:** if no DejaVu Sans pair can be loaded, nothing is rendered. There is no Latin-1
  fallback, so a Cyrillic name can never be printed as `?`. The server logs
  `ticket_pdf_font_unavailable` with the searched directories, and:
  * `GET /tickets/{ticket_id}/pdf` returns `503 ticket_pdf_unavailable` when it would have to
    render (a stored PDF of a `valid` ticket is still served). Retrying is safe once the font is
    restored; the failure is not cached.
  * The worker sends the ticket email without the attachment, as for any rendering failure.

### Refunded, cancelled and refund-pending tickets

Chosen behaviour: **refuse the download**. A ticket in `refund_pending`, `refunded` or
`cancelled` returns `409 ticket_not_valid` and no document is produced, so no printable copy of an
invalidated ticket can be created afterwards. The ticket stays in the user's history
(`GET /tickets/{id}` still shows its status). A copy printed earlier is rejected online by
admission, which checks the status in PostgreSQL. `valid` and `checked_in` tickets download
normally (a checked-in ticket is marked `VALID (checked in)`).

## Delivery status

```json
{
  "ticket_id": "…", "ticket_status": "valid", "recipient_email": "a@example.com",
  "status": "queued", "attempt_count": 0, "last_error": null, "last_delivered_at": null,
  "resend_count": 0, "can_resend": false, "next_resend_at": "2026-10-11T10:01:00Z"
}
```

`status` is derived from the newest `ticket_delivery_email` outbox job for the ticket:
`queued` (pending, including waiting for a retry), `sending` (leased by the worker),
`delivered` (done), `failed` (retries exhausted; `last_error` is the safe constant
`email_delivery_failed`), or `none`. A failed delivery never affects the order or ticket.
`recipient_email` is the address the buyer nominated; the response contains no QR payload.

## Resend

`POST /tickets/{ticket_id}/delivery/resend` returns `202` with the updated delivery view.

* Queues one more `ticket_delivery_email` job (`deduplication_key`
  `ticket-delivery:<id>:resend:<n>`), an `audit_log` entry `ticket.delivery_resent` and nothing
  else, in one transaction. The ticket row is locked, so concurrent resends cannot exceed the
  cooldown or cap.
* Does not rotate the QR token or create a ticket. Email goes to the nominated recipient address
  and links to `<FRONTEND_URL>/tickets/<id>`; like the original email it carries no QR or token.
  The recipient signs in to see or download the ticket.
* Limits: at most one job per 60 seconds per ticket (`429 resend_too_soon`), at most 5 resends
  per ticket (`429 resend_limit_reached`), plus the shared per-account/IP rate limit
  (`429 rate_limited`).
* `409 ticket_not_valid` unless the ticket is `valid`.

## Stored PDFs and the email attachment

The ticket delivery email carries the PDF as an `application/pdf` attachment named
`biletflow-ticket-<id>.pdf`, with the line "Your printable ticket is attached (A4,
grayscale-safe)." The worker renders the PDF once, between leasing the outbox job and sending,
stores it privately (`stored_file`, purpose `ticket_pdf`, status `clean`, key
`tickets/<ticket_id>/<file_id>.pdf`) and records it in `ticket.pdf_file_id`. Resends and
`GET /tickets/{ticket_id}/pdf` reuse the stored copy of a `valid` ticket; if the object is missing
it is re-rendered under the same key, and if storage cannot be read the endpoint renders on
request. A `checked_in` ticket is never served from storage (its PDF carries a "checked in"
mark), so it is rendered on request. The status rules are unchanged (`409 ticket_not_valid` outside
`valid`/`checked_in`, checked before storage is touched). If rendering or storage fails the email
is still sent without the attachment, and the ticket link keeps working. The PDF contains the QR
code, so it is never public: it is only reachable through the authenticated endpoint above or the
recipient's own mailbox.

Web client handoff: keep using `GET /tickets/{ticket_id}/pdf` for the download button; nothing
changes in the request or response. Do not expect the attachment on every email (it is
best-effort), and do not link to storage paths.

### Stored PDF lifecycle and recovery

Server-internal (#68; BF-10, BF-22, AC-26/27); no endpoint, request or response changes. A
storage write cannot join a PostgreSQL transaction, so a new object is written in three steps,
and no storage I/O ever happens while a row lock is held:

1. **Write intent.** A `stored_file` row (purpose `ticket_pdf`, status `pending`, its final key
   and checksum, `cleanup_after` = now + 1 hour) is committed before any byte is written.
2. **Object.** The PDF is written under that key, outside any transaction.
3. **Finalize.** Under a lock on the ticket and the intent row, the intent becomes `clean` and
   `ticket.pdf_file_id` points at it, in one transaction. If another writer finished first, this
   intent is marked `deleted` instead and the winner's object is served. An intent the sweep has
   already fenced (no longer `pending`) is never finalized: the rendered bytes are used for this
   one delivery, the writer removes its own object, and the next request stores a fresh copy.

If step 2 or 3 raises, the commit outcome is unknown (a lost COMMIT acknowledgement looks like any
other error). The writer re-reads the intent in a new transaction with a row lock, which waits for
an in-flight transaction on that row to commit or roll back:

| Re-read outcome | Action |
|---|---|
| Intent is `clean` and referenced (the commit landed) | Keep the object; the email gets the attachment |
| Intent is unreferenced `pending`/`deleted` (rolled back or never finalized) | Commit it as `deleted`, then delete the object |
| Re-read fails (database unreachable) | Delete nothing; the worker sweep handles it after the grace period |

The worker runs `reconcile_ticket_pdfs` with the hold sweep (every 15 seconds). It claims at most
50 unreferenced `pending`/`deleted` ticket-PDF rows whose `cleanup_after` has passed (`FOR UPDATE
SKIP LOCKED`), marks them `deleted` with a five-minute retry time, commits, re-checks that each row
is still deleted and unreferenced, and only then deletes the objects. After a successful delete
one last idempotent delete is scheduled 24 hours after the intent was created, to catch a
stalled writer that resumes late; after that the tombstone stays with no schedule. A failed delete
keeps the five-minute retry. A row referenced by a ticket, gallery image or support attachment, or
any `clean` row, is never selected. Tombstone rows are kept as history; the service never deletes
`stored_file` rows. Migration `0017_ticket_pdf_cleanup` only adds the partial index
`ix_ticket_pdf_cleanup` for this pass; its downgrade drops the index and keeps every row.

Effect: a process stop at any point leaves either a committed referenced PDF or a scheduled
intent, never an untracked object; retries end with exactly one `clean`, referenced, readable
document per ticket (abandoned intents remain as `deleted` rows).

## Not covered

- There is no separate invitation email for recipients without an account. The ticket delivery
  email goes to the recipient's address in any case and asks them to sign in with it. The in-app
  `ticket_delivered` notice exists ([NOTIFICATIONS_CALENDAR_API.md](NOTIFICATIONS_CALENDAR_API.md)).
- A stored PDF object can be lost when its database commit outcome is uncertain (#68).
- Characters outside DejaVu Sans (for example emoji or CJK) still print as the font's missing-glyph
  box; Kazakh, Russian and Latin text is covered.
