# Promo campaigns and Campaign QR API (SRS 4.14)

All paths are under `/api/v1`. Errors have the shape `{"detail": {"code": "..."}}`. Request bodies
reject unknown fields (`422 invalid_input`). Money is integer KZT minor units (100 = KZT 1).

## Organizer API

Reading needs the event permission `event_edit` or `reports`; writing needs `event_edit`; the report
needs `reports`. Staff of another organizer get `404`, staff without the permission `403`.

| Method | Path | Purpose |
|---|---|---|
| `GET` / `POST` | `/events/{id}/campaigns` | List (newest first) / create (`201`) |
| `GET` / `PUT` | `/events/{id}/campaigns/{cid}` | Read / replace |
| `POST` | `/events/{id}/campaigns/{cid}/disable` | Disable; repeating it is safe |
| `GET` | `/events/{id}/campaigns/{cid}/qr.svg` | Campaign QR image |
| `GET` | `/events/{id}/campaigns/{cid}/report` | Exact campaign sales report |

### Input

```json
{
  "name": "Spring sale",
  "discount_kind": "percent",
  "value": 10,
  "starts_at": "2026-11-10T00:00:00+05:00",
  "ends_at": "2026-11-20T00:00:00+05:00",
  "max_redemptions": 100,
  "eligible_ticket_type_ids": [],
  "code": "SPRING10"
}
```

- `discount_kind`: `percent` (`value` is a whole percent, 1-100) or `fixed` (`value` is KZT minor units).
- `max_redemptions`: `null` means unlimited.
- `eligible_ticket_type_ids`: empty means every ticket type.
- `code`: trimmed and uppercased, then `[A-Z0-9_-]{3,32}`. Omit or send `null` to generate one on
  create, or to keep the current one on `PUT`. A code is unique within its event.

### Campaign

The input fields plus `id`, `event_id`, `created_at`, `status` (`scheduled`, `active`, `ended`,
`disabled`), `redemptions_used` (completed orders) and `link_url` (`{FRONTEND_URL}/c/{token}`).

### Report

`campaign_id`, `redemptions`, `orders`, `tickets`, `tickets_refunded`, `tickets_kept`, `gross_minor`,
`discount_minor`, `collected_minor`, `refunds_minor`, `fees_minor`, `net_minor`, `generated_at`.

`net_minor = collected_minor - refunds_minor - fees_minor`. Only successful refunds are subtracted and
processing fees are retained. Attribution survives campaign edits and refunds.

### Errors

| Code | Status | Meaning |
|---|---|---|
| `campaign_not_found` | 404 | Not a campaign of this event |
| `ticket_type_not_found` | 422 | An eligible type does not belong to this event |
| `promo_code_taken` | 409 | The code is already used in this event |
| `campaign_locked` | 409 | Discount, eligible types and code cannot change after the first redemption |
| `promo_limit_below_usage` | 409 | The new limit is below redemptions plus active reservations |
| `event_not_editable` | 409 | The event is cancelled or suspended |

## Campaign QR

`qr.svg` encodes `{FRONTEND_URL}/c/{token}`. The token is opaque, carries no price or discount, and
only its hash is stored. The image has round modules and the caption "Promo link, not an entry
ticket", so it cannot be mistaken for an admission QR. The admission endpoints reject it with
`422 not_a_ticket_qr`.

## Public lookups

Both accept an optional bearer token, respect event visibility (a link never opens a private event
for someone without access) and are rate limited: 30 requests a minute per account and 120 per
address (`429 rate_limited`).

| Method | Path | Result |
|---|---|---|
| `GET` | `/campaign-links/{token}` | `{event_id, code}`, or `404 promo_not_found` |
| `GET` | `/events/{id}/promo-codes/{code}/preview` | `{event_id, code, discount_kind, discount_value, eligible_ticket_type_ids, valid_until}` |

A link resolves even when its campaign has ended, so the visitor reaches the event and the preview
explains why the code no longer works.

## Applying a code at checkout

Send `promo_code` with `POST /events/{id}/holds`. It is part of the `Idempotency-Key` fingerprint. The
hold response always includes `pricing`, and `promo` when a code was applied:

```json
{
  "pricing": {
    "gross": 2000000,
    "discount": 200000,
    "subtotal": 1800000,
    "processing_fee": 54000,
    "payable": 1800000,
    "lines": [
      {
        "allocation_id": "...",
        "ticket_type_id": "...",
        "face_value_minor": 1000000,
        "discount_minor": 100000,
        "paid_minor": 900000,
        "processing_fee_minor": 27000,
        "campaign_eligible": true
      }
    ]
  },
  "promo": {"code": "SPRING10", "campaign_id": "...", "discount_kind": "percent", "discount_value": 10}
}
```

- A percentage applies to each eligible line. A fixed discount applies once to the eligible subtotal,
  capped at it, and is split in proportion to price. Rounding is exact: lines always add up to totals.
- The processing fee is charged on what is collected (`subtotal`) and is deducted from the organizer's
  proceeds, so the buyer pays `payable`.
- One redemption is reserved for the hold while the event is locked: redemptions plus active
  reservations never exceed `max_redemptions`.
- A basket discounted to zero goes through the free path: `/checkout` or `/confirm` confirms it with
  no payment.
- Orders gain `promo: {code, campaign_id}`.

| Code | Status | Meaning |
|---|---|---|
| `promo_not_found` | 404 | No such code in this event |
| `promo_disabled` | 409 | The campaign was disabled |
| `promo_expired` | 409 | The campaign has ended |
| `promo_exhausted` | 409 | No redemptions left |
| `promo_not_applicable` | 409 | The campaign has not started, or no ticket in the basket is eligible |
| `promo_requote_required` | 409 | The campaign changed after the quote: start again with a new hold |

### Lifecycle of a reservation

| Event | Result |
|---|---|
| Hold expires, is released or replaced | Reservation released; the redemption is available again |
| Late payment, wrong amount or blocked fulfilment | Reservation released; the charge is refunded |
| Campaign disabled, ended or materially changed while the buyer pays | No ticket is issued; reservation released; the charge is refunded (`blocked_fulfillment`) |
| Order confirmed | Reservation consumed and one immutable redemption recorded |
| Order later refunded | The redemption stays: a refund does not give it back |

### Revalidation before tickets are issued

The hold's reservation saves a snapshot of the discount it was quoted with: discount kind and
value, whether every ticket type is eligible, and the eligible ticket type IDs. The order saves the
resulting amounts. The same check runs at `/checkout`, at a payment retry, and when a successful
payment is applied, each time under the event lock and with the campaign row locked. The quote is
honoured only if all of these are still true at that moment:

- the hold's reservation is still `active`;
- the campaign and its code are enabled;
- the campaign's current `starts_at <= now < ends_at` (the window is read from the campaign, not
  the snapshot, so moving dates only matters if the window no longer contains this moment);
- discount kind and value, and the eligible ticket types, equal the snapshot.

Not material: renaming the code, editing the campaign name, or changing `max_redemptions` (the
reservation already counts against the limit, and the limit cannot be set below current usage).

When the check fails at `/checkout` or a retry, the answer is `409 promo_requote_required` and no
payment is opened. When it fails after the provider reports a successful charge, no ticket is
issued, the reservation is released (the allowance is available again), and one
`blocked_fulfillment` refund of the full captured amount is recorded in the same commit. The order
stays `pending` until its hold lapses; a retry answers `409 promo_requote_required`. The charge
always equals the saved quote, so a buyer is never charged a higher price automatically: a new
price needs a new hold and quote.

## Local demonstration data

Outside production, `python -m app.bootstrap` and `python -m app.seed` create "BiletFlow Demo
Concert" with the codes `DEMO10` (10%, 100 orders) and `DEMO1000` (KZT 1,000, 50 orders). Its organizer
is `demo-organizer@example.com`, which has no password: request a reset and open the link in Mailpit.
Paid sales still need activating for that event.
