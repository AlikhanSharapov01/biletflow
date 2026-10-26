# Free checkout and ticket issuance

Stage C, free-registration scope (SRS 4.4, 4.7; backend plan BF-05, BF-07, BF-10). Paid checkout,
payments, PDFs, cancellations and admission build on these tables later.

All endpoints are under `/api/v1`, require a verified signed-in account (`Authorization: Bearer`),
and return errors as `{"detail": {"code": "..."}}`.

## Attendee flow

```text
POST /events/{event_id}/holds          reserve inventory for 10 minutes
  -> POST /holds/{hold_id}/confirm     name one recipient per allocation; issues tickets
  -> GET  /orders, /orders/{id}        buyer view of orders and delivery status
POST /tickets/claim                    recipient links tickets addressed to their email
  -> GET  /tickets, /tickets/{id}      recipient view, including the QR payload
```

| Method and path | Purpose |
|---|---|
| `POST /events/{event_id}/holds` | Body `{"items": [{"ticket_type_id", "quantity", "seat_ids"?}]}`. `seat_ids` is required for assigned seating and forbidden otherwise. Creating a new hold releases the buyer's earlier active hold for the same event. Returns the hold with its `allocations` |
| `GET /holds/{hold_id}` | Own hold only |
| `DELETE /holds/{hold_id}` | Release an active hold; a consumed hold returns `409 hold_already_consumed` |
| `POST /holds/{hold_id}/confirm` | Body `{"recipients": [{"allocation_id", "name", "email"}]}` with exactly one recipient per allocation of the hold. Creates a zero-total order, order items, tickets and delivery emails in one transaction. Repeating the call with the same recipients returns the same order; different recipients return `409 confirmation_conflict` |
| `GET /orders`, `GET /orders/{order_id}` | Buyer's orders. Items show the ticket; the QR is only shown when the buyer is also that ticket's recipient |
| `POST /tickets/claim` | Claims every valid, unclaimed ticket whose recipient email equals the caller's verified email. Returns `{"claimed": n}`. The buyer's own tickets are claimed at confirmation |
| `GET /tickets`, `GET /tickets/{ticket_id}` | Tickets claimed by the caller, with event, ticket type, seat and `qr_payload` |
| `GET /events/{event_id}/attendees` | Organizer list of issued tickets; requires the `attendees` event capability |

Clients should call `POST /tickets/claim` after sign-in before listing tickets. The delivery email
links to `{FRONTEND_URL}/tickets/{ticket_id}` and never contains the QR payload: admission
requires the recipient's signed-in account.

## Safe retries: `Idempotency-Key`

`POST /events/{event_id}/holds` and `POST /holds/{hold_id}/confirm` accept an optional
`Idempotency-Key` header: 8–128 characters from `A-Z a-z 0-9 . _ : -`, for example a UUID the
client generates once per user action and reuses on retry.

| Situation | Result |
|---|---|
| Same key, same body | The original hold or order (same id), never a second hold, ticket or email |
| Same key, different seats, quantity or recipients | `409 idempotency_key_reused` |
| Malformed key | `422 invalid_idempotency_key` |
| No key | Previous behaviour: a new hold replaces the buyer's earlier hold for that event |

Keys are scoped to the signed-in account and the operation, and remembered for 24 hours. The
server takes a transaction-scoped advisory lock on (account, operation, key) before any other
lock, so concurrent duplicates wait and then replay. Only completed results are recorded, in the
same commit as the hold or order (`idempotency_record`, migration `0010_commerce`).

## Rules enforced by the server

- The event must be visible to the caller (published, not moderated, private events need an access
  grant), inside its registration window, and each ticket type must be visible, free and inside its
  sales window. Paid types return `409 paid_checkout_unavailable` until paid checkout exists.
- Event capacity, ticket-type quantity, `per_order_limit` and at most three live (not yet
  overdue) holds per account are checked while the event row is locked. Overdue holds on other
  events never block a buyer. The partial unique index `uq_live_seat` prevents two live
  allocations for one seat.
- Expired holds are released by the worker every 15 seconds even when nobody touches the event,
  and also in a separate commit before each hold or confirmation request, so a rejected request
  cannot roll the release back. A hold that expires before confirmation returns
  `409 hold_expired` and never issues tickets. Sold allocations are never released by expiry.
- Lock order follows the database specification: request key, user/session, organization
  (shared), event, ticket types, holds, order, allocations, tickets. Visibility, organization
  status and private access are rechecked after the locks are taken.

## QR payload

`biletflow:ticket:{ticket_id}.{hmac}` where the HMAC uses `CHALLENGE_SECRET` with purpose
`ticket_qr`. Only its SHA-256 is stored in `ticket.qr_token_hash`, so a scanner verifies a code by
recomputing the hash. Rotating `CHALLENGE_SECRET` invalidates every issued QR code.

## Tables (`0003_checkout`)

| Table | Purpose |
|---|---|
| `ticket_order` | One per consumed hold; money columns in KZT minor units, policy and event snapshots |
| `order_item` | One per allocation; recipient, ticket-type name and seat snapshot at order time |
| `ticket` | One per order item; status, claimed recipient account and QR hash |

`fulfillment_payment_attempt_id` and `pdf_file_id` are nullable columns without foreign keys until
the payment and file-storage tables exist.

## Not yet implemented

Paid checkout and payments, promo codes, PDF tickets and organizer cancellation of free
registrations.
