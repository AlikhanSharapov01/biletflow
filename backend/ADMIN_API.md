# Platform administration API

Stage E, platform-admin scope (SRS 4.12, backend plan BF-21). Covers the admin role, search,
user/event and paid-sales suspension, event reports, platform settings, payment/refund inspection
and CSV export. Other operational views remain outside this increment; see
[Not yet implemented](#not-yet-implemented).

All endpoints need a verified signed-in account (`Authorization: Bearer`) and return errors as
`{"detail": {"code": "..."}}`. Admin endpoints live under `/api/v1/admin`.

## Who is a platform admin

A row in `platform_admin` with `revoked_at IS NULL`, checked against the database on every request
(revocation applies to the next request, with the same access token). Organizer ownership, staff
or scanner roles never imply it. Anonymous callers get `401`; any signed-in non-admin gets
`403 admin_required` on every admin endpoint.

There is no HTTP way to obtain the role. An operator with database access runs:

```text
python -m app.admin_cli grant  admin@example.com
python -m app.admin_cli revoke admin@example.com
```

The account must already exist, be active and have a verified email. Both commands are idempotent
and write an `admin.granted` / `admin.revoked` audit row with `service_actor = "admin_cli"`.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /admin/me` | `{"user_id", "is_platform_admin": true}`; `403` for everyone else |
| `GET /admin/users` | Search. Filters `q` (email, display name or exact id), `status` |
| `GET /admin/events` | Search. Filters `q` (title, event id or organization id), `moderation_state`, `publication_state`, `organization_id` |
| `GET /admin/orders` | Search. Filters `q` (buyer email, order id or buyer id), `status`, `event_id`, `buyer_user_id` |
| `GET /admin/tickets` | Search. Filters `q` (recipient email, ticket id or order id), `status`, `event_id`, `order_id` |
| `GET /admin/payments`, `GET /admin/failed-payments`, `GET /admin/refunds` | Paginated authoritative commerce records; filters below |
| `GET /admin/events/{event_id}/paid-sales` | Activation checklist, saved fee, latest payment, missing prerequisites and suspension reason |
| `POST /admin/events/{event_id}/paid-sales/suspend`, `.../reinstate` | Body `{"reason"}` (trimmed, 1-500 characters); optional `Idempotency-Key` |
| `POST /admin/users/{id}/suspend`, `.../reinstate` | Body `{"reason"}` (1-500 characters) |
| `POST /admin/events/{id}/suspend`, `.../reinstate` | Body `{"reason"}` |
| `GET /admin/moderation-actions` | Append-only decisions; filters `user_id`, `event_id` |
| `POST /events/{event_id}/reports` | Any signed-in user. Body `{"category", "description"}` |
| `GET /admin/reports`, `GET /admin/reports/{id}` | Review queue, oldest first; filters `status`, `event_id` |
| `POST /admin/reports/{id}/review` | `open` to `reviewing` |
| `POST /admin/reports/{id}/resolve` | Body `{"resolution"}`; `open` or `reviewing` to `resolved` |
| `GET /admin/settings` | Every setting with current value, version, bounds and any scheduled change |
| `PUT /admin/settings/{key}` | Body `{"value", "expected_version", "effective_at"?, "reason"?}` |
| `GET /admin/settings/{key}/history` | Versions, newest first |
| `GET /admin/exports/{kind}.csv` | Kinds `users`, `events`, `orders`, `tickets`, `payments`, `failed-payments`, `refunds`; `limit` 1-5000, default 1000 |

Search lists return `{"items": [...], "total", "limit", "offset"}` with `limit` 1-100 (default 50)
and a deterministic order (newest first, ties by id). Search text is matched literally: `%` and
`_` are not wildcards. Responses never include password hashes, token hashes or QR material.
Order and ticket search show the same fields an organizer already sees. Support-case search
remains outside this API.

## Payment and refund inspection

All three commerce lists and their CSV exports accept exact `event_id`, `organization_id`,
`order_id`, `payer_user_id`, `purpose` (`ticket_order` or `activation`), `environment`
(`simulation` or `sandbox`), and `status`. Filters combine with AND; mismatched organization/event
or order/event filters return an empty page. `failed-payments` always restricts payment attempts
to `failed`; a different status is `422 invalid_filter`. Payment statuses are `created`, `pending`,
`failed`, `succeeded`; refund statuses are `requested`, `pending`, `failed`, `succeeded`.

Optional `from` (inclusive) and `to` (exclusive) are offset-bearing instants applied to the listed
record's `created_at`; naive timestamps and reversed/equal ranges are `422 invalid_date_range`.
Invalid UUIDs, enums and pagination bounds return `422`. Lists use the usual page envelope,
`limit` 1-100, `offset` 0-100000, newest first then id. Count and rows share a read-only repeatable
read snapshot, take no row locks, and have a transaction-local five-second statement timeout.

Payment rows identify the attempt, intent, event, organization, order or activation, payer, purpose,
environment, provider and provider payment reference; expose status, expected and captured amounts,
currency, saved processing fee, created/confirmed/reconciliation times, and explicit `simulated`.
Refund rows identify the logical full-refund obligation and original charge with the same context,
amount, reason, status, created/succeeded time and latest refund-attempt status. Each row remains
one attempt or one logical refund: retries do not multiply rows or money. A failed payment attempt
can later succeed authoritatively and consequently leave the failure list. Collected charges and
compensating refunds remain visible even when no order was fulfilled. No admin endpoint rewrites
payment state. Provider payloads, request/merchant keys, payout details and secrets are omitted.

Commerce exports accept exactly the same documented filters as their lists (no text `q`), use the
same column allowlist and deterministic ordering, and write the existing `admin.export` audit.
They are bounded snapshots of the first `limit` matching rows, not an unbounded export or a promise
of a complete result. Existing users/events/orders/tickets CSV filters remain `q`, `status`, and
`event_id` for orders/tickets.

## Suspension

- **Paid sales.** Independently changes activation `active -> suspended` or `suspended -> active`
  under the existing event/activation locks. This leaves event moderation unchanged. New paid
  holds and checkout of existing originally-paid holds fail `409 paid_sales_inactive`, including
  fully discounted paid types; eligible free registrations still complete. A charge confirmed
  while suspended remains a recorded successful payment, issues no ticket, and creates the
  existing `blocked_fulfillment` compensation refund. Suspending alone never initiates refunds
  for previously fulfilled orders or changes their records.
  Reinstatement rechecks paid type, payout, verification, terms and successful activation payment;
  missing prerequisites give `409 activation_incomplete`. It does not override other event gates.
  Missing event is `404 event_not_found`; invalid transitions are `409 paid_sales_not_active` or
  `paid_sales_not_suspended`. Each successful decision writes an admin-actor audit row
  `admin.paid_sales_suspended` / `admin.paid_sales_reinstated`, entity `sales_activation`, reason and
  before/after states, in the same transaction. Existing service-level activation audit is retained.
  These decisions do not create whole-event `moderation_action` rows; inspect the event audit
  history for paid-sales decisions. Optional `Idempotency-Key` uses the existing 8-128 character
  commerce key format and 24-hour retention; identical retries reauthorize and return the current
  checklist without repeating the transition/audit. Changed event or reason under the same
  actor/operation/key gives `409 idempotency_key_reused`. Without a key, repeated transitions
  return the state conflict, including concurrent duplicates.

- **User.** Sets `status = 'suspended'` and revokes every session in the same transaction. The
  user can no longer sign in, refresh, or use an existing access token. Reinstating allows a fresh
  sign-in; revoked sessions stay revoked. Platform admins cannot be suspended (revoke the grant with
  the CLI first); this also prevents self-suspension.
- **Event.** Sets `event.moderation_state = 'suspended'` and bumps `availability_version`. The
  existing checkout and admission code already treats this state as closed: new holds and
  confirmation of existing holds fail (buyers receive `404 event_not_found`, because suspended
  events are hidden from non-staff, or `409 event_not_on_sale`), and scanning returns
  `409 admission_closed`. Organizer staff, buyers (own orders and tickets) and admins can still read
  all records. Suspension does not cancel the event, refund orders or invalidate tickets; those stay
  explicit business actions.
- Repeating a transition returns `409 user_already_suspended`, `user_not_suspended`,
  `event_already_suspended` or `event_not_suspended`.
- Each decision inserts an immutable `moderation_action` (actor, target, action, reason) and an
  audit row in the same transaction as the state change. Event audit rows carry the
  organization and event so they appear in that event's history.

## Event reports

- A signed-in, verified account can report an event it is allowed to see (the normal visibility
  rules; drafts, unlisted-without-access and private events answer `404`). Categories: `spam`,
  `fraud`, `inappropriate`, `misleading`, `safety`, `other`; description 1-2000 characters.
- **Deduplication.** One live (`open` or `reviewing`) report per reporter, event and category,
  enforced by the partial unique index `uq_open_report`. Repeating returns `200` with the existing
  report and `"duplicate": true` instead of `201`. After resolution the reporter may report again.
- **Rate limit.** At most five new reports per account in a rolling hour, counted in the database
  while the reporter's row is locked, so parallel requests cannot exceed it:
  `429 report_rate_limited` with `Retry-After`. Duplicates do not consume allowance.
- The reporter's receipt omits admin notes. Review transitions are `open -> reviewing -> resolved`
  (or `open -> resolved`); a second resolve returns `409 report_already_resolved`, a review of a
  non-open report `409 report_not_open`. Reports do not suspend anything by themselves.

## Platform settings

| Key | Default | Range | Meaning |
|---|---:|---|---|
| `hold_minutes` | 10 | 1-60 | Checkout hold duration |
| `activation_fee_minor` | 500000 | 0-100000000 | Demo paid-sales activation fee, KZT minor units |
| `processing_rate_bps` | 300 | 0-10000 | Demo processing rate in basis points |
| `upload_max_mb` | 5 | 1-50 | Largest upload |

- Values are integers (`422 invalid_input` for other types, `422 setting_out_of_range` outside the
  range). Every change appends a row to `platform_setting_version`; rows are immutable (database
  trigger) and the audit row `admin.setting_changed` records key, version, value and effective time.
- `expected_version` is required (0 when the key was never changed). A stale value returns
  `409 setting_version_conflict`, so concurrent editors and retries cannot silently overwrite each
  other; version assignment is serialized per key with an advisory lock.
- **Prospective only.** `effective_at` defaults to now, may be up to a year ahead and may not be in
  the past (`422 invalid_effective_at`). The value in force is the highest version whose
  `effective_at` has passed. Existing orders, quotes, holds and activation records keep their own
  snapshots and are never recalculated.
- Other modules read a value with `admin_service.effective_setting(db, key)` when they start a new
  hold, quote or activation. **Integration point:** the current free checkout still uses the
  constant `HOLD_MINUTES`; switching it to `effective_setting(db, "hold_minutes")` is a one-line
  change for the checkout owner. No fee or rate logic is implemented here.

## CSV export

`GET /admin/exports/{kind}.csv` returns `text/csv; charset=utf-8` as an attachment. Columns are the
same fields as the matching search, so no secrets or unrelated personal data are exported. Any cell
that starts with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so spreadsheets
treat user-supplied text as text. Output is capped at 5000 rows and each export writes an
`admin.export` audit row (kind, limit and filters) in the same transaction.

## Tables (`0006_admin_moderation`)

| Table | Purpose |
|---|---|
| `platform_admin` | Admin grants; revoked, never deleted |
| `event_report` | User reports with review state and `uq_open_report` |
| `moderation_action` | Append-only suspend/reinstate decisions (user or event target) |
| `platform_setting_version` | Append-only setting history |

The database atlas also designs a `target_activation_id` column on `moderation_action`; the current
deployed moderation table still has user/event targets only. Paid-sales decisions use the existing
immutable audit table, with an explicit activation entity and admin actor, rather than adding
schema or mislabelling them as whole-event moderation. The original moderation migration downgrade
deliberately raises, like earlier migrations.

## Not yet implemented

- Dispute, campaign, job/notification and offline-conflict admin views.
- Admin search/inspection of support cases (escalation itself exists: `POST /support/cases/{id}/escalation`).
- User-facing notices to affected users (BF-15); the audit trail already records each decision.
- Public platform settings endpoint for clients.
