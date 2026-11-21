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

### Example

Request. The filters are the same as for the JSON reports; `from` and `to` need an offset, so the
`+` of `+05:00` is sent as `%2B`:

```text
GET /api/v1/events/5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68/analytics/export.csv?bucket=day&from=2026-11-01T00:00:00%2B05:00&to=2026-12-01T00:00:00%2B05:00
Authorization: Bearer <access token>
```

Response `200`, headers `Content-Type: text/csv; charset=utf-8` and
`Content-Disposition: attachment; filename="analytics-5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68.csv"`.
The body starts with a UTF-8 byte order mark, then this header row and the data rows; the other
rows are as listed above (two shown):

```csv
"section","dimension_id","dimension_name","metric","value"
"revenue","","","gross_minor","2000000"
"sales_series","2026-11-17T00:00:00+05:00","","tickets","2"
```

`gross_minor` is in 1/100 KZT (KZT 20,000 here). A `sales_series` row's `dimension_id` is the
bucket start, with the event's UTC offset.

### Errors

Errors are JSON, `{"detail": {"code": "..."}}`, not CSV. As for the JSON reports, a session with no
relationship to the event gets `404` and staff without `reports` get `403`.

| Status | `code` | When |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 404 | `event_not_found` | No such event, no relationship to it, or its organization is not active |
| 403 | `permission_denied` | Event staff without the `reports` permission (for example scanner-only staff) |
| 422 | `invalid_analytics_filter` | `from` or `to` has no UTC offset, or `ticket_type_id` or `campaign_id` does not belong to this event |
| 422 | `invalid_range` | `from` is not before `to` |
| 422 | `analytics_range_too_large` | More than 10,000 dimension rows or occupied buckets; nothing is audited |
| 422 | `invalid_input` | `bucket` is not `day` or `hour`, or an id or timestamp is malformed |
| 503 | `database_unavailable` | The database failed or the five-second statement timeout was hit |
| 500 | `internal_error` | Unhandled server error; quote the `X-Request-ID` response header |

### Stability

- **Stable.** The URL and its filters (`bucket`, `from`, `to`, `ticket_type_id`, `campaign_id`);
  the five column names; the `section` values `metadata`, `definition`, `inventory`, `revenue`,
  `attendance`, `ticket_type`, `campaign` and `sales_series`; the `metric` names inside the
  `inventory`, `revenue`, `attendance`, `ticket_type`, `campaign` and `sales_series` sections,
  which are the field names of the JSON summary and series (the tests check every exported number
  against the JSON report); the `metadata` metrics `event_id`, `timezone`, `generated_at`, `from`,
  `to`, `ticket_type_id`, `campaign_id`, `bucket`, `currency`, `money_unit` and
  `simulation_notice`; the `Unattributed` campaign row with an empty `dimension_id`; the UTF-8 byte
  order mark; the status codes; and the 422 `code` strings `invalid_analytics_filter`,
  `invalid_range` and `analytics_range_too_large`.
- **May change.** Parse by `section` and `metric`, never by row position.
  - The row order; the wording of the `simulation_notice` value and of the `definition` values
    (only the `definition` metrics `net_minor`, `campaign`, `series` and `range` are checked by a
    test).
  - The `Content-Disposition` file name.
  - Line ending and quoting (CRLF, every cell quoted) are documented above but no test asserts
    them.
  - The error codes `event_not_found`, `permission_denied`, `invalid_credentials` and
    `invalid_input`: the tests assert only their status codes.
  - Whether future metrics add rows to an existing section; clients should ignore metrics they do
    not know.

## GA4 traffic and funnel integration (#71)

Optional and **disabled by default** (`GA4_ENABLED=false`). It supplements, and never replaces,
the operational reports above: GA4 numbers are traffic/conversion measurements of consenting
signed-in visitors, never sales, revenue or attribution. Orders, refunds and campaign attribution
are always written to PostgreSQL first; checkout and refund code never calls GA4.

Settings, from the environment only: `GA4_ENABLED`, `GA4_MEASUREMENT_ID` (`G-...`, the platform
web stream; neither client loads a Google tag, both post measurements here), `GA4_API_SECRET`
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

### GA4 routes: examples, errors and stability

Identifiers and times are illustrative; no credential appears in any request or response (the
property credentials and the Measurement Protocol secret are server settings and never leave the
server). Every request carries `Authorization: Bearer <access token>`.

**Read the organization connection** with `GET /organizations/{organization_id}/ga4-connection`
(organization owner only):

```text
GET /api/v1/organizations/a3d70c19-5e82-4b46-8f0d-6c1b92e7a350/ga4-connection
Authorization: Bearer <access token>
```

```json
{
  "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
  "property_id": "123456",
  "is_enabled": true,
  "enabled_at": "2026-11-17T09:00:00.000Z",
  "integration": "enabled"
}
```

Without a connection row the view is `property_id: null`, `is_enabled: false`, `enabled_at: null`.
`integration` says whether the server has GA4 switched on (`GA4_ENABLED`), not whether this
organization is connected.

**Connect or disconnect** with `PUT /organizations/{organization_id}/ga4-connection`. The body is
exactly `{"is_enabled": true|false}` (any other field is `422`); the response is the view above after
the change, and the change is audited:

```text
PUT /api/v1/organizations/a3d70c19-5e82-4b46-8f0d-6c1b92e7a350/ga4-connection
Authorization: Bearer <access token>
Content-Type: application/json
```

```json
{"is_enabled": true}
```

| Status | `code` | When (both connection routes unless noted) |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 404 | `organization_not_found` | No such organization, it is not active, or the caller is not its owner or an active member |
| 403 | `permission_denied` | The caller is an active member but not the owner |
| 409 | `ga4_disabled` | `PUT` with `is_enabled: true` while the integration is off or has no property id |
| 422 | `invalid_input` | The id is not a UUID, or the `PUT` body is missing, has another field or a non-boolean value |
| 503 | `database_unavailable` | The database failed |
| 500 | `internal_error` | Unhandled server error; quote the `X-Request-ID` response header |

**Post a client measurement** with `POST /analytics/measurements`. The body requires `name`
(`campaign_landing`, `event_view` or `checkout_start`), `analytics_event_id` (a UUID), `event_id`
(a UUID) and `platform` (`web` or `mobile`); `campaign_id` (a UUID) and `page_path` (at most 2048
characters) are optional. Any other field is rejected with `422`.
The answer is always `202` when the request is valid, including when nothing is collected:

```text
POST /api/v1/analytics/measurements
Authorization: Bearer <access token>
Content-Type: application/json
```

```json
{
  "name": "event_view",
  "analytics_event_id": "0f5d2a9c-7b31-4e86-a4c0-d92e6b8f1537",
  "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
  "platform": "web",
  "page_path": "/events/5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68"
}
```

```json
{"status": "accepted", "reason": null}
```

`status` is `accepted`, `duplicate` (the same `analytics_event_id` was already posted) or
`skipped`; a skipped answer carries a `reason` of `disabled`, `consent_required`, `not_connected`
or `backlog_full`, for example `{"status": "skipped", "reason": "consent_required"}`. These checks
run before the event is looked up, so a disabled integration or an account without consent gets
`skipped` even for an event that does not exist.

| Status | `code` | When |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 422 | `invalid_input` | An unknown field, a `name` other than `campaign_landing`, `event_view` or `checkout_start` (purchases and refunds are server-only), a `platform` other than `web` or `mobile`, a non-UUID id, or a `page_path` over 2048 characters |
| 422 | `invalid_measurement` | `campaign_id` does not belong to the event |
| 404 | `event_not_found` | The event does not exist, or its organization is not active, or (for a caller with no staff role on the event) it is not published, is suspended, or is private without an access grant. Unlisted events are visible |
| 429 | `rate_limited` | More than 60 measurements per account (or 600 per address) in the rate window; `Retry-After` gives the window in seconds |
| 503 | `database_unavailable` | The database failed |
| 500 | `internal_error` | Unhandled server error; quote the `X-Request-ID` response header |

Clients should treat every failure of this route as ignorable.

**Read the traffic funnel** with `GET /events/{event_id}/analytics/traffic` (the event's `reports`
permission). `from` and `to` are dates; both are optional:

```text
GET /api/v1/events/5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68/analytics/traffic?from=2026-11-01&to=2026-11-15
Authorization: Bearer <access token>
```

```json
{
  "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
  "source": "ga4",
  "state": "fresh",
  "error": null,
  "timezone": "Asia/Almaty",
  "range": {"from": "2026-11-01", "to": "2026-11-15"},
  "fetched_at": "2026-11-17T09:20:00.000Z",
  "expires_at": "2026-11-17T09:35:00.000Z",
  "metrics": {
    "campaign_landing": {"event_count": 0, "users": 0},
    "event_view": {"event_count": 40, "users": 25},
    "checkout_start": {"event_count": 7, "users": 6},
    "purchase": {"event_count": 3, "users": 3},
    "refund": {"event_count": 0, "users": 0}
  },
  "definitions": {
    "source": "GA4 Data API aggregates of consenting signed-in visitors; not BiletFlow sales.",
    "event_count": "GA4 eventCount for the event's opaque event_ref in [from,to).",
    "users": "GA4 totalUsers (pseudonymous client IDs) for the same measurement.",
    "purchase": "GA4 purchase measurements; sales and revenue come from operational analytics.",
    "range": "Dates are evaluated in the GA4 property time zone.",
    "states": "disabled/not_connected: no GA4; unavailable/error: no data, not zero; stale: last cached values after a failed refresh."
  }
}
```

When GA4 cannot answer, the call is still `200`: `state` is `disabled`, `not_connected`,
`unavailable` or `error`, `metrics` is `null` (never zeros) and `fetched_at` and `expires_at` are
`null`; `stale` keeps the last cached `metrics` and sets `error` to `ga4_unavailable` or
`ga4_error`.

| Status | `code` | When |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 404 | `event_not_found` | No such event, no relationship to it, or its organization is not active |
| 403 | `permission_denied` | Event staff without the `reports` permission |
| 422 | `invalid_range` | `from` is not before `to` |
| 422 | `analytics_range_too_large` | The range is longer than 366 days |
| 422 | `invalid_input` | `from` or `to` is not a date, or the event id is not a UUID |
| 503 | `database_unavailable` | The database failed |
| 500 | `internal_error` | Unhandled server error; quote the `X-Request-ID` response header |

Stability of the four GA4 routes:

- **Stable** (asserted by `test_ga4.py`):
  - Connection view `property_id`, `is_enabled`, `enabled_at` and `integration`; the owner-only
    rule (`404` for outsiders, `403` for other staff); `409 ga4_disabled`.
  - The measurement answer shape `{"status", "reason"}`, the `status` values `accepted`,
    `duplicate` and `skipped`, the `reason` values `disabled`, `consent_required` and
    `backlog_full`, and the `429` status of the rate limit.
  - Traffic `state` values (`disabled`, `not_connected`, `fresh`, `stale`, `unavailable`,
    `error`), `source`, `error` (`ga4_unavailable`, `ga4_error` or `null`), `timezone`, `range`
    (`from`, `to`), `fetched_at`, `expires_at`, `definitions` (present), and `metrics` as an
    object of `{"event_count", "users"}` for `campaign_landing`, `event_view`, `checkout_start`
    and `purchase`, or `null` when there is no data.
- **May change.** Ignore unknown fields and values; no test asserts the following yet, so treat
  them as provisional.
  - Connection view `organization_id`; the `not_connected` measurement reason.
  - The `refund` entry of `metrics`, and the wording of `definitions`.
  - The cache lifetime (`GA4_CACHE_SECONDS`, 15 minutes by default), the default 28-day range and
    the 366-day limit, the 60 and 600 measurement limits and the 10,000-row backlog cap.
  - The codes `invalid_measurement`, `organization_not_found`, `permission_denied`,
    `event_not_found`, `invalid_range`, `analytics_range_too_large` (for traffic),
    `rate_limited`, `invalid_input` (and its `fields` list) and `invalid_credentials`: the tests
    assert their status codes, not the strings.
  - How `page_path` is reduced to a route template.

Fixture tests cover consent, allowlists, deduplication, outage and disabled states; live
collection and reporting against a real property have not been verified (credentials required).

Review handoff: Yershuak/Adil should review definitions, campaign reconciliation,
filter semantics and client additive metadata before client integration. This
document is the handoff; no messages were sent to reviewers.
