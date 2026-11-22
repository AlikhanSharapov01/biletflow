# Platform administration API

Stage E, platform-admin scope (SRS 4.12, backend plan BF-21). Covers the admin role, search,
user/event and paid-sales suspension, event reports, platform settings, payment/refund inspection,
read-only support/order/activation/campaign/offline-conflict inspection, background job and
notification delivery failures with a bounded audited retry, and CSV export. Other
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
| `GET /admin/jobs`, `GET /admin/jobs/{job_id}` | Outbox jobs; see [Background work and deliveries](#background-work-and-deliveries) |
| `POST /admin/jobs/{job_id}/retry` | Body `{"reason"}`; optional `Idempotency-Key`. Sends one `dead` job back to the worker |
| `GET /admin/notification-deliveries`, `GET /admin/notification-deliveries/{delivery_id}` | Per-channel notification deliveries |
| `POST /admin/notification-deliveries/{delivery_id}/retry` | Body `{"reason"}`; optional `Idempotency-Key`. Sends one `failed` email delivery back |
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

### Inspection examples

Identifiers and times are illustrative; every request carries `Authorization: Bearer <access
token>` of a platform admin. The list routes return the search envelope
`{"items", "total", "limit", "offset"}` (default `limit` 50); the detail routes return the object
shown. Timestamps are ISO 8601 with a UTC offset, `Z` or `+00:00`; parse both.

**Support cases** with `GET /admin/support-cases`:

```text
GET /api/v1/admin/support-cases?status=open&escalated=false&limit=20
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "c58a3f12-90be-47d4-a6e1-3b7d92c05f84",
      "kind": "attendee",
      "category": "delivery",
      "subject": "Ticket email missing",
      "status": "open",
      "requester_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
      "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
      "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
      "order_id": "2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471",
      "ticket_id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60",
      "assigned_to_user_id": null,
      "escalated_at": null,
      "resolved_at": null,
      "last_seq": 1,
      "created_at": "2026-11-17T09:05:41.220Z",
      "updated_at": "2026-11-17T09:05:41.220Z",
      "platform_access": false
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

**One support case** with `GET /admin/support-cases/{case_id}`: the row above as `case`, plus the
caller's current roles on it (empty when the caller has no role on the case; an admin gets
`platform` on an `organizer_platform` case or an escalated case, and `requester` or `support` when
the admin is the requester or the event's support), the message count (never the text), the
append-only history (each item has `seq`, `change_kind`, `before_value`, `after_value`, `reason`,
`actor_user_id`, `created_at`; at most 100) and the linked order and ticket:

```text
GET /api/v1/admin/support-cases/c58a3f12-90be-47d4-a6e1-3b7d92c05f84
Authorization: Bearer <access token>
```

```json
{
  "case": {
    "id": "c58a3f12-90be-47d4-a6e1-3b7d92c05f84",
    "kind": "attendee",
    "category": "delivery",
    "subject": "Ticket email missing",
    "status": "open",
    "requester_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
    "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
    "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
    "order_id": "2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471",
    "ticket_id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60",
    "assigned_to_user_id": null,
    "escalated_at": null,
    "resolved_at": null,
    "last_seq": 1,
    "created_at": "2026-11-17T09:05:41.220000+00:00",
    "updated_at": "2026-11-17T09:05:41.220000+00:00",
    "platform_access": false
  },
  "viewer_roles": [],
  "message_count": 1,
  "history": [],
  "order": {"id": "2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471", "status": "confirmed"},
  "ticket": {"id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60", "status": "valid"}
}
```

**One order** with `GET /admin/orders/{order_id}` (a free order here, so `payment` is `null` and
`refunds` is empty). It is the buyer's order view, with every `qr_payload` set to `null`, plus the
linked support cases, ticket delivery jobs and audit rows (each list at most 100):

```text
GET /api/v1/admin/orders/2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471
Authorization: Bearer <access token>
```

```json
{
  "order": {
    "id": "2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471",
    "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
    "buyer_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
    "hold_id": "8f2c6d40-b1a7-4e35-9d08-5a3e7c1b9f26",
    "status": "confirmed",
    "currency": "KZT",
    "gross_minor": 0,
    "discount_minor": 0,
    "payable_minor": 0,
    "processing_fee_minor": 0,
    "confirmed_at": "2026-11-17T09:01:12.804000+00:00",
    "created_at": "2026-11-17T09:01:12.804000+00:00",
    "quote_expires_at": null,
    "items": [
      {
        "id": "f03a9c17-6e4d-4b82-a5c1-2d8e7b3f9046",
        "unit_number": 1,
        "ticket_type_id": "1c9e5b73-a408-4d26-b7f1-9e3a6c2d8054",
        "ticket_type_name": "General admission",
        "recipient_name": "Aigerim S.",
        "recipient_email": "aigerim@example.com",
        "face_value_minor": 0,
        "discount_minor": 0,
        "paid_minor": 0,
        "seat_snapshot": null,
        "ticket": {
          "id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60",
          "order_item_id": "f03a9c17-6e4d-4b82-a5c1-2d8e7b3f9046",
          "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
          "event_title": "Campus Jazz Night",
          "event_starts_at": "2026-12-05T14:00:00+00:00",
          "venue_name": "Main Hall",
          "ticket_type_name": "General admission",
          "recipient_name": "Aigerim S.",
          "seat_snapshot": null,
          "status": "valid",
          "recipient_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
          "claimed_at": "2026-11-17T09:01:13.120000+00:00",
          "issued_at": "2026-11-17T09:01:12.804000+00:00",
          "qr_payload": null
        }
      }
    ],
    "promo": null,
    "payment": null,
    "refunds": []
  },
  "support_cases": [
    {
      "id": "c58a3f12-90be-47d4-a6e1-3b7d92c05f84",
      "kind": "attendee",
      "category": "delivery",
      "status": "open",
      "escalated_at": null,
      "created_at": "2026-11-17T09:05:41.220000+00:00"
    }
  ],
  "deliveries": [
    {
      "id": "e3b9a4d6-1c28-4f75-8b0a-6d4e2f9c1a73",
      "ticket_id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60",
      "status": "done",
      "attempt_count": 1,
      "last_error": null,
      "created_at": "2026-11-17T09:01:12.804000+00:00",
      "completed_at": "2026-11-17T09:01:20.377000+00:00"
    }
  ],
  "audit": [
    {
      "id": "3b8d1e65-4f90-4a27-8c3e-b5d2a9f07c14",
      "action": "checkout.order_confirmed",
      "entity_type": "ticket_order",
      "entity_id": "2e7b6a90-14d8-4f53-b2c1-8a9d05e3f471",
      "actor_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
      "service_actor": null,
      "created_at": "2026-11-17T09:01:12.804000+00:00"
    }
  ]
}
```

**Activations** with `GET /admin/activations`:

```text
GET /api/v1/admin/activations?status=suspended&organization_id=a3d70c19-5e82-4b46-8f0d-6c1b92e7a350
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "e5a7c039-8d12-4b64-a0f3-1c6d9b2e7845",
      "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
      "event_title": "Campus Jazz Night",
      "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
      "status": "suspended",
      "activation_fee_minor": 500000,
      "currency": "KZT",
      "paid_attempt_id": "09d4b6f8-2e71-4c53-9a0b-8f3c5e1d7a62",
      "activated_at": "2026-11-10T11:20:00.000Z",
      "suspension_reason": "Chargeback investigation",
      "created_at": "2026-11-10T11:15:42.518Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Campaigns** with `GET /admin/campaigns`:

```text
GET /api/v1/admin/campaigns?q=spring&enabled=true
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "4a6e8c20-d193-4b75-8e0f-7b2c5a9d3168",
      "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
      "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
      "name": "Spring sale",
      "discount_kind": "percentage",
      "percentage_bps": 1000,
      "fixed_minor": null,
      "starts_at": "2026-11-01T00:00:00.000Z",
      "ends_at": "2026-12-01T00:00:00.000Z",
      "max_redemptions": 100,
      "is_enabled": true,
      "created_at": "2026-10-28T08:30:11.402Z",
      "redemptions": 1,
      "active_reservations": 0
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**One campaign** with `GET /admin/campaigns/{campaign_id}`: the row as `campaign`, the promo `code`,
the reconciled `report`, up to 100 redemptions (newest first) and reservation counts by status
(`active`, `consumed`, `released`; statuses with no reservation are absent). Link tokens and URLs
are never included:

```text
GET /api/v1/admin/campaigns/4a6e8c20-d193-4b75-8e0f-7b2c5a9d3168
Authorization: Bearer <access token>
```

```json
{
  "campaign": {
    "id": "4a6e8c20-d193-4b75-8e0f-7b2c5a9d3168",
    "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
    "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
    "name": "Spring sale",
    "discount_kind": "percentage",
    "percentage_bps": 1000,
    "fixed_minor": null,
    "starts_at": "2026-11-01T00:00:00+00:00",
    "ends_at": "2026-12-01T00:00:00+00:00",
    "max_redemptions": 100,
    "is_enabled": true,
    "created_at": "2026-10-28T08:30:11.402000+00:00",
    "redemptions": 1,
    "active_reservations": 0
  },
  "code": "SPRING10",
  "report": {
    "campaign_id": "4a6e8c20-d193-4b75-8e0f-7b2c5a9d3168",
    "redemptions": 1,
    "orders": 1,
    "tickets": 2,
    "tickets_refunded": 0,
    "tickets_kept": 2,
    "gross_minor": 2000000,
    "discount_minor": 200000,
    "collected_minor": 1800000,
    "refunds_minor": 0,
    "pending_refunds_minor": 0,
    "fees_minor": 54000,
    "net_minor": 1746000,
    "definitions": {
      "attribution": "Eligible lines only; other lines of the same order are not part of the campaign.",
      "tickets": "Tickets sold on eligible lines, kept in history after a refund.",
      "tickets_refunded": "Historical: eligible tickets later refunded.",
      "tickets_kept": "Current: eligible tickets that are still valid or checked in.",
      "gross_minor": "Saved face values of fulfilled items, before discounts.",
      "collected_minor": "Actual successful ticket charges, including compensating extra charges.",
      "fees_minor": "Saved charge fees less fees reversed on successful full simulated refunds.",
      "pending_refunds_minor": "Requested, pending or failed full-refund obligations.",
      "net_minor": "Actual collections less successful ticket refunds and retained processing fees."
    },
    "generated_at": "2026-11-17T10:30:00.000000+00:00"
  },
  "redemptions": [
    {
      "id": "b92d4f61-7a08-4c35-8e1d-0f6a3c9b5e27",
      "order_id": "7e0a5c93-1b64-4d28-a9f7-3c8d2e6b1f40",
      "discount_minor": 200000,
      "created_at": "2026-11-12T13:44:09.615000+00:00"
    }
  ],
  "reservations": {"consumed": 1}
}
```

**Offline sync conflicts** with `GET /admin/sync-conflicts`:

```text
GET /api/v1/admin/sync-conflicts?status=open&event_id=5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "6d3e9b04-f2a1-4c78-b5e6-8a0c7d1f3925",
      "status": "open",
      "reason": "already_checked_in",
      "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
      "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350",
      "ticket_id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60",
      "offline_operation_id": "a0b7e3d5-92c4-4f16-8d3a-6e5c1b9f7284",
      "operation_kind": "check_in",
      "device_id": "52c8f1a6-3d97-4e04-b6a2-9d7e0c4b8135",
      "existing_check_in_id": "c4e1a7d9-5b36-4f82-90c7-2a8d6f3e1b50",
      "created_at": "2026-11-17T10:12:30.447Z",
      "resolved_at": null,
      "resolved_by_user_id": null
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**One conflict** with `GET /admin/sync-conflicts/{conflict_id}`: the organizer's conflict view plus
`organization_id`. Resolving it stays an organizer action:

```text
GET /api/v1/admin/sync-conflicts/6d3e9b04-f2a1-4c78-b5e6-8a0c7d1f3925
Authorization: Bearer <access token>
```

```json
{
  "id": "6d3e9b04-f2a1-4c78-b5e6-8a0c7d1f3925",
  "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
  "status": "open",
  "reason": "already_checked_in",
  "created_at": "2026-11-17T10:12:30.447000+00:00",
  "resolved_at": null,
  "resolved_by_user_id": null,
  "resolution_note": null,
  "operation": {
    "operation_id": "a0b7e3d5-92c4-4f16-8d3a-6e5c1b9f7284",
    "sequence_number": 1,
    "kind": "check_in",
    "status": "conflict",
    "rejection_code": "already_checked_in",
    "ticket_id": "d6f1b852-0a3c-49e7-8b24-7c9e3a5d1f60",
    "ticket": {"attendee_name": "Aigerim S.", "ticket_type_name": "General admission"},
    "device": {"id": "52c8f1a6-3d97-4e04-b6a2-9d7e0c4b8135", "label": "Gate 2 phone"},
    "scanner_user_id": "91f4a2c8-6b03-4d57-a8e9-3c7d5b1e0f62",
    "captured_at_device": "2026-11-17T10:03:51.000000+00:00",
    "device_reported_at": "2026-11-17T10:12:29.900000+00:00",
    "received_at_server": "2026-11-17T10:12:30.401000+00:00",
    "processed_at_server": "2026-11-17T10:12:30.447000+00:00"
  },
  "existing_check_in": {
    "id": "c4e1a7d9-5b36-4f82-90c7-2a8d6f3e1b50",
    "accepted_at": "2026-11-17T10:01:07.230000+00:00",
    "source": "online",
    "scanner_user_id": "91f4a2c8-6b03-4d57-a8e9-3c7d5b1e0f62",
    "reversed_at": null
  },
  "organization_id": "a3d70c19-5e82-4b46-8f0d-6c1b92e7a350"
}
```

### Inspection errors

Every error is `{"detail": {"code": "..."}}`. Errors that all eight routes can return:

| Status | `code` | When |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 403 | `admin_required` | Signed in, but without a current platform-admin grant (an organizer owner, staff or scanner is not one) |
| 422 | `invalid_input` | A path id is not a UUID; an enum filter is outside its values (`status`, `category`, `kind`); a boolean filter is not `true`/`false`; `q` is empty or over 100 characters; `limit` is outside 1-100 or `offset` outside 0-100000. The body lists `fields` and never echoes the input |
| 503 | `database_unavailable` | The database failed |
| 500 | `internal_error` | Unhandled server error; quote the `X-Request-ID` response header |

Route-specific errors (the list routes have none: a filter that matches nothing returns an empty
page):

| Route | Status | `code` | When |
|---|---|---|---|
| `GET /support-cases/{case_id}` | 404 | `case_not_found` | No such case |
| `GET /orders/{order_id}` | 404 | `order_not_found` | No such order |
| `GET /campaigns/{campaign_id}` | 404 | `campaign_not_found` | No such campaign |
| `GET /sync-conflicts/{conflict_id}` | 404 | `sync_conflict_not_found` | No such conflict |

### Inspection stability

- **Stable** (asserted by `test_admin_inspection.py`):
  - The search envelope, the filter names listed in the table above and in the endpoints table, and
    the 404 `code` strings above plus `admin_required`.
  - The complete key set of a support-case row (the 17 keys in the example) and of an audit entry
    (`id`, `action`, `entity_type`, `entity_id`, `actor_user_id`, `service_actor`, `created_at`).
  - Support-case detail `case`, `viewer_roles`, `message_count`, `history[].change_kind`, `order`
    and `ticket`; order detail `order.id`, `order.status`, `order.items[].ticket.id`, the
    `qr_payload` that is always `null`, `support_cases[].id`, `deliveries[].ticket_id`,
    `deliveries[].status` and `audit`.
  - Activation row `status`, `organization_id`, `paid_attempt_id` and `activation_fee_minor`;
    campaign row `id`, `organization_id` and `redemptions`; campaign detail `campaign.id`, `code`,
    `report.redemptions` and `redemptions[].order_id`; conflict row `id`, `status`,
    `organization_id` and `ticket_id`; conflict detail `id`, `existing_check_in.id` and
    `operation.status`.
  - What is never present: message text, ticket QR material, token hashes, promo link tokens and
    URLs.
- **May change.** Ignore unknown fields. No test asserts the following yet, so treat them as
  provisional.
  - The remaining fields of each row and detail (for example activation `event_title`, `currency`,
    `activated_at`, `suspension_reason`; campaign terms and dates; the remaining fields of the
    order view, its ticket and its promo, payment and refund objects; delivery `attempt_count`,
    `last_error`, `completed_at`; the `operation` and `existing_check_in` sub-objects other than
    the ones above).
  - Every `report` number except `redemptions`, the wording of `report.definitions`, and
    `report.generated_at`.
  - The `reservations` counts and which statuses appear.
  - The set of `reason` values of a conflict (`already_checked_in` and `ticket_not_valid` in the
    code today).
  - The 100-item cap on linked lists, and the `Z` or `+00:00` spelling of offsets.
  - The codes `invalid_input` (and its `fields` list), `database_unavailable` and
    `invalid_credentials`: the tests assert only their status codes.

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

## Background work and deliveries

BF-15/BF-21 (#73). Admin-only, paginated (`limit` 1-100, `offset` 0-100000, newest first then id,
five-second statement timeout); invalid UUIDs and enums are `422`.

**Jobs** (`outbox_job`). `status` is `pending` (waiting, possibly after a temporary failure with
`last_error` set), `leased` (a worker holds it until `lease_until`; an expired lease is picked up
again), `done` (completed) or `dead` (the worker gave up after `max_attempts`). Filters `status`,
`kind`, `event_id` and `linked_id` (any linked business id below, or the account/organization
of an auth/invitation email). Rows show id, kind, status, `attempt_count`, `max_attempts` (`5` for
email and fan-out jobs, `null` for payment jobs, which never exhaust), `admin_retry_count`,
`last_error`, available/lease/created/completed times, `event_id`, `retryable` (status and
bound allow a retry; target checks run only when it is requested) and `context`.
`context` holds only allowlisted payload identifiers (`notice`, `event_id`, `order_id`,
`ticket_id`, `case_id`, `recipient_user_id`, `user_id`, `decision_id`, `change_id`, `payout_id`,
`refund_id`, `attempt_id`, `calendar_sequence`); auth emails show `user_id` and `purpose`, staff
invitations `organization_id`, never the token or invitation id behind a link.

**Deliveries** (`notification_delivery`). In-app rows are written `sent`. Email rows are
`pending` (with `next_attempt_at` and the last safe error after a temporary failure), `sent` or
`failed` (`email_delivery_failed` after 5 attempts, or `recipient_unavailable`). Filters
`status`, `channel`, `kind`, `recipient_user_id`, `event_id`, `notification_id`. Rows add the
notification `kind`, recipient id, event, `target` (as in the inbox) and `provider_message_id`;
never the address or the rendered text.

`last_error` is always one of the worker's constant codes; exception text, addresses and tokens
are never stored.

### Retry

A retry is an explicit recovery, not a new logical operation: the same row goes back to the
worker with `attempt_count = 0` (a job also gets `available_at = now`, a delivery
`next_attempt_at = now`), keeping its deduplication key and its last error until the next
outcome. In one transaction, under the row lock, it checks in this order and answers `409`:

| Code | When |
|---|---|
| `retry_not_supported` | Payment jobs and other kinds outside the table below; an in-app delivery that is not `sent` |
| `already_completed` | The row is `done`/`sent`, or the business work already happened (see below). In-app deliveries are written as `sent`, so retrying one answers this code: a delivery is checked for `sent` before its channel |
| `not_exhausted` | The row is `pending`/`leased`: the worker still owns it |
| `retry_limit_reached` | The row already had 3 admin retries (also a database CHECK) |
| `target_obsolete` | The current target state no longer supports sending it (see below) |

Unknown rows are `404 job_not_found` / `delivery_not_found`. A successful retry returns the row
view, increments `admin_retry_count` and writes `admin.job_retried` (entity `outbox_job`) or
`admin.notification_delivery_retried` (entity `notification_delivery`) with the reason, kind,
previous status and attempts and retry number, in the same transaction. Concurrent retries reset
the row once; the others get `not_exhausted`. With an `Idempotency-Key` (8-128 characters,
24 hours, as for paid-sales decisions) an identical repeat returns the current view without a
second reset or audit row; the same key with another row or reason is `409 idempotency_key_reused`.

| Work | Retried when | Otherwise |
|---|---|---|
| `auth_email` | The token is unconsumed and unexpired and the account is active; the worker signs the same link again | consumed: `already_completed`; expired, missing or inactive: `target_obsolete`. Users can also request a new verification/reset email |
| `staff_invite_email` | The invitation is not accepted, revoked or expired | accepted: `already_completed`; otherwise `target_obsolete`. Organizers can invite again |
| `ticket_delivery_email` | The ticket is still `valid` and no later delivery of it is done or queued | later delivery: `already_completed`; not valid: `target_obsolete`. Buyers and recipients keep `POST /tickets/{id}/delivery/resend` |
| `support_email` | The recipient is active, verified and still related to the case | `target_obsolete` |
| `notification_fanout` | The notice is still current (rules below); fan-out is deduplicated per recipient, so no second inbox row is created | `target_obsolete` |
| email `notification_delivery` | The recipient can still receive that notice and it is still current | `target_obsolete` |

A notice is no longer current when: `payment_failed` and the order is no longer `pending` (paid,
expired or closed: it must not contradict a success); `event_updated` and the event was cancelled
or updated again (the newer notice supersedes it); an account, event or paid-sales moderation
notice whose decision has since been reversed; or its event no longer exists. Other notices
(cancellation, purchase, refund, payout, ticket, support) only need an eligible recipient. The
worker still applies its own send-time checks (recipient eligibility, ticket validity, token and
invitation state); these retry rules are checked when the retry is accepted, so a notice that
becomes obsolete only after that may still be sent.

Email stays at-least-once: a retry after an uncertain SMTP outcome can deliver a duplicate, and
nothing here promises exactly-once delivery. Ticket validity never depends on email.

### Examples

Identifiers and times below are illustrative. Every request carries
`Authorization: Bearer <access token>` of a platform admin. Timestamps are ISO 8601 with an explicit
UTC offset, written either as `Z` or as `+00:00` (the examples show both); parse both.

**List jobs** with `GET /admin/jobs`:

```text
GET /api/v1/admin/jobs?status=dead&kind=auth_email&limit=20&offset=0
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "7c1f0a52-3b6e-4d0f-9a1e-5d2b8c4e6f10",
      "kind": "auth_email",
      "status": "dead",
      "attempt_count": 5,
      "max_attempts": 5,
      "admin_retry_count": 0,
      "last_error": "email_delivery_failed",
      "available_at": "2026-11-17T08:47:40.512Z",
      "lease_until": null,
      "created_at": "2026-11-17T08:41:12.531Z",
      "completed_at": null,
      "event_id": null,
      "context": {"user_id": "3f6a9d2e-81b4-4c57-a0e3-92d1b7c45e08", "purpose": "email_verify"},
      "retryable": true
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

**Read one job** with `GET /admin/jobs/{job_id}`. The response is the row object above on its own:

```text
GET /api/v1/admin/jobs/7c1f0a52-3b6e-4d0f-9a1e-5d2b8c4e6f10
Authorization: Bearer <access token>
```

```json
{
  "id": "7c1f0a52-3b6e-4d0f-9a1e-5d2b8c4e6f10",
  "kind": "auth_email",
  "status": "dead",
  "attempt_count": 5,
  "max_attempts": 5,
  "admin_retry_count": 0,
  "last_error": "email_delivery_failed",
  "available_at": "2026-11-17T08:47:40.512000+00:00",
  "lease_until": null,
  "created_at": "2026-11-17T08:41:12.531000+00:00",
  "completed_at": null,
  "event_id": null,
  "context": {"user_id": "3f6a9d2e-81b4-4c57-a0e3-92d1b7c45e08", "purpose": "email_verify"},
  "retryable": true
}
```

**Retry one job** with `POST /admin/jobs/{job_id}/retry`. The body is exactly `{"reason"}`
(1-500 characters after trimming; any other field is `422`). `Idempotency-Key` is optional. The
response is the row after the reset: back to `pending` with no attempts, `admin_retry_count`
increased, and the old `last_error` kept until the next outcome:

```text
POST /api/v1/admin/jobs/7c1f0a52-3b6e-4d0f-9a1e-5d2b8c4e6f10/retry
Authorization: Bearer <access token>
Idempotency-Key: 0b8f6c1e-4d52-4a39-9e7a-2c5d81f3a604
Content-Type: application/json
```

```json
{"reason": "SMTP outage resolved"}
```

```json
{
  "id": "7c1f0a52-3b6e-4d0f-9a1e-5d2b8c4e6f10",
  "kind": "auth_email",
  "status": "pending",
  "attempt_count": 0,
  "max_attempts": 5,
  "admin_retry_count": 1,
  "last_error": "email_delivery_failed",
  "available_at": "2026-11-17T10:02:15.208000+00:00",
  "lease_until": null,
  "created_at": "2026-11-17T08:41:12.531000+00:00",
  "completed_at": null,
  "event_id": null,
  "context": {"user_id": "3f6a9d2e-81b4-4c57-a0e3-92d1b7c45e08", "purpose": "email_verify"},
  "retryable": false
}
```

**List deliveries** with `GET /admin/notification-deliveries`:

```text
GET /api/v1/admin/notification-deliveries?status=failed&channel=email&kind=event_updated
Authorization: Bearer <access token>
```

```json
{
  "items": [
    {
      "id": "b4e2a7c9-5d13-48f6-8c0a-1e9f3d6b7a25",
      "notification_id": "0d8c5e31-7a92-4b64-b1f8-6c3a9e2d4f57",
      "kind": "event_updated",
      "channel": "email",
      "status": "failed",
      "attempt_count": 5,
      "max_attempts": 5,
      "admin_retry_count": 0,
      "last_error": "email_delivery_failed",
      "next_attempt_at": null,
      "sent_at": null,
      "provider_message_id": null,
      "created_at": "2026-11-17T08:30:04.117Z",
      "recipient_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
      "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
      "target": {"type": "event", "id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68"},
      "retryable": true
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Read one delivery** with `GET /admin/notification-deliveries/{delivery_id}` returns the same row
object on its own (`404 delivery_not_found` for an unknown id):

```text
GET /api/v1/admin/notification-deliveries/b4e2a7c9-5d13-48f6-8c0a-1e9f3d6b7a25
Authorization: Bearer <access token>
```

```json
{
  "id": "b4e2a7c9-5d13-48f6-8c0a-1e9f3d6b7a25",
  "notification_id": "0d8c5e31-7a92-4b64-b1f8-6c3a9e2d4f57",
  "kind": "event_updated",
  "channel": "email",
  "status": "failed",
  "attempt_count": 5,
  "max_attempts": 5,
  "admin_retry_count": 0,
  "last_error": "email_delivery_failed",
  "next_attempt_at": null,
  "sent_at": null,
  "provider_message_id": null,
  "created_at": "2026-11-17T08:30:04.117000+00:00",
  "recipient_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
  "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
  "target": {"type": "event", "id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68"},
  "retryable": true
}
```

**Retry one delivery** with `POST /admin/notification-deliveries/{delivery_id}/retry`, same body and
optional `Idempotency-Key` as for jobs. The response is the delivery row after the reset:

```text
POST /api/v1/admin/notification-deliveries/b4e2a7c9-5d13-48f6-8c0a-1e9f3d6b7a25/retry
Authorization: Bearer <access token>
Content-Type: application/json
```

```json
{"reason": "SMTP outage resolved"}
```

```json
{
  "id": "b4e2a7c9-5d13-48f6-8c0a-1e9f3d6b7a25",
  "notification_id": "0d8c5e31-7a92-4b64-b1f8-6c3a9e2d4f57",
  "kind": "event_updated",
  "channel": "email",
  "status": "pending",
  "attempt_count": 0,
  "max_attempts": 5,
  "admin_retry_count": 1,
  "last_error": "email_delivery_failed",
  "next_attempt_at": "2026-11-17T10:04:51.640000+00:00",
  "sent_at": null,
  "provider_message_id": null,
  "created_at": "2026-11-17T08:30:04.117000+00:00",
  "recipient_user_id": "e19b4c70-2a5d-4f38-9c61-8d0a7b3e5f12",
  "event_id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68",
  "target": {"type": "event", "id": "5a2d8f14-6c3b-4e97-a1d0-3b9e7c4f2a68"},
  "retryable": false
}
```

### Errors

Every error is `{"detail": {"code": "..."}}`, for example a retry of a job the worker still owns:

```json
{"detail": {"code": "not_exhausted"}}
```

Errors that every one of the six routes can return:

| Status | `code` | When |
|---|---|---|
| 401 | `invalid_credentials` | No bearer token, a malformed or expired one, a revoked session, or an account that is not active and verified |
| 403 | `admin_required` | Signed in, but without a current platform-admin grant |
| 422 | `invalid_input` | A path id is not a UUID; a filter is not in its enum (job `kind` is free text of 1-64 characters); `limit` is outside 1-100 or `offset` outside 0-100000; the retry body is missing, has an unknown field, or has an empty or over-long `reason`. The body also lists `fields` as `{"location", "type"}` pairs and never echoes the input |
| 503 | `database_unavailable` | The database failed, or a list hit its five-second statement timeout |
| 500 | `internal_error` | Unhandled server error. Quote the `X-Request-ID` response header |

Errors specific to one route:

| Route | Status | `code` | When |
|---|---|---|---|
| `GET /jobs/{job_id}` | 404 | `job_not_found` | No such job |
| `GET /notification-deliveries/{delivery_id}` | 404 | `delivery_not_found` | No such delivery |
| `POST /jobs/{job_id}/retry` | 404 | `job_not_found` | No such job |
| `POST /notification-deliveries/{delivery_id}/retry` | 404 | `delivery_not_found` | No such delivery |
| Both retry routes | 422 | `invalid_idempotency_key` | `Idempotency-Key` is not 8-128 characters of `A-Z a-z 0-9 . _ : -` |
| Both retry routes | 409 | `idempotency_key_reused` | The same key was used within 24 hours with another row or another `reason` |
| Both retry routes | 409 | `retry_not_supported` | Job kind outside the retry table above, or an in-app delivery that is not `sent` |
| Both retry routes | 409 | `already_completed` | The row is `done`/`sent`, or the work already happened (see the retry table) |
| Both retry routes | 409 | `not_exhausted` | The row is `pending`/`leased`, or a delivery that is not `failed` |
| Both retry routes | 409 | `retry_limit_reached` | The row already had 3 admin retries |
| Both retry routes | 409 | `target_obsolete` | The current target state no longer supports sending it |

The list routes have no route-specific error: unknown filter values are `422 invalid_input`, and a
filter that matches nothing returns an empty page.

### Stability

For web and mobile screens built on the routes above.

- **Stable.** The page envelope `items`, `total`, `limit`, `offset`; the error `code` strings
  `admin_required`, `retry_not_supported`, `already_completed`, `not_exhausted`,
  `retry_limit_reached`, `target_obsolete` and `idempotency_key_reused`, which tests assert; job
  and delivery `id`, `kind`, `status`,
  `attempt_count`, `admin_retry_count`, `retryable` and `last_error`; job `max_attempts` and
  `context`; delivery `channel` and `target`; the `status` values (`pending`, `leased`, `done`,
  `dead` for jobs; `pending`, `sent`, `failed` for deliveries), which the list filters validate; the
  `status` and `attempt_count` of a row after a retry; and the filters `status`, `kind`, `channel`
  and `linked_id`.
- **May change.** Clients should ignore unknown fields and unknown values.
  - The error codes `job_not_found`, `delivery_not_found`, `invalid_idempotency_key` and
    `invalid_input` (and its `fields` list): the tests assert only their status codes.
  - Free-text `reason` is stored as sent and never interpreted.
  - The set of keys inside `context` (an allowlist that grows with new job kinds) and the set of
    `last_error` strings (today a few constants such as `email_delivery_failed` and
    `recipient_unavailable`).
  - The retry limit (3) and `max_attempts` (5), which are constants in the code.
  - The job fields `available_at`, `lease_until`, `created_at`, `completed_at` and `event_id`, and
    the delivery fields `notification_id`, `next_attempt_at`, `sent_at`, `provider_message_id`,
    `recipient_user_id`, `event_id` and `created_at`; no test asserts them yet, so treat them as
    provisional.
  - The filters `event_id`, `recipient_user_id` and `notification_id`, for the same reason.
  - The `Z` or `+00:00` spelling of the offset.

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

## Tables (`0006_admin_moderation`, `0019_admin_retry`)

| Table | Purpose |
|---|---|
| `platform_admin` | Admin grants; revoked, never deleted |
| `event_report` | User reports with review state and `uq_open_report` |
| `moderation_action` | Append-only suspend/reinstate decisions (user or event target) |
| `platform_setting_version` | Append-only setting history |

`0019_admin_retry` adds `admin_retry_count integer NOT NULL DEFAULT 0` with
`CHECK (admin_retry_count BETWEEN 0 AND 3)` to `outbox_job` (`outbox_admin_retries`) and
`notification_delivery` (`notification_delivery_ck5`). The check is added `NOT VALID` and validated
outside the transaction. Its downgrade drops only the two columns.

The database atlas also designs a `target_activation_id` column on `moderation_action`; the current
deployed moderation table still has user/event targets only. Paid-sales decisions use the existing
immutable audit table, with an explicit activation entity and admin actor, rather than adding
schema or mislabelling them as whole-event moderation. The original moderation migration downgrade
deliberately raises, like earlier migrations.

## Not yet implemented

- Advanced dispute and chargeback handling (excluded from #72).
