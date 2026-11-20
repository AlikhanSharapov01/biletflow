# Client types against the final backend contracts (#122)

- **Checked:** 20 November 2026, backend and clients at `main` `6e8873e`.
- **Method:** the backend OpenAPI document (generated from the FastAPI app, no database needed)
  was compared field by field with `web/src/api/types/*` and `mobile/src/api/types/*`: field
  names, `| null`, optional (`?`) against required, enum values and primitive types, including
  nested objects. Admin list rows are plain dictionaries in the API, so they were compared with
  the columns of the SQL queries behind them (`SEARCHES`, `INSPECTIONS`); job, delivery, detail
  and conflict views were compared by reading the code that builds them.
- **Covered:** analytics (including GA4 on mobile), finance and payouts, campaigns and promo,
  payments and refunds, paid-sales activation, admin (moderation, reports, settings, search rows,
  inspection, jobs, deliveries), public settings, and the checkout order and hold shapes.

## Result

Two real mismatches, both fixed in this change. Nothing else differs in name, nullability, enum
value or primitive type.

| # | Where | Mismatch | Owner | State |
|---|---|---|---|---|
| 1 | `web` and `mobile` `CampaignReport` (`api/types/campaigns.ts`) | The backend report (since #67) also returns `pending_refunds_minor: number` and `definitions: Record<string, string>`; the clients did not declare them | web, mobile | Fixed: both fields added, web test fixture updated |
| 2 | `mobile` `AdminDelivery.target` (`api/types/admin.ts`) | `target.id` is `null` for account notices (since #74), the type said `string` | mobile | Fixed: `id: string \| null` (the screen already uses `shortId`, which accepts null) |

## Differences that are not mismatches

| Where | Difference | Why no change |
|---|---|---|
| `web` `RevenueMetrics.currency` | Typed `string`, the backend only sends `"KZT"` (mobile already uses the literal) | A wider type is safe; the value is the same |
| `web` and `mobile` `AdminMe.is_platform_admin` | Backend marks it optional in the schema | It has a default and is always sent |
| `web` and `mobile` `Order.refunds` | Same: optional in the schema | Default empty list, always sent |
| `web` and `mobile` `CampaignInput.eligible_ticket_type_ids` | Required in the clients, optional in the backend | The clients always send it |
| `mobile` `Measurement.platform` | Only `"mobile"` | The backend accepts `"web"` and `"mobile"`; the mobile client only sends its own |

## Types that exist in only one client

These are not mismatches; they are screens still being built and already have issues.

| Missing in | Types | Issue |
|---|---|---|
| web | GA4 `Measurement`, `MeasurementResult`, `TrafficReport` | #131 |
| web | Admin operations rows and details: support cases, activations, campaigns, sync conflicts, jobs, deliveries | #110 |
| mobile | `InventoryMetrics`, `RevenueMetrics`, `AttendanceMetrics`, `TicketTypeMetrics`, `CampaignMetrics` as named types | None needed: mobile declares the same fields inline in `EventAnalytics`, and they match |

## Not covered

- Request-parameter shapes (query strings) were not compared, only response bodies and JSON
  request bodies that have a schema.
- Behaviour is not checked here, only types. A type that matches does not prove the screen shows
  the right value; that is what the acceptance walkthrough (#121) and browser tests (#120) are for.

## Re-running the check

The comparison scripts are not part of the repository. The backend side comes from
`create_app(settings).openapi()`; the client side is a parser for the one-field-per-line
interfaces in `api/types`.
