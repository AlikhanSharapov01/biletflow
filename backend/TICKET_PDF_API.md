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
* Fonts: DejaVu Sans (Kazakh/Russian glyphs) when installed, otherwise built-in Helvetica, where
  characters outside Latin-1 print as `?`. The Dockerfile installs `fonts-dejavu-core`.

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

## Not covered

In-app notifications (BF-15) and the recipient-invitation email for non-account holders remain
future work.
