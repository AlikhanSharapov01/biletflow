# Organizer analytics (#38)

`GET /api/v1/events/{event_id}/analytics` and
`GET /api/v1/events/{event_id}/analytics/sales-series?bucket=day|hour`
require a current authenticated session and the event's `reports` permission
(implicit for its organization owner). Unrelated events return 404; assigned staff
without reports return 403. Reads have no business side effects or row locks.

Both accept optional `from`, `to` (ISO timestamps with offsets, inclusive start,
exclusive end), `ticket_type_id`, `campaign_id`. IDs must belong to the event;
invalid bounds/IDs return 422 with stable error codes. Dates select purchase
cohorts by order `confirmed_at` (unfulfilled charges use order `created_at`),
not refund settlement dates. Refund/current ticket state is evaluated now for
that cohort. Inventory capacity/held/available remain the current configured
ticket-type scope; campaign/date filters select sold and attendance cohorts,
not fictitious campaign-specific capacity. Applied filters, timezone, metric
definitions and `generated_at` accompany responses. No bounds means all history.

Money uses integer 1/100 KZT. Gross and discounts sum immutable fulfilled item
snapshots; free items contribute zero. `collected_minor` sums actual successful
ticket charges, including extra/late charges pending compensation. This may
differ from `fulfilled_collected_minor` (gross minus discounts).
`refunds_minor` counts successful ticket refunds only;
`pending_refunds_minor` includes requested, pending and failed obligations.
`charged_fees_minor` uses saved fulfilled item fees for the canonical charge
(the current simulator keeps these on items), and saved attempt fees for extra
or late charges; `fee_reversals_minor` reverses
those fees on successful full simulated refunds; `fees_minor` is retained fees.
`net_minor = collected_minor - refunds_minor - fees_minor`. Activation and
payouts belong to finance and are excluded here. Simulation/sandbox labels are
returned; neither represents live funds.

Money is aggregated once per charge before item joins. Item attribution uses
saved paid amounts, with cumulative integer remainder allocation in unit order
for extra charges, refunds and attempt fees. Canonical fulfillment fees use the
saved item allocations. Campaign attribution covers eligible items only;
ineligible/no-campaign items are returned under `campaign_id: null`, name
`Unattributed`, so campaign money sums reconcile. Redemptions are distinct
successful campaign orders and survive refund. Campaign ticket counts distinguish
original, refunded and retained tickets. Zero-discount eligible items retain
campaign attribution.

`inventory.sold` counts current sold/quarantined allocations for the selected
purchase cohort, including free tickets. `refund_pending` is separate;
`sold_percentage` divides sold by saleable capacity, returning zero for zero
capacity. Released historical allocations never inflate sold percentage.
`held` excludes expired holds; `expired_held` separately exposes rows still
awaiting cleanup and these still reduce `available` until released. Assigned
capacity is bounded by unblocked configured seats, event and type limits;
`blocked` counts blocked seats. General capacity is bounded by event/type limits.

Attendance counts currently valid/checked-in eligible issued tickets and current
unreversed accepted check-ins only. Free tickets count; provisional offline
operations do not. Percentage is zero for zero issued. `not_checked_in` is labelled
`not_yet_checked_in` before event end and `absent` afterwards.

Summary preserves planned web/mobile fields: inventory capacity/sold/held/available,
revenue gross/discount/fees/refunds/net, attendance issued/checked_in,
by_ticket_type id/name/capacity/sold/checked_in/revenue_minor and by_campaign
id/name/redemptions/discount_minor/revenue_minor. Definitions and reconciliation
fields are additive. `revenue_minor` means net ticket revenue.

Sales series uses fulfilled item counts and their saved paid amounts at order
confirmation, grouped by PostgreSQL `date_trunc` in the event timezone. Points
contain offset-bearing `bucket_start`, `tickets`, `revenue_minor`; empty buckets
are omitted. At most 10,000 occupied buckets are returned; a larger result returns
422 `analytics_range_too_large`. Summary dimensions are likewise capped at 10,000.
Queries use a transaction-local 5-second statement timeout and one repeatable-read
read-only snapshot; timeout/database failure uses existing 503 error handling.

Review handoff: Yershuak/Adil should review definitions, campaign reconciliation,
filter semantics and client additive metadata before client integration. This
document is the handoff; no messages were sent to reviewers.
