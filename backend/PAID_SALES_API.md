# Paid-sales activation (simulated)

Commerce package B2 (SRS 4.5, backend plan BF-06, database specification TX-16). Everything
here is an **academic simulation**: no card numbers, no real money, no production identity
checks. Every payout, verification and payment record is stored with `environment =
"simulation"`, and API responses carry `"simulated": true`.

All endpoints are under `/api/v1`, need a verified signed-in account and return errors as
`{"detail": {"code": "..."}}`.

## Who may manage activation

The organization owner, or an organization member with the `finance` capability. Anyone else
gets `404 organization_not_found`; members without `finance` get `403 permission_denied`.

## Checklist and endpoints

| Method and path | Purpose |
|---|---|
| `GET /events/{event_id}/paid-sales` | Checklist: `status`, `missing`, each prerequisite, current terms text and version, fee, latest payment |
| `POST /organizations/{org_id}/paid-sales/payout-profile` | Create a simulated, immediately verified payout profile for the organization. No bank details are collected |
| `POST /organizations/{org_id}/paid-sales/identity-verification` | Create a simulated, immediately approved identity record for the organization |
| `POST /events/{event_id}/paid-sales/terms` | Body `{"terms_version": "..."}`; must equal the version in the checklist, otherwise `422 terms_version_outdated` |
| `POST /events/{event_id}/paid-sales/activation` | Start (or retry) paying the activation fee. Accepts `Idempotency-Key` |
| `POST /simulator/payments/{attempt_id}/events` | Demo/test only: act as the payment provider for your own payment |

`missing` can contain `paid_ticket_type`, `payout_profile`, `identity_verification`, `terms` and
`activation_fee`. Starting activation while anything but the fee is missing returns
`409 activation_incomplete` with the same list, and no payment is created: a paid ticket type
alone, or a fee alone, never activates sales.

## States

`incomplete -> pending -> active / failed`, `failed -> pending` on retry, `active <-> suspended`.

- Activation is stored per event (`sales_activation.event_id` is unique). Activating one event
  never activates another, and duplicating an event never copies it.
- Payout and identity records belong to the organization and are reused by its events; terms are
  accepted per event and per version.
- The fee (KZT 5,000 = `500000` minor units) is a proposed demonstration default, saved on the
  activation row so later changes never rewrite history.
- While a payment attempt is open, starting activation again returns it instead of charging twice.

## Payment flow

```text
POST .../paid-sales/activation   -> payment_intent + payment_attempt(created) + outbox job, one commit
worker                           -> initializes the attempt with the simulator (status pending)
POST /simulator/payments/{id}/events {"outcome": "succeeded"}
                                 -> stored once in provider_event, then applied under the event lock
```

Simulator body: `{"outcome": "pending" | "succeeded" | "failed", "external_event_id"?: "...",
"amount_minor"?: n}`. Reusing an `external_event_id` with the same body is a harmless duplicate;
with a different body it returns `409 provider_event_conflict`. A failure never downgrades a
payment that already succeeded. A success with a wrong amount is recorded but never activates.
A success for an activation that is already active is recorded as an extra charge; the refund
obligation for such charges comes with B3.

The simulator answers `404` unless `ENVIRONMENT` is `development` or `test`, and only for the
account that started the payment.

## Effect on checkout

Holds for a paid ticket type return `409 paid_sales_inactive` until the event's activation is
`active` (including while suspended), then `409 paid_checkout_unavailable` until paid orders
(B3) land. Free ticket types keep working regardless of paid-sales state.

## Suspension

`activation_service.suspend(db, event_id, reason)` and `reinstate(db, event_id)` exist for the
platform-admin module. There is deliberately no public endpoint until that module is integrated;
reinstatement rechecks every prerequisite and the successful fee payment.

## Tables (`0011_paid_activation`)

| Table | Purpose |
|---|---|
| `payout_profile`, `verification_record` | Simulated organization checks |
| `terms_acceptance` | Who accepted which terms version for which event, with the text hash |
| `sales_activation` | One per event: status, saved fee, chosen paid attempt, suspension reason |
| `payment_intent` | What is being paid for (activation now, ticket orders in B3) and the expected amount |
| `payment_attempt` | Each try with the provider, its status and captured amount |
| `provider_event` | Deduplicated inbox of provider notifications |
