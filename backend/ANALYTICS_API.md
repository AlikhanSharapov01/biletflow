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

## GA4 traffic and funnel integration (#71)

Optional and **disabled by default** (`GA4_ENABLED=false`). It supplements, and never replaces,
the operational reports above: GA4 numbers are traffic/conversion measurements of consenting
signed-in visitors, never sales, revenue or attribution. Orders, refunds and campaign attribution
are always written to PostgreSQL first; checkout and refund code never calls GA4.

Settings, from the environment only: `GA4_ENABLED`, `GA4_MEASUREMENT_ID` (`G-...`, the platform
web stream, normally the same as the web build's `VITE_GA4_MEASUREMENT_ID`), `GA4_API_SECRET`
(Measurement Protocol secret of that stream), `GA4_PROPERTY_ID` (numeric), `GA4_CREDENTIALS_JSON`
(a service-account key with read access to the property) and `GA4_CACHE_SECONDS` (default 900).
No credential is stored in the database or returned by any endpoint. In the GA4 property, register
an event-scoped custom dimension for the parameter `event_ref`.

### Organization connection

`GET|PUT /api/v1/organizations/{organization_id}/ga4-connection` (organization owner only;
others get 404/403). `PUT {"is_enabled": true|false}` connects or disconnects the organization's
events to the platform property; enabling returns 409 `ga4_disabled` while the integration is off.
The view is `{organization_id, property_id, is_enabled, enabled_at, integration}` with
`integration: enabled|disabled`; a missing row is reported as not enabled. Changes are audited.
Only orders confirmed after the latest `enabled_at` are exported (no backfill).

### Shared measurement contract (web and mobile)

| Measurement | GA4 event | Produced by | Parameters sent to GA4 |
|---|---|---|---|
| `campaign_landing` | `campaign_landing` | client | `event_ref`, `campaign_ref`?, `platform`, `page_location`?, `engagement_time_msec` |
| `event_view` | `view_item` | client | same as above |
| `checkout_start` | `begin_checkout` | client | same as above |
| `purchase` | `purchase` | server (worker) | `event_ref`, `campaign_ref`?, `platform: server`, `transaction_id`, `currency: KZT`, `value`, `tickets` |
| `refund` | `refund` | server (worker) | `event_ref`, `platform: server`, `transaction_id`, `currency: KZT`, `value` |

Clients post `POST /api/v1/analytics/measurements` with exactly
`{name, analytics_event_id, event_id, campaign_id?, platform: web|mobile, page_path?}`; unknown
fields, `purchase`/`refund` names or a campaign of another event return 422. The response is
202 `{status: accepted|duplicate|skipped, reason}`; `skipped` with `disabled`,
`consent_required` (the account's `analytics_consent` is off; anonymous visitors are never
tracked), `not_connected` or `backlog_full` (10,000 pending rows for the connection) is never an
error, so refusal cannot break a client flow. Consented posts are rate limited on the shared rate
buckets to 60 per account and 600 per IP per `RATE_WINDOW_SECONDS` (429 `rate_limited`); clients
should ignore analytics failures. A consenting account can still report views of any event it can
see, so client funnel counts are indicative, unlike server-side purchases. The event
must be visible to the caller (404 otherwise). `analytics_event_id` is a client-generated UUID used
only for deduplication: a repeat returns `duplicate` and is sent once.

Only allowlisted parameters leave: `event_ref`, `campaign_ref`, `transaction_id` and the
Measurement Protocol `client_id` are HMAC references derived from the server secret, distinct
from and not reversible to event, campaign, order or user IDs. `page_path` is reduced to a public
route template (`/discover`, `/events/event`, `/c/campaign`) on `FRONTEND_URL`; query strings,
fragments, IDs and every other route are dropped, as in the web client. Names, emails, phone
numbers, user/order/ticket/payment IDs, QR/entry/session tokens, promo codes, support text and
event titles/descriptions are never sent. Purchase `value` is the order's payable amount in KZT
units; the refund of the fulfilling charge reuses the purchase `transaction_id`.

### Durable export

Rows of `analytics_export` (status `pending|sent|skipped|failed`) are the outbox. Every 15 seconds
the worker records purchase measurements for confirmed orders of connected organizations whose
buyer currently consents, and refund measurements for succeeded refunds of exported purchases
(looking back 7 days, at most 200 of each per pass). Unique keys on `analytics_event_id` and on
(connection, order|refund, kind) make enqueueing and retries idempotent. It then leases up to 20
due rows (`FOR UPDATE SKIP LOCKED`, attempt number as fence) and sends them outside the
transaction, after the worker's payment steps and within a 5-second budget for starting sends.
Rows not attempted (budget spent, or after an outage in the same pass) wait without using an
attempt. An outage (`ga4_unavailable`: timeout, network, 429, 5xx) never uses an attempt and is
retried every 5 minutes for as long as it lasts. A rejected send (`ga4_error`, `ga4_send_failed`;
no provider text is kept) uses one attempt with back-off, and after the fifth the row becomes
`failed`. Rows of a disconnected organization become `skipped`. Rows remain visible.

### Cached aggregates

`GET /api/v1/events/{event_id}/analytics/traffic?from=YYYY-MM-DD&to=YYYY-MM-DD` (reports
permission, 404/403 as above; `to` exclusive, default the 28 days up to today in the event time
zone, at most 366 days; invalid range 422) returns

`{event_id, source: "ga4", state, error, timezone, range: {from, to}, fetched_at, expires_at,
metrics, definitions}`.

`metrics` maps every measurement name to `{event_count, users}` from the GA4 Data API, filtered by
the event's `event_ref`. Results are cached in `ga4_cache` per connection, event and query for
`GA4_CACHE_SECONDS`. `state` is `disabled` (integration off or no reporting credentials),
`not_connected`, `fresh`, `stale` (refresh failed; last cached values with `error`),
`unavailable` (outage, no cache) or `error` (rejected request or credentials, no cache).
`unavailable`/`error`/`disabled`/`not_connected` return `metrics: null`, never zeros. The provider
call holds no transaction. Missing GA4 purchases are not missing sales.

Fixture tests cover consent, allowlists, deduplication, outage and disabled states; live
collection and reporting against a real property have not been verified (credentials required).

Review handoff: Yershuak/Adil should review definitions, campaign reconciliation,
filter semantics and client additive metadata before client integration. This
document is the handoff; no messages were sent to reviewers.
