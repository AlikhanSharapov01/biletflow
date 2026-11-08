# Refunds and cancellations API (SRS 4.9)

All paths are under `/api/v1`. Every body is `{"reason": "..."}` (optional, at most 500 characters);
a reason given by staff appears in the event's activity history. Refunds are simulated like all
payments on this platform.

Refunds cover the whole order and return the amount actually paid. Partial refunds are outside the
academic baseline.

| Method | Path | Who | Result |
|---|---|---|---|
| `POST` | `/orders/{id}/refunds` | Staff with `refund` | `200 {order_id, status, refund}` |
| `POST` | `/orders/{id}/refund-requests` | The buyer | `202 {order_id, status: "requested", case_id}` |
| `POST` | `/orders/{id}/cancel` | The buyer, free orders | `200` the order |
| `POST` | `/events/{id}/tickets/{ticket_id}/cancel` | Staff with `attendees`, free orders | `200 {ticket_id, order_id, status}` |

All four are safe to repeat: a second refund returns the same refund, a second request the same
support case, and a second cancellation the same result.

## How a refund runs

1. In one transaction the order and tickets become `refund_pending`, the stock moves to
   `refund_quarantine`, and the refund and its audit entry are saved. The old tickets stop admitting
   immediately.
2. The worker sends the refund to the simulator. Report the outcome with
   `POST /simulator/refunds/{refund_attempt_id}/events` (the payer, outside production).
3. On confirmed success the order and tickets become `refunded` and the stock is released exactly
   once. It can be bought again only if the event and its sales window allow it, and a new purchase
   gets a new ticket and QR.
4. While a refund is pending or failed the tickets stay invalid and the stock stays quarantined. A
   failed refund is retried automatically.

A refund does not give back a promo redemption.

## Attendee requests

A request opens a support case with category `refund`, linked to the order, in the organizer's queue.
It changes nothing by itself: authorized staff approve it by calling `/orders/{id}/refunds`.

## Cancelling an event

`POST /events/{id}/cancel` works for events with sales. In one transaction it closes active holds,
cancels free registrations, and starts a refund with reason `event_cancelled` for every paid order,
ignoring the voluntary refund policy. Events with paid orders also need the `refund` permission. A
cancelled event never becomes purchasable again.

## Errors

| Code | Status | Meaning |
|---|---|---|
| `order_not_found` / `ticket_not_found` | 404 | Unknown, or not yours |
| `permission_denied` | 403 | Staff without the required permission |
| `free_order_use_cancel` | 409 | The order cost nothing: cancel it instead |
| `full_order_refund_required` | 409 | A paid order cannot be cancelled ticket by ticket |
| `order_not_refundable` / `order_not_cancellable` | 409 | The order is not in a confirmed state |
| `ticket_checked_in` | 409 | Reverse the admission first |
| `ticket_not_valid` | 409 | The ticket is already refunded or being refunded |
| `refund_not_allowed` | 409 | The order's saved policy does not allow refunds |
| `refund_cutoff_passed` | 409 | The order's saved refund cutoff has passed |

## Notifications

Each of these reaches the buyer once, in the inbox and by email, with a link to the order:
`purchase_confirmed`, `payment_failed`, `refund_started`, `refund_completed`, `order_cancelled`. A
cancelled ticket also notifies its claimed recipient when that is someone else.
