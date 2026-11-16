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

## CSV export (#81)

`GET /api/v1/events/{event_id}/analytics/export.csv?bucket=day|hour` takes the same
`from`, `to`, `ticket_type_id` and `campaign_id` filters, validation, `reports` permission
and 404/403 scope as the JSON reports. It returns `text/csv; charset=utf-8` (UTF-8 BOM, CRLF,
every cell quoted) as an attachment `analytics-{event_id}.csv`, and records an
`analytics.exported` audit row.

The file is long-format with columns `section,dimension_id,dimension_name,metric,value`:

- `metadata`: `event_id`, `timezone`, `generated_at`, the applied `from`/`to`/`ticket_type_id`/
  `campaign_id` (empty when unset), `bucket`, `currency`, `money_unit` and a
  `simulation_notice`;
- `definition`: every metric definition of the summary;
- `inventory`, `revenue`, `attendance`: every summary field (revenue includes `environments`
  joined by `;` and `simulated`);
- `ticket_type` and `campaign`: one row per summary dimension metric, keyed by ID and label
  (`Unattributed` has an empty ID);
- `sales_series`: `tickets` and `revenue_minor` per occupied bucket (`dimension_id` is the
  offset-bearing `bucket_start`).

Summary and series are computed by the same functions as the JSON endpoints in one
repeatable-read snapshot, with the same 5-second timeout and the same 10,000-row dimension and
bucket bounds (422 `analytics_range_too_large`, nothing audited). Every exported number therefore
equals the JSON report for the same filters at that snapshot. Numbers are written as plain
numerals; organizer-entered labels and other text starting with `=`, `+`, `-`, `@`, tab or CR
are prefixed with `'` so spreadsheets do not evaluate them. Only aggregates and organizer-defined
ticket-type/campaign labels are exported: no order, ticket, payment or attendee IDs, names, emails,
promo codes or event descriptions.

Review handoff: Yershuak/Adil should review definitions, campaign reconciliation,
filter semantics and client additive metadata before client integration. This
document is the handoff; no messages were sent to reviewers.
