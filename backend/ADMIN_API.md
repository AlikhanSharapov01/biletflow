# Platform administration API

Stage E, platform-admin scope (SRS 4.12, backend plan BF-21). Covers the admin role, search,
user/event and paid-sales suspension, event reports, platform settings, payment/refund inspection,
read-only support/order/activation/campaign/offline-conflict inspection and CSV export. Other
operational views remain outside this increment; see [Not yet implemented](#not-yet-implemented).

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
| `GET /admin/orders/{order_id}` | Read-only order detail with linked records; see [Operational inspection](#operational-inspection) |
| `GET /admin/support-cases`, `GET /admin/support-cases/{case_id}` | Support triage search and read-only case detail |
| `GET /admin/activations` | Paid-sales activation search; filters `status`, `event_id`, `organization_id` |
| `GET /admin/campaigns`, `GET /admin/campaigns/{campaign_id}` | Campaign activity search and detail |
| `GET /admin/sync-conflicts`, `GET /admin/sync-conflicts/{conflict_id}` | Offline-conflict search and detail |
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
Order and ticket search show the same fields an organizer already sees.

## Operational inspection

Read-only views for investigating a report or failure (BF-21). They all use the admin guard and
the search envelope above (`limit` 1-100, `offset` 0-100000, newest first then id); invalid UUIDs,
enums and booleans are `422`. Each view names its columns. None of them writes a row, and
inspecting a record never grants an ownership, organizer or support role: every action stays
behind the owning module's permission check.

| View | Filters (exact unless noted) | Rows and detail |
|---|---|---|
| `support-cases` | `q` (literal subject text or exact case id), `case_id`, `requester_user_id`, `order_id`, `ticket_id`, `event_id`, `organization_id`, `status`, `category`, `kind` (`attendee`, `organizer_platform`), `escalated` (`true`/`false`) | Case metadata, linked ids, assignment/escalation/resolution times, `last_seq` and `platform_access` (platform admins may work it). Ordered by last activity. Detail adds `viewer_roles` (the caller's current support roles), `message_count`, the append-only status/assignment/escalation history, and the linked order/ticket id and status. Message text and attachments are never included |
| `orders/{id}` | - | The buyer order view (items, recipients, tickets, payment, refunds, promo) with `qr_payload` always `null`, plus linked support cases, ticket delivery jobs (status, attempts, safe error code) and the audit trail of the order, its tickets, payment attempts and refunds (action, entity, actor, time; at most 100 each) |
| `activations` | `status` (`incomplete`, `pending`, `active`, `failed`, `suspended`), `event_id`, `organization_id` | Activation id, event and title, organization, status, saved fee, paid attempt, activation time and suspension reason. The per-event checklist stays `GET /admin/events/{event_id}/paid-sales` |
| `campaigns` | `q` (literal name or exact campaign id), `event_id`, `organization_id`, `enabled` | Campaign terms, `redemptions` and `active_reservations`. Detail adds the promo `code`, the reconciled campaign report, the latest 100 redemptions (order, discount, time) and reservation counts by status. Promo link tokens and URLs are omitted |
| `sync-conflicts` | `status` (`open`, `resolved`), `event_id`, `organization_id`, `ticket_id` | Conflict, operation, device, ticket and existing check-in ids with times. Detail is the organizer conflict view (operation, device and server clocks, existing check-in) plus `organization_id`. Resolution stays with event staff holding `attendees` |

`GET /admin/orders/{id}` answers `404 order_not_found`; the other details answer
`404 case_not_found`, `campaign_not_found` or `sync_conflict_not_found`. The buyer-only
`GET /orders/{id}` and the organizer conflict routes are unchanged and do not admit admins.
Admins still work only platform and escalated cases through `/support` (see
[SUPPORT_API.md](SUPPORT_API.md)), which also gained the same exact identifier filters for every
caller's own scope.

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
- **Notices.** Every user, event and paid-sales decision also records one deduplicated notification
  intent in the same transaction (recipients, wording and delivery rules are in
  [NOTIFICATIONS_CALENDAR_API.md](NOTIFICATIONS_CALENDAR_API.md#moderation-notices)). The reason is
  never sent. A mail or fan-out outage is retried later and never reverses the decision.
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
| `activation_fee_minor` | 500000 | 1-100000000 | Demo paid-sales activation fee, KZT minor units |
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
- **Where each setting applies** (`platform_settings.py`):
  - `hold_minutes`: read when a hold is created. The hold keeps its `expires_at`, and the order
    policy snapshot records the hold's actual length.
  - `processing_rate_bps`: the rate in force when the hold was created. The hold's pricing preview
    and the paid order quote both use it, so a rate change between hold and checkout never
    re-prices the buyer. The order saves `processing_rate_bps`; free orders have no fee.
  - `activation_fee_minor`: read when an event's activation is first started and saved on it. The
    checklist shows the current fee until then. The value cannot be 0 because an activation fee
    must be positive.
  - `upload_max_mb`: applies to support attachments and event images alike, as
    `min(deployment cap, setting)`. The deployment cap is `ATTACHMENT_MAX_BYTES` (5 MiB by default),
    which an admin setting cannot raise.
- **No race with a change.** Creating a hold or activation takes a shared advisory lock on the
  settings it reads, and a change takes the exclusive lock before it reads the clock for its
  effective time. A record therefore either sees a change that became effective before its own
  timestamp, or is stamped before it.

### Public settings

`GET /api/v1/settings/public` needs no sign-in and returns only what clients need for countdowns,
fee estimates and upload checks, with `Cache-Control: no-store`:

```json
{"hold_minutes": 10, "processing_rate_bps": 300, "activation_fee_minor": 500000,
 "upload_max_bytes": 5242880, "currency": "KZT"}
```

Values are those in force now. Scheduled changes, versions, authors, reasons and history are not
exposed; they stay under `/admin/settings`. `upload_max_bytes` already includes the deployment cap.

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

- Advanced dispute and chargeback handling (excluded from #72).
- Views of exhausted jobs and failed notification deliveries (#73).
