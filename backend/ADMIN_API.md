# Platform administration API

Stage E, platform-admin scope (SRS 4.12, backend plan BF-21). Covers the admin role, search,
user/event suspension, event reports, platform settings and CSV export. Commerce areas (paid
activation, payments, refunds, campaigns, analytics) are not built here; see
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
| `GET /admin/exports/{users\|events\|orders\|tickets}.csv` | CSV download; filters `q`, `status`, `event_id` (orders and tickets), `limit` (1-5000, default 1000) |

Search lists return `{"items": [...], "total", "limit", "offset"}` with `limit` 1-100 (default 50)
and a deterministic order (newest first, ties by id). Search text is matched literally: `%` and
`_` are not wildcards. Responses never include password hashes, token hashes or QR material.
Order and ticket search show the same fields an organizer already sees; payments, refunds and
support cases are not stored yet, so they cannot be searched.

## Suspension

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

The database atlas also lists a `target_activation_id` column on `moderation_action`; it is added
together with the paid-sales activation tables. The migration downgrade deliberately raises, like
earlier migrations.

## Not yet implemented

- Paid-sales suspension/reinstatement, activation inspection, payment, refund, dispute, campaign,
  job/notification and offline-conflict views (the underlying tables do not exist yet).
- Admin search/inspection of support cases (escalation itself exists: `POST /support/cases/{id}/escalation`).
- User-facing notices to affected users (BF-15); the audit trail already records each decision.
- Public platform settings endpoint for clients.
