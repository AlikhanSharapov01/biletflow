# Paid orders, payment simulator and refunds

Commerce package B3 (SRS 4.6, backend plan BF-07/BF-08, database specification TX-07/08/09/14).
All money is **simulated**: records carry `environment = "simulation"`, responses carry
`"simulated": true`, and nothing reaches a real provider. Prerequisite: the event's paid sales
are `active` (see [PAID_SALES_API.md](PAID_SALES_API.md)).

## Attendee flow

```text
POST /events/{event_id}/holds                       reserve a paid ticket type (10 minutes)
POST /holds/{hold_id}/checkout                      quote + pending order + payment attempt
  worker                                            initializes the attempt with the simulator
POST /simulator/payments/{attempt_id}/events        demo only: the "provider" reports the result
GET  /orders/{order_id}                             confirmed with tickets, or still pending
POST /orders/{order_id}/payment-attempts            retry after a failed attempt
```

| Method and path | Purpose |
|---|---|
| `POST /holds/{hold_id}/checkout` | Same body as `/confirm`. Saves the quote on a `pending` order and opens a payment. A basket with no paid types is confirmed immediately, exactly like `/confirm`. Accepts `Idempotency-Key` |
| `POST /orders/{order_id}/payment-attempts` | New attempt only when the last one failed; an open attempt is returned instead. `409 quote_expired` once the hold has lapsed. Accepts `Idempotency-Key` |
| `GET /orders`, `GET /orders/{order_id}` | Orders now include `quote_expires_at`, `payment` (latest attempt) and `refunds` |
| `POST /simulator/payments/{attempt_id}/events` | `{"outcome": "pending" \| "succeeded" \| "failed", "external_event_id"?, "amount_minor"?}` |
| `POST /simulator/refunds/{refund_attempt_id}/events` | `{"outcome": "succeeded" \| "failed" \| "unknown", "external_event_id"?}` |

`POST /holds/{hold_id}/confirm` keeps its free-only meaning: a basket with a paid type returns
`409 payment_required` and never charges money. Simulator endpoints answer `404` outside
`ENVIRONMENT=development|test` and for anyone but the payer.

## Prices

- Integer KZT minor units. Each item saves its face value; the client never sends a price
  (extra fields are rejected with `422`).
- The processing fee (proposed demo default 3%, `processing_rate_bps = 300`) is rounded half-up
  once per order and split across items so item fees add up exactly to the order fee. The fee is
  part of the payable amount (organizer cost); the buyer pays `payable_minor`.
- The quote is saved with the order. A later ticket price change never re-prices it; when the
  hold lapses the buyer needs a new hold and quote.

## Fulfilment rules

A successful payment issues tickets only if, under the event lock, all of these hold: the amount
and currency equal the quote, the order is still `pending`, its hold is active and not overdue,
its allocations are still held, the event is on sale and paid sales are `active`. Tickets are
issued by the same code as free orders: one ticket and one delivery email per order item.

| What happened | Result |
|---|---|
| Correct success | Order `confirmed`, `fulfillment_payment_attempt_id` set, hold consumed, tickets issued |
| Same notification again, or another success for the same attempt | No change |
| Success after the hold/order expired or was released | Refund `late_payment`, no ticket |
| Second successful attempt for a confirmed order | Refund `duplicate_charge`; the legitimate tickets stay valid |
| Wrong amount or currency | Refund `blocked_fulfillment` of the captured amount, no ticket |
| Paid sales suspended or event off sale | Refund `blocked_fulfillment`, no ticket |
| Failure | Order stays `pending`; the buyer may retry while the quote lasts |
| Failure after success | Ignored: a success is never downgraded |
| `pending` outcome | Stays pending for reconciliation; never treated as failure |

When a hold expires or is replaced, its unpaid order becomes `expired` or `cancelled` and its
places return to sale.

## Refunds (compensation)

One refund per captured charge (`refund.payment_attempt_id` is unique), always for the full
captured amount, written in the same commit that recorded the charge.

```text
requested --worker--> pending --succeeded--> succeeded (final)
                         |--failed--> failed --worker retry after 30 s--> pending (new attempt)
                         |--unknown--> stays pending until an authoritative result arrives
```

A timeout or failure never creates a second logical refund; retries add `refund_attempt` rows to
the same refund. Compensation refunds never invalidate tickets of a legitimately fulfilled order.
Voluntary refunds and cancellations follow in B4.

## Recovery

- Payment initialization and refund dispatch are outbox jobs, retried by the worker.
- Provider notifications are stored in `provider_event` before they are applied; a row left
  unapplied by an interrupted request is applied by the worker.

## Demo

With the Docker stack running:

```sh
cd backend
uv run python ../tools/smoke_paid_checkout.py
```

## Tables (`0007b_paid_orders`)

| Table | Purpose |
|---|---|
| `refund` | One full-refund obligation per captured charge, with reason and status |
| `refund_attempt` | Each try with the provider; `unknown` stays reconcilable |

Also adds the deferred foreign keys `ticket_order.fulfillment_payment_attempt_id` and
`provider_event.refund_attempt_id`.

## Not yet implemented

Voluntary refunds, organizer cancellation of free or paid registrations and event-cancellation
refunds (B4); promo codes, finance ledger and payout simulation (B5).
