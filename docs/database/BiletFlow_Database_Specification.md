# BiletFlow database specification

Design baseline | PostgreSQL | 22 September 2026

Read with [the editable draw.io atlas](BiletFlow_Database.drawio), [reference DDL](BiletFlow_PostgreSQL_Schema.sql), and [backend requirements](../BiletFlow_Backend_Requirements.md).

The atlas has **54 pages**, **66 tables**, **129 foreign keys**, **28 global integrity rules**, and **26 transaction contracts**. It includes all columns, row checks, keys, relationships and operation effects. This is schema design, not a deployed application.

## Implementation update — 24 September 2026

The original atlas/reference DDL below remains the full-product design baseline. The implemented authentication slice is documented in [backend/README.md](../../backend/README.md); its authoritative migration is [0001_identity.sql](../../backend/migrations/versions/0001_identity.sql). That first migration deploys nine identity/supporting tables. The additive [0002_event_setup.sql](../../backend/migrations/versions/0002_event_setup.sql) adds 18 organization, permission, invitation, catalogue, seating and inventory-configuration tables, bringing the running schema to 27 tables, not all 66 design tables. See [the implemented API contract](../../backend/CATALOG_API.md) for the exact list and supported transactions.

User-confirmed changes: Google authentication and signed short-lived access JWTs with **hashed refresh tokens stored separately in sessions**. The implementation makes `app_user.password_hash` nullable for Google-only users; adds `external_identity`, `refresh_token`, `oauth_attempt`, and `auth_rate_bucket`; and implements TX-01 plus the authentication-email subset of TX-22. OAuth identities are keyed by provider/subject and link only through an authenticated flow. Refresh history enables replay revocation. A suspension trigger revokes sessions.

`0002_event_setup` removes the identity migration's temporary `auth_only_*_scope` CHECKs and adds the original organization/event FKs to `audit_log` and `outbox_job`. It also adds nullable `revoked_at` to `member_permission` and `staff_permission` so grants can be revoked without deleting their rows. Workspace/event mutexes protect membership, invitation, assignment, event and capacity changes. Existing identity rows are preserved. The implemented scope covers TX-02 and configuration/publication/duplication portions of TX-03/04/24; event media, event-change notifications, live broadcasts and moderation are still pending. `checkout_hold` and `inventory_allocation` support capacity guards but do not imply implemented TX-05 checkout services. Cancellation refuses sold/quarantined inventory until the full commerce/refund transaction is implemented. The reference DDL and generator do not overwrite application migrations. Use migrations for the running backend; do not execute the full reference schema over an existing identity database.

## 1. Interpretation and design choices

Confirmed user requirements retain priority. The following choices make the physical design precise; they do not turn proposed product defaults into confirmed decisions.

### D01 — One event per order

Prevents mixed-event policies, activation and refund ambiguity. A basket spanning events is separate orders.

**Status:** Design choice consistent with requirements.

### D02 — One admission unit per order_item

No quantity column: three tickets produce three order_item rows, each with one allocation and at most one ticket. UI can aggregate display lines.

**Status:** Design choice; simplifies seat/recipient integrity.

### D03 — Immutable allocated identity

event_id, ticket_type_id, allocation_id, order_item_id and purchased snapshots are never repointed after reservation/fulfillment. Refund/rebuy creates new rows.

**Status:** Required historical integrity.

### D04 — Minor-unit money

Store bigint in 1/100 KZT units: KZT 5,000 = 500000. Rates are basis points. No float; integer rounding with documented remainder distribution.

**Status:** Concrete representation of confirmed exact KZT requirement.

### D05 — Nullable identity until claim

Recipient email/name is saved per unit; ticket.recipient_user_id remains NULL until that email is verified by claimant. Purchase does not require every recipient account to exist yet; admission does.

**Status:** Proposed recipient/sign-in mechanism retained from requirements.

### D06 — One event row as concurrency mutex

Every inventory, campaign, fulfillment, admission, refund, payout or event-gate mutation locks the same event row first within the business lock hierarchy. This deliberately favors correctness and simplicity for the academic deployment.

**Status:** Design choice; benchmark before finer-grained optimization.

### D07 — State is not a mutable relationship

Lifecycle transitions change status/timestamp fields; historical FKs remain stable. Released allocation no longer blocks the seat but remains linked to old order/ticket.

**Status:** Confirmed refund/history rule.

### D08 — DDL versus transaction contracts

DDL enforces row checks, FK scope, unique/partial keys and append-only history. Aggregate totals, state transitions, authorization and atomic multi-table writes require the named TX contracts; SQL file does not implement those services.

**Status:** Explicit enforcement boundary.

### D09 — No hard-delete cascade

All FKs use RESTRICT on delete/update. Disable/revoke/cancel rather than deleting business records. Retention purge is an explicit privileged child-first operation outside normal API.

**Status:** Design choice for academic retention.

### D10 — Offline results are provisional

The DB stores uploaded intents separately from accepted check-ins. Reconnect revalidates current session, membership, ticket and event state; expired proof is rejected and must be renewed.

**Status:** Requirements baseline; no offline global guarantee.

### D11 — No redundant calendar or analytics truth tables

ICS reads event.calendar_uid/sequence and event data; basic analytics are views over orders/items/redemptions/check-ins/refunds. GA4 cache is explicitly disposable.

**Status:** Avoids inconsistent duplicated state.

### D12 — Support participant access is relational

Requester plus currently authorized event support staff, or platform admins for organizer/escalated cases; assigned_to does not itself grant access. No unconstrained participant JSON.

**Status:** Concrete permission model.

### D13 — Typed FK relationships, limited JSON

JSON only stores versioned snapshots, safe integration payloads, optional cache and outbox parameters. All core business relationships are typed FKs. Historical audit target and untrusted offline IDs are deliberate exceptions.

**Status:** Schema design choice.

### D14 — Finance entries and payout adjustment

Record signed append-only effects. Refund after a sent demo payout appends refund/fee-reversal entries, leaving the payout record untouched and allowing a negative balance. No separate duplicated adjustment table needed.

**Status:** Implements retained payout history.

### D15 — Schema artifact status

Reference physical schema for PostgreSQL, not application migrations already deployed. Proposed timing/fee/offline defaults remain proposals; this design does not silently approve them.

**Status:** Scope of this deliverable.

## 2. Navigation and UML notation

The draw.io file uses editable UML-style table/class compartments. Exact SQL names are stable across diagram, DDL and this specification. PK/FK/UQ and NN/? annotate keys and nullability. Outbound foreign keys list full local-to-target mappings and multiplicities; references across pages are named explicitly to keep the atlas readable. The core-relation page is an overview, not a replacement for the complete FK catalogue.

Association multiplicity is database cardinality: a mandatory FK gives exactly one parent per child; a nullable FK gives zero or one. Parent-side cardinality is zero-to-many unless a unique FK/subset gives zero-or-one. Requirements such as at least one order item or paid type before activation are transaction guards, not implied by a bare FK.

No cascade/composition semantics: all foreign keys use `ON DELETE RESTRICT ON UPDATE RESTRICT`. UUID primary keys are immutable. Releasing a seat is a state update to its allocation, never deletion/reassignment of the old purchase.

| Page | Name |
|---|---|
| 1 | 00 Start here |
| 2 | 01 Identity |
| 3 | 02 Organizations |
| 4 | 03 Events |
| 5 | 04 Venues |
| 6 | 05 Inventory |
| 7 | 06 Orders |
| 8 | 07 Payments |
| 9 | 08 Activation |
| 10 | 09 Campaigns |
| 11 | 10 Tickets |
| 12 | 11 Admission |
| 13 | 12 Refunds and finance |
| 14 | 13 Offline synchronization |
| 15 | 14 Files and support |
| 16 | 15 Delivery and audit |
| 17 | 16 Administration and analytics |
| 18 | 17 Core relationships |
| 19 | Relations 01 |
| 20 | Relations 02 |
| 21 | Relations 03 |
| 22 | Relations 04 |
| 23 | Relations 05 |
| 24 | Relations 06 |
| 25 | Relations 07 |
| 26 | Relations 08 |
| 27 | Relations 09 |
| 28 | Relations 10 |
| 29 | Relations 11 |
| 30 | Relations 12 |
| 31 | Relations 13 |
| 32 | Relations 14 |
| 33 | Relations 15 |
| 34 | Relations 16 |
| 35 | Rules 01-06 |
| 36 | Rules 07-12 |
| 37 | Rules 13-18 |
| 38 | Rules 19-24 |
| 39 | Rules 25-28 |
| 40 | Checkout activity |
| 41 | Refund activity |
| 42 | Admission activity |
| 43 | Offline activity |
| 44 | Outbox activity |
| 45 | Operations 01-04 |
| 46 | Operations 05-08 |
| 47 | Operations 09-12 |
| 48 | Operations 13-16 |
| 49 | Operations 17-20 |
| 50 | Operations 21-24 |
| 51 | Operations 25-26 |
| 52 | States 01-04 |
| 53 | States 05-08 |
| 54 | States 09-10 |

## 3. Enforcement boundary

**Enforced by DDL:** types, NOT NULL, primary/unique keys, named row CHECKs, scoped foreign keys, conditional unique indexes and append-only triggers. Foreign keys are added after tables because payment intent/activation/attempt/order references form a creation-time cycle. Insert targets in pending/incomplete state with optional success reference NULL; set the reference only after the attempt exists.

**Required in transactional service code:** authentication/authorization, legal state transitions, full-order amount and aggregate capacity/promo limits, verifying indirect ownership/intent relationships, immutable purchase snapshots, event gates, provider authenticity, and atomic audit/outbox changes. The reference SQL intentionally does not claim these are enforced by CHECK constraints: PostgreSQL CHECKs cannot safely express changing cross-row business state.

**Application role contract:** create schema with a migration owner. Runtime API/worker roles must not own schema/tables or have ALTER/TRIGGER/TRUNCATE privileges. Grant only needed SELECT/INSERT/UPDATE operations; revoke DELETE on domain/history tables. Clients never connect directly to PostgreSQL. This baseline does not install row-level-security policies: scoped access lives in audited service queries, and must be tested. If direct SQL writers are introduced, move TX invariants into controlled stored functions/triggers and restrict direct DML.

**SQL NULL semantics:** every optional scalar/composite relation has explicit documented nullability. MATCH SIMPLE skips a composite FK if any component is NULL; additional context CHECKs prevent missing required context. Cross-row rules still belong to the TX layer. An expired hold/claim remains active for index purposes until explicitly closed; no partial index depends on wall-clock time.

## 4. Transaction isolation and lock protocol

Use READ COMMITTED with explicit locks for all specified writes. The simple academic design serializes event business mutations on `SELECT ... FROM event WHERE id = :event_id FOR UPDATE`. Every writer affecting capacity, price/gates, promotion, order fulfillment, refund, admission, activation, finance or payout follows it, including background jobs and administrative changes. Event-scoped writes that bypass this protocol are invalid implementations.

Lock hierarchy: request-idempotency guard first; relevant users and sessions; organization and memberships; event; ticket types; campaigns; hold; order; allocations; payment intent/attempt; refund; tickets; entry confirmations; check-ins; case/job-specific records. Acquire each class of IDs in sorted order. When a TX description lists several locks, this hierarchy governs acquisition order, not the prose order. A worker needing only an event lock must not later acquire an earlier authorization lock; resolve required authorization context first.

For request idempotency, take a transaction-scoped advisory lock derived from (actor_user_id, operation, request_key) before domain locks. Then check an existing idempotency_record and compare request_hash. If absent, execute the business action and insert the successful resource/response record in the same commit. The table stores completed outcomes; it is not a prematurely inserted pending placeholder. A hash collision merely serializes unrelated requests, not their business identities.

All event writes lock the event before any campaign/hold/order lock. Capacity/promotion counts are read AFTER acquiring this mutex; expired rows are closed within the protocol. Never hold database locks across a provider, email, storage, PDF or analytics network call. Keep parent/child row updates and audit/outbox inserts in one short atomic transaction.

Use bounded retries for deadlock/serialization failures; rerun the whole transaction with the same idempotency key and revalidated request. For callbacks, persist a deduplicated verified inbox then process domain writes and inbox processed marker atomically. Payout/refund unknown outcomes must be reconciled, not treated as authorization for a second external operation.

The event mutex intentionally limits per-event write throughput. Test it against the documented academic workload; optimize only after measuring, preserving the same invariants.

## 5. Global constraints and enforcement matrix

| ID | Invariant | Enforcement | References |
|---|---|---|
| C01 PK identity | Every table uses immutable UUID id and server created_at. | DDL | All tables |
| C02 Requiredness and bounded values | Non-null columns, state sets, positive amounts, date ordering and arithmetic are CHECK/NOT NULL constraints listed per table. | DDL | Data dictionary / schema.sql |
| C03 Same-event and same-organization references | Composite FKs prevent ticket/type/seat/hold/order/staff/payout context mismatches. Optional-FK NULLs use MATCH SIMPLE; guards require context where needed. | DDL + TX for indirect paths | 129 FKs; TX-02/03/07/18 |
| C04 No double-selling a seat | One allocation in held/sold/refund_quarantine per non-null event_seat_id, including expired-but-not-yet-closed holds. | DDL partial unique + TX | uq_live_seat; TX-05/06/08/14 |
| C05 General admission/event capacity | Count active allocation states after event mutex. Live held rows count until explicit release; sold and refund_quarantine count. Validate type and event capacity before insert/edit. | TX | TX-03/05/06/08/14 |
| C06 Assigned-seat requirement | Assigned mode requires allocation.event_seat_id; general mode forbids it. Seat is unblocked, mapped to selected type and event. Count configured unblocked seats consistently with event capacity/type limits. | TX + composite FK | TX-03/05 |
| C07 One purchase per hold/allocation | UNIQUE(ticket_order.hold_id), UNIQUE(order_item.allocation_id); item composite FKs enforce same hold/event/type. | DDL | ticket_order/order_item |
| C08 One ticket per admission unit | UNIQUE(ticket.order_item_id). TX must issue all and only the fulfilled order's items; pending/failed orders have no ticket. | DDL upper bound + TX exact count | TX-08 |
| C09 Single fulfillment, preserve extra charges | Unique fulfillment attempt reference, immutable confirmed_at and guarded pending->confirmed transition. Multiple successful payment attempts permitted; extras compensated. | DDL + TX | TX-08/09 |
| C10 Authoritative payment matching | Selected fulfillment/activation payment must belong to that exact target's intent; status succeeded and amount/currency/environment match. Same-event FK alone is insufficient. | TX | TX-08/09/16 |
| C11 One full refund per charge | UNIQUE(refund.payment_attempt_id); amount equals actual successful charge. Failures retry the same obligation; unknown outcome reconciles. | DDL + TX | TX-13/14 |
| C12 Refund sequencing | Invalidate/quarantine and commit before external request. Only authoritative success releases; compensation for another attempt does not invalidate legitimate order tickets. | TX | TX-13/14 |
| C13 Campaign lifetime allowance | Under event+campaign lock: redemption count + active reservation count < max before new allowance; refund leaves redemptions intact. One active reservation per hold and one redemption per order. | DDL + TX | uq_active_promo_hold; TX-05/08/17 |
| C14 Correct discount/fee arithmetic | Unit sums equal saved order totals; integer rounding and remainder allocation exact. Percent eligible lines only; fixed discount once per order; no stacking. | DDL row arithmetic + TX aggregate | TX-07/08 |
| C15 Current admission uniqueness | Partial UNIQUE(ticket_id) WHERE reversed_at IS NULL; unique consumed entry confirmation and device operation key. | DDL | uq_current_admission |
| C16 Admission correctness | Verified claimed attendee, current attendee/scanner sessions, same-event permission, gate/time checks and valid state required. Check-in + token consumption + ticket state + audit are one commit. | TX + composite FK | TX-10/11 |
| C17 Reversal preserves evidence | Unique reversal per check_in; reversal row and reversed_at update atomically. Do not restore already invalid ticket or reuse consumed proof. | DDL + TX | TX-12 |
| C18 Offline separation | Client IDs intentionally untrusted; validate to resolved FK IDs. Current-state reconciliation can reject stale operations; provisional records never inflate authoritative attendance. | DDL + TX | TX-20 |
| C19 Scoped authorization | Owner/member/capability and resource relationships checked on every read/write/download/subscribe. Composite FKs do not replace access control. No unrestricted browser/mobile DB access. | APP + TX | All operations; access matrix |
| C20 Historical snapshot immutability | Post-quote price/recipient/seat snapshots and historical FKs do not change; creating new order after expiry/rebuy is required. Audit/messages/ledger/redemption/terms changes are rejected by append-only triggers. | DDL trigger for append-only; TX for snapshot guards | TX-07/08/14/24 |
| C21 Payout solvency | After event mutex, subtract pending payouts and every unresolved full refund liability from actual ledger balance. No sandbox/live transfer; successful debit keyed once. Later refund appends adjustment. | TX + unique ledger sources | TX-21 |
| C22 Durable side effects | Audit/outbox insert in business transaction; remote calls after commit. Leased workers fence acknowledgements; domain idempotency remains after job retries. | DDL key/row checks + TX | TX-22 |
| C23 Delete/retention safety | All FK deletes/updates RESTRICT. No normal hard-delete domain API. Append-only tables reject UPDATE/DELETE; owner/migration role is outside ordinary application permissions. | DDL + APP | TX-26 |
| C24 Private context consistency | Private access is account grant/authorized role. If support includes order and ticket, ticket's item must belong to that order; GA4 connection must belong to event organization. | Composite FK + TX | TX-18/25 |
| C25 Files and sensitive data | Clean content before link/download; purpose/MIME/size verified. Encrypt sensitive payout/file/backup data, hash one-time secrets; secrets stay out of logs, audit, jobs and analytics. | DDL basic shape + APP/storage | TX-19/22 |
| C26 Time and derived state | UTC instants plus valid named zone; database clock decides expiry, no time-dependent index predicates. Upcoming/active/completed and seat availability are derived. | DDL ordering + TX | TX-03/05/25 |
| C27 Calendar identity and event copy | Event UID unique/stable, sequence increases on material changes. Duplicate creates new UID/IDs and whitelisted configuration only. | DDL uniqueness + TX | TX-04/15/24 |
| C28 Metrics do not multiply money | Aggregate each grain before joins: order/item, successful payment, successful refund, current admission. Optional GA4 cache never overwrites canonical amounts. | QUERY contract | TX-25 |

## 6. Operations and database effects

Each contract covers its reads/guards, lock boundary, INSERT/UPDATE effects, relationship preservation and retry behavior. Deletions are deliberately absent from normal business flows.

### TX-01 — Register, verify, sign in, reset and revoke

**Preconditions:** Normalized unique email; verified active identity required for purchase. Rate limit outside DB; reset/verification token must be unconsumed and unexpired.

**Locks:** Lock user then affected sessions/account_token rows in sorted ID order.

**Atomic writes / external boundary:** INSERT app_user/account_token/auth_session; consume token conditionally; update verification/password hash; revoke old sessions on reset/logout/suspension; INSERT audit and outbox notification intents.

**Relationship effects:** All session/token rows retain user_id. Replacement tokens are new rows/digests; do not change token purpose.

**Failure / retry:** Unique email resolves registration race. Reused/expired token rolls back. Never email raw secrets via persistent plaintext outbox: generate a signed-purpose link from stored challenge ID/key at dispatch or protect a one-time secret with encryption.

### TX-02 — Organizer creation, staff invite/accept, grants/revocation

**Preconditions:** Owner or explicit manage_staff permission; invite email matches verified account. Scanner is an organization member with event-limited capabilities.

**Locks:** Lock involved users/sessions, organization, member, then event when assigning/revoking event capabilities.

**Atomic writes / external boundary:** INSERT organization, organization_member, staff_invitation, event_staff and permission joins; mark invitation accepted/revoked; revoke membership/assignment and publish access-change event.

**Relationship effects:** Composite event_staff FKs force event and member into the same organization. owner_user_id changes only in explicit ownership-transfer transaction to an active same-org member.

**Failure / retry:** Never remove the owner through membership revoke. Invitation replay is no-op/error; unauthorized changes roll back. Revoke WebSocket subscriptions and device packages after commit.

### TX-03 — Create/configure event, layout, ticket types and capacity

**Preconditions:** Authorized event editor. Layout belongs to venue; seat modes cannot change after active allocations. Validate named timezone, seat coordinates and sales/admission/refund windows.

**Locks:** Lock organization/event, relevant ticket_types and event_seats; serialize with holds and refunds.

**Atomic writes / external boundary:** INSERT/UPDATE event, event_seat, ticket_type, event_media; snapshot seat labels on event copy. Reject capacity/type-limit reduction below all held/sold/quarantine allocations. Increment event availability_version when relevant; INSERT audit.

**Relationship effects:** Template layout graph is venue > layout > section > row > seat. event_seat points to same layout and same-event type; booked identities cannot be repointed.

**Failure / retry:** Reject blocking/retargeting an allocated seat. Layout/capacity changes that make counts inconsistent roll back completely. Unallocated drafts may be edited; old paid snapshots never change.

### TX-04 — Publish, unpublish, update or suspend event

**Preconditions:** Publication needs complete event, usable tickets, valid times; platform-only moderation. Paid activation remains an independent gate.

**Locks:** Lock organization/event; read relevant types/activation under same event mutex.

**Atomic writes / external boundary:** UPDATE publication/moderation/time fields; increment calendar_sequence for calendar changes and availability_version for gate changes; INSERT audit and notification/broadcast jobs.

**Relationship effects:** Existing orders/tickets remain linked. Unpublish stops new sales without automatically invalidating issued admission; suspension blocks new admission/fulfillment.

**Failure / retry:** No refund implied by suspension/unpublish. New updates cannot erase allocations. Pending successful charges blocked from fulfillment route to compensation.

### TX-05 — Create/replace inventory hold and campaign allowance

**Preconditions:** Verified signed-in buyer, permitted visible event, active registration/type windows and limits; activated if any originally paid type. Check requested seats/type quantities and promo rules.

**Locks:** Lock authorization rows, organization/event; types/campaigns sorted; hold/allocations. Capacity queries run only after event lock.

**Atomic writes / external boundary:** INSERT checkout_hold and one inventory_allocation per unit (held). If promo: INSERT promo_reservation after counting lifetime redemptions + active reservation rows. Persist server quote in ticket_order/order_item when checkout accepted. Increment availability_version and audit/outbox.

**Relationship effects:** Each allocation references one hold/type/event; seat nullable only in general mode. Partial unique live-seat index blocks another held/sold/quarantine row. One active promo reservation per hold.

**Failure / retry:** All-or-nothing basket. On conflict return availability error, no partial seats. Expired active rows must first be closed under the same lock before their capacity can be reused. Never use now() in partial-index predicates.

### TX-06 — Expire, abandon or release a hold

**Preconditions:** Server expiry or authenticated hold owner; not a consumed hold.

**Locks:** Lock event then hold, campaign and allocations under the common sorted hierarchy; recheck state/expiry.

**Atomic writes / external boundary:** UPDATE hold to expired/released with closed_at; held allocations -> released with reason/time; active promo reservation -> released; bump availability_version; audit/outbox.

**Relationship effects:** Rows are retained. Order may become expired/cancelled; no issued ticket is created. If a charge later arrives, process TX-09 compensation.

**Failure / retry:** If fulfillment already consumed hold, expiry is a no-op. A delayed worker never releases sold/quarantine allocations. Job retries are idempotent.

### TX-07 — Quote, create order and initialize payment

**Preconditions:** Buyer owns live hold; no other order for it. Validate recipient data, quote lifetime, integer prices/discount/fee allocation and current access/activation.

**Locks:** Lock event, types/campaign, hold, ticket_order; idempotency guard precedes domain locks.

**Atomic writes / external boundary:** INSERT ticket_order and one order_item per allocation with immutable price/recipient/seat/policy snapshots. For positive total INSERT payment_intent + payment_attempt + outbox initialization job; zero-total calls TX-08 directly.

**Relationship effects:** Unique hold_id prevents two orders for one hold. Composite item FK binds allocation to the same hold/type/event. Payment intent has exactly one target (order XOR activation).

**Failure / retry:** Changed request under same idempotency key fails. Retry returns existing result after reauthorization. Never call provider while holding DB locks; a persisted attempt reconciles a lost initialization response.

### TX-08 — Confirm free or correctly paid order and issue tickets

**Preconditions:** Hold still valid, gates active, inventory owned, promo still eligible, received amount/currency/environment correct; no prior fulfillment. Zero total needs no payment.

**Locks:** Lock event and involved campaign/hold/order/allocations/payment rows; all reads use current committed state after lock.

**Atomic writes / external boundary:** Paid path records successful attempt; UPDATE order confirmed with chosen fulfillment attempt/time; hold -> consumed; allocations held -> sold; promo reservation -> consumed and INSERT one promo_redemption; INSERT one ticket per item; INSERT finance entries, audit and delivery/analytics/broadcast jobs.

**Relationship effects:** ticket_order.fulfillment_payment_attempt_id chooses one charge; UNIQUE(order_item_id) gives exactly one canonical ticket per unit when transaction completes. Allocation and order relationships remain stable.

**Failure / retry:** Any guard failure issues no ticket. A real successful charge cannot be rolled back externally: record it and create compensation refund via TX-09. Transaction rollback retains no partial issuance.

### TX-09 — Verified payment inbox, late success and duplicate charge

**Preconditions:** Provider authentication verified before accepted inbox; expected target, amount, currency, merchant and environment checked. Browser return URL is not evidence.

**Locks:** Persist inbox with unique provider event key; processing transaction locks event then domain rows and marks inbox processed atomically.

**Atomic writes / external boundary:** INSERT provider_event; record authoritative attempt result. If fulfillment eligible run TX-08. Else retain extra/late success and INSERT refund+outbox compensation. Reconciliation queries provider outside transaction and feeds same handler.

**Relationship effects:** Do NOT add a unique successful payment per order: two external charges may truly succeed. Only chosen fulfillment FK is unique; each charged attempt may have one logical refund.

**Failure / retry:** Repeated event with different payload hash is rejected. Out-of-order failure never demotes succeeded payment. Wrong amount/currency never fulfills; escalate/reconcile/refund any captured money safely.

### TX-10 — Claim ticket and issue attendee entry confirmation

**Preconditions:** Active verified claimant email matches order item recipient; ticket unclaimed or already assigned to same account. Confirmation requires claimed valid ticket and current attendee session.

**Locks:** Lock user/session then organization/event, ticket/claim/entry confirmation.

**Atomic writes / external boundary:** Consume claim token once; SET ticket recipient_user_id/claimed_at without changing order buyer; INSERT short-lived entry_confirmation. Store only digest/key ID; publish no personal info in QR.

**Relationship effects:** Composite confirmation FK requires attendee_user_id equal ticket.recipient_user_id; session FK binds session to same user. Resending PDF preserves ticket identity.

**Failure / retry:** Wrong account/expired token rejected. A claimed ticket cannot be reassigned by ordinary flow. Replaced claim is explicitly revoked before inserting new active claim.

### TX-11 — Online check-in or manual admission

**Preconditions:** Both attendee and scanner authenticated; device owned; current same-event scan permission; event entrance gate open; token purpose correct; confirmation/session unexpired; ticket valid.

**Locks:** Lock involved users/sessions and organization membership first; then event, ticket, confirmation and check_in rows. Event lock serializes refunds and admission.

**Atomic writes / external boundary:** INSERT check_in; consume entry_confirmation; ticket valid -> checked_in; increment event availability_version; INSERT audit/broadcast outbox in same commit.

**Relationship effects:** One unreversed check_in per ticket through partial unique index. Device+operation ID unique. Entry confirmation may be consumed by only one check_in.

**Failure / retry:** Second scan sees already-used. Refund winning mutex makes scan fail; scan winning first makes voluntary refund require reversal/review. A duplicate operation returns original result, never a second admission.

### TX-12 — Authorized admission reversal

**Preconditions:** Explicit reverse_checkin permission; existing current accepted admission; reason required.

**Locks:** Lock auth/org/event then ticket/check_in.

**Atomic writes / external boundary:** INSERT check_in_reversal; set check_in.reversed_at to reversal timestamp; ticket checked_in -> valid unless already invalidated by authorized event cancellation; audit and publish count update.

**Relationship effects:** Original check_in stays; UNIQUE(check_in_id) allows one reversal. The old confirmation stays consumed; next entry requires fresh confirmation/new check_in.

**Failure / retry:** Do not restore refunded/cancelled validity. Repeating reversal is idempotent. No deletion of accepted check-in history.

### TX-13 — Approve full refund and quarantine inventory

**Preconditions:** Full actual charge only; voluntary policy cutoff saved on order; checked-in units must be reviewed/reversed; authorized actor. Compensation can have no tickets.

**Locks:** Lock authorization, organization/event, order, allocations, payment/refund and tickets under canonical hierarchy.

**Atomic writes / external boundary:** INSERT refund requested (unique payment_attempt_id); order -> refund_pending; tickets -> refund_pending invalid; sold allocations -> refund_quarantine; INSERT audit and refund outbox; COMMIT before provider call.

**Relationship effects:** All old links remain. Compensation refund on unfulfilled duplicate charge must NOT invalidate the legitimate tickets fulfilled by a different attempt.

**Failure / retry:** Reject amount mismatch/second logical refund. Pending/failed/unknown refund never releases stock. Once invalidated, do not silently restore old ticket on provider failure.

### TX-14 — Dispatch/reconcile refund, confirm success, then release stock

**Preconditions:** Provider result corresponds to same full-refund obligation/charge; request acceptance is not final success.

**Locks:** Worker leases outside business TX; finalization locks organization/event, order/allocation/payment/refund/ticket as applicable.

**Atomic writes / external boundary:** INSERT/UPDATE refund_attempt; uncertain -> reconcile, failed -> retain quarantine. Success: refund succeeded/time; chosen fulfillment order -> refunded; tickets -> refunded; quarantine allocations -> released/refund_succeeded; append finance entries/refund fee reversal; notifications/audit/outbox; availability_version++.

**Relationship effects:** Unique refund per charge and finance source-kind keys prevent duplicate financial/release effects. Replacement purchase uses NEW hold/allocation/order_item/ticket referencing the same event_seat.

**Failure / retry:** Timeout must not start a different logical refund. If callback replay after success, no additional release. Cancelled/closed/suspended event inventory remains unpurchasable despite allocation release.

### TX-15 — Cancel free registration or cancel event

**Preconditions:** Free-order owner policy/authorized staff, or organizer cancellation permission. Event cancellation overrides ordinary voluntary-refund eligibility.

**Locks:** Lock organization/event; operate orders/allocations/tickets in stable order. For large event, close event gate first then durable bounded per-order jobs.

**Atomic writes / external boundary:** Free order: tickets cancelled, sold allocations released/free_cancel, order cancelled, audit. Event: event cancelled, calendar_sequence/version++, audit and cancellation jobs; workers invalidate/cancel tickets and initiate paid refunds via TX-13.

**Relationship effects:** The event gate makes every ticket immediately ineffective even if per-ticket materialization is still queued. Historical FKs and accepted check-ins remain.

**Failure / retry:** Cancellation job retries must resume without duplicate refunds. Pending payments that later succeed compensate, never fulfill. Refund completion cannot republish cancelled event.

### TX-16 — Activate paid sales and suspend/reinstate activation

**Preconditions:** Same-event terms, same-org verified payout and approved identity; at least one paid type; exact activation fee success. Platform admin for suspension.

**Locks:** Lock organization/event, activation/intent/attempt and referenced checklist rows.

**Atomic writes / external boundary:** INSERT terms_acceptance, verification_record, payout_profile as needed; sales_activation incomplete->pending->active; choose one paid_attempt_id; append activation fee finance entry/audit. Suspension sets status/reason, never deletes payment.

**Relationship effects:** payment_intent targets activation exclusively; chosen paid attempt must refer to this activation intent (TX guard beyond same-event FK). Duplicated event starts without these relations.

**Failure / retry:** Incomplete checklist cannot activate. Duplicate external activation charge is retained and compensated; original legitimate activation remains intact. Simulated identity never presented as production KYC.

### TX-17 — Campaign create/edit/disable

**Preconditions:** Authorized event editor; fixed/percent rules, dates, limit, applicability valid. Lowered limit cannot undercut already consumed/reserved allowance.

**Locks:** Lock organization/event then campaign and affected reservations.

**Atomic writes / external boundary:** INSERT/UPDATE campaign, promo_code, eligibility joins; immutable redemptions untouched; audit and optional availability/quote update.

**Relationship effects:** Campaign/type/code/reservation composite keys keep same event. Redemptions remain after refund and continue counting toward lifetime max.

**Failure / retry:** Disabling while a checkout is pending blocks discounted fulfillment; never silently charge more. Old order discount snapshots and attribution are unchanged.

### TX-18 — Create support case, message, attach file, assign/resolve/escalate

**Preconditions:** Requester owns/accesses linked context; event/order/ticket context must be mutually consistent. Assigned user must have current support/admin permission.

**Locks:** Lock relevant auth/org/event if event-scoped; then case. For platform case lock requester organization/case.

**Atomic writes / external boundary:** INSERT case/message/attachment; INSERT case_change for status/assignment/escalation; reopen on requester reply; INSERT notification/broadcast outbox; assign persisted cursor order (created_at,id).

**Relationship effects:** Composite FKs align context event; TX checks ticket belongs linked order when both supplied. Participants are derived requester/current support staff/platform escalation, not untrusted client IDs.

**Failure / retry:** File must be clean and uploader/context authorized. Same client_message_id deduplicates; connection reconnect reads persisted messages. Revoked staff cannot subscribe/download even if formerly assigned.

### TX-19 — Store file, generate PDF/manifest and clean failed uploads

**Preconditions:** Purpose, content, type/size/count limits and storage owner checked; protected downloads always reauthorize linked business record.

**Locks:** Reserve stored_file row in short TX; upload/scan/render outside TX; lock metadata/business row to attach.

**Atomic writes / external boundary:** INSERT stored_file pending/quarantined; upload object with checksum; mark clean only after validation; INSERT event_media/support_attachment or update ticket.pdf_file_id/offline_package.file_id; cleanup orphan objects asynchronously.

**Relationship effects:** DB stores object_key, not blobs or public URL. Delete object only after references checked; mark metadata deleted instead of cascading business history.

**Failure / retry:** Remote file writes cannot be rolled back atomically with PostgreSQL; use pending state, idempotent object keys, reconciliation and orphan cleanup. Never expose quarantined content.

### TX-20 — Issue offline package and reconcile operation batch

**Preconditions:** Scanner session/current assignment valid; package unexpired and same device/event; attendee proof must still satisfy online rules at final acceptance.

**Locks:** Download under event snapshot read consistency. Reconcile each operation with auth/org/event locks, then ticket/confirmation/check-in; bounded batch, per-operation results.

**Atomic writes / external boundary:** INSERT offline_package/file; on upload INSERT offline_operation before resolution; valid check-in calls TX-11, reverse calls TX-12; update result and optionally INSERT sync_conflict; refresh snapshot.

**Relationship effects:** Untrusted claimed IDs deliberately have no FK so invalid scans can be recorded. resolved_ticket_id and accepted_check_in_id are real FKs. Unique device operation ID survives repeated package upload.

**Failure / retry:** Same key/different hash rejects. Revoked assignment, expired session/proof/package, cancelled/refunded ticket or duplicate admission -> rejection/conflict, no central admission. Device time never overwrites server order.

### TX-21 — Reserve/send/fail demo payout and apply later refund adjustment

**Preconditions:** Finance permission; payout environment simulation; same-org verified profile; amount <= ledger balance minus pending payout reservations and refund liabilities. Block unresolved charges.

**Locks:** Lock organization/event, then pending payout/refund/finance scope; all ledger writers also lock this event.

**Atomic writes / external boundary:** INSERT demo_payout pending/eligible reserves amount; successful simulation marks sent and INSERT negative finance_entry payout; failed releases reservation by state. Later refund INSERTs signed refund/fee-reversal entries, possibly negative balance.

**Relationship effects:** Payout profile scope enforced by composite FK. Unique request key and payout-kind ledger key prevent duplicate send/debit. Sent payout row remains unchanged.

**Failure / retry:** Retry returns same payout. Concurrent refund cannot bypass balance reservation. A post-payout refund never rewrites old payout as if it did not happen; balance adjustment is new finance history.

### TX-22 — Deliver notifications, broadcasts and jobs

**Preconditions:** Business transaction already committed. Reauthorize live-event delivery and protected links; delayed failure messages recheck current status.

**Locks:** Lease short batch of pending outbox rows with FOR UPDATE SKIP LOCKED; commit lease; external work outside transaction; ack with matching lease_token.

**Atomic writes / external boundary:** INSERT notification/delivery intents with unique business keys; update attempts/status; outbox pending->leased->done/dead; expired lease -> pending; optional reconnect clients query persisted domain records.

**Relationship effects:** At-least-once side effects; irreversible domain operations have their own unique keys. Outbox payload contains typed IDs/options, not authority.

**Failure / retry:** Crash before ack may resend; SMTP exactly-once not promised. Fencing prevents an expired worker overwriting a new lease. Dead jobs remain inspectable and manually replayable.

### TX-23 — Moderation and settings

**Preconditions:** Current platform-admin grant; whitelisted typed settings; explicit reason.

**Locks:** Lock target user/session or organization/event according to lock order; settings key updates serialized by advisory lock or SERIALIZABLE transaction.

**Atomic writes / external boundary:** INSERT moderation_action/platform_setting_version and audit; update target status; revoke sessions/packages; enqueue relevant notices. Settings latest effective version applies only to new quotes/checklists.

**Relationship effects:** Historical order/policy/fee snapshots unchanged. Moderation target is exactly one typed FK, not a generic target string.

**Failure / retry:** Suspension does not secretly cancel/refund. Reject settings below active capacity/security requirements. Reported event visibility/access validated on report insertion.

### TX-24 — Duplicate past event

**Preconditions:** Authorized access to source and target organization; explicit copy whitelist.

**Locks:** Read source consistently, lock target organization then create fresh event.

**Atomic writes / external boundary:** INSERT fresh draft event, media links to authorized files, ticket types and newly mapped event_seats. Fresh calendar UID, sequence 0, no activation. INSERT audit.

**Relationship effects:** No copies of holds, allocations, orders, tickets, payment/refund/payout rows, attendees, memberships/assignments, campaigns, support or check-ins. New seat/type IDs remapped to new event.

**Failure / retry:** Copy is all-or-nothing. Shared physical venue/layout may remain referenced; original event and transactions untouched.

### TX-25 — Read operational analytics, export GA4, and calendar

**Preconditions:** Event-scoped report permission; private event access for ICS; consent/allowlist for GA4.

**Locks:** Read-only MVCC snapshots for reports; no event FOR UPDATE for reads. Export job leases separately; short cache update.

**Atomic writes / external boundary:** Basic analytics SELECT authoritative data; optional INSERT analytics_export, UPSERT ga4_cache; calendar generated from stable UID/sequence without calendar account access.

**Relationship effects:** Money joins aggregate per order/attempt/refund before combining with items to avoid multiplication. Ticket counts use allocation/ticket validity, not cumulative historical tickets.

**Failure / retry:** GA4 outage cannot roll back orders. Missing cache is unavailable, not zero sales. Refund measurements use independent idempotency IDs and omit PII/ticket IDs; ICS cancellation reuses UID.

### TX-26 — Privileged retention, backup and restore

**Preconditions:** No ordinary destructive business API; retention policy separately approved. Backup includes PostgreSQL and object-storage consistency manifest.

**Locks:** Operational maintenance window or coordinated snapshot; retention deletes explicit child-first sets, never disable FK checks casually.

**Atomic writes / external boundary:** Normal flow revokes/archives/cancels. Maintenance may purge expired auth data and orphan objects under documented policy; retain protected audit/financial history. Restore schema, data, objects then verify checks.

**Relationship effects:** ON DELETE RESTRICT exposes dependencies; no cascade can wipe orders through deleting an event/user. UUIDs stable across recovery.

**Failure / retry:** Restore test must reconcile pending provider work before resending. Do not replay stale payout/refund jobs as new operations; preserve idempotency keys and provider inbox.

## 7. State transitions

| Entity | Allowed paths | Guards | Contracts |
|---|---|---|---|
| checkout_hold | active -> consumed /  expired /  released | Only active holds transition; closed_at set once. Consumed holds never expire. | TX-05/06/08 |
| inventory_allocation | held -> sold -> refund_quarantine -> released; held -> released; sold -> released for free cancellation | Released is terminal. Partial uniqueness releases seat only in released state. | TX-05/06/08/13/14/15 |
| ticket_order | pending -> confirmed /  failed /  expired /  cancelled; confirmed -> refund_pending -> refunded; confirmed -> cancelled for free registration | One fulfillment; failed refund attempt leaves order refund_pending. Late charge on expired order compensates without confirmation. | TX-07/08/09/13/14/15 |
| payment_attempt | created -> pending -> succeeded /  failed; created -> succeeded /  failed | Unknown remains pending; verified late contradictory success retained/reconciled. Succeeded never downgraded by stale failure. | TX-09 |
| ticket | valid <-> checked_in (authorized reversal); valid/checked_in -> refund_pending -> refunded; valid/checked_in -> cancelled on allowed cancellation | No return from refund_pending/refunded/cancelled to valid. Checked-in voluntary refund needs reversal/review. | TX-10/11/12/13/14/15 |
| refund | requested -> pending -> succeeded /  failed; failed -> pending; pending/failed -> succeeded on reconciled success | Same logical obligation/request identity; succeeded terminal. Stock stays quarantined until succeeded. | TX-13/14 |
| sales_activation | incomplete -> pending -> active /  failed; failed -> pending; active <-> suspended | Every prerequisite rechecked on activation/reinstatement. Historical activation fee retained. | TX-16 |
| support_case | open <-> in_progress <-> waiting_customer -> resolved; resolved -> open on requester reply | Only authorized current participants; every status/assignment transition produces case_change. | TX-18 |
| outbox_job | pending -> leased -> done /  pending /  dead; expired leased -> pending | Matching lease token required for ack; terminal jobs not silently replayed as new logical operations. | TX-22 |
| demo_payout | pending -> eligible -> sent; pending/eligible -> failed | Sent is historical terminal state. Adjustment is a new finance_entry, not state rewrite. | TX-21 |

Event publication: draft -> published <-> unpublished; any allowed noncancelled state -> cancelled. Cancelled is terminal. Moderation normal/suspended is independent. Upcoming/active/completed are derived from times, not persisted lifecycle enum values.

Campaign reservation: active -> consumed/released, no refund replenishment. Provider inbox: received -> processed/rejected. Notification delivery: pending -> sent/failed with bounded retries. Offline operation: received -> accepted/duplicate/rejected/conflict; conflicts are retained, not silently overwritten as accepted.

## 8. Access and retention specifications

| Data | Readers | Writers / boundaries |
|---|---|---|
| Public catalogue | Anonymous for published public events; unlisted by link; private grant/role | Authorized organizer editors; platform moderation |
| Account/session/challenges | Account owner and narrow auth services | Auth service; digest-only secrets; no enumeration or public session listing |
| Organization / staff | Owner and authorized workspace staff | Owner/manage_staff; no self-escalation; owner cannot be removed via ordinary revoke |
| Order/payment/refund | Buyer; authorized event finance staff; platform support where permitted | Transaction services; scanner never receives financial data |
| Ticket/entry proof | Assigned recipient, buyer delivery view, assigned scanner minimal view | Fulfillment/claim/admission services; no ticket reassignment marketplace |
| Support/message/file | Requester and current authorized support staff; platform on escalation/platform case | Context-checked support services; assignment alone grants nothing |
| Finance/payout profile | Owner/finance capability and authorized platform staff | Protected services; no real payout operation |
| Audit/history | Authorized event staff or platform admin with purpose | Append-only service inserts; no normal update/delete |
| Offline snapshot/queue | Assigned device/session only; conflict reviewers | Scanner upload and central reconciliation; no raw snapshot access for attendees |
| Analytics | Authorized organization/event reports | Read-only aggregates; optional allowlisted export/cache worker |

Keep academic operational and audit history through the project lifecycle. Disable/cancel/revoke instead of hard delete. Retention periods for expired auth/session material and abandoned uploads must be configured separately; do not set an invented permanent legal retention promise. Encrypt protected storage/backups and payout metadata. A schema alone cannot provide infrastructure encryption or provider compliance.

## 9. Complete physical data dictionary

Every table has immutable UUID `id` and server `created_at`. Defaults in the SQL are exact; `updated_at` where present is set by the application in the same transaction. Required fields with no default must be supplied. Generated files share the same model, so diagram/DDL/dictionary names agree.

### `app_user` — 01 Identity

Verified account; roles are scoped memberships, not one global role.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `email` | `text` | No | `—` | Normalized email; unique. |
| `password_hash` | `text` | No | `—` | Adaptive salted password hash; never plaintext. |
| `display_name` | `text` | No | `—` | Account display name. |
| `locale` | `text` | No | `'ru'` | kk, ru or en. |
| `status` | `text` | No | `'active'` | active or suspended. |
| `email_verified_at` | `timestamptz` | Yes | `—` | Required before ticket acquisition/admission. |
| `analytics_consent` | `boolean` | No | `false` | Optional traffic collection preference. |
| `consent_recorded_at` | `timestamptz` | Yes | `—` | When preference was last recorded. |
| `updated_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Set by application on every update. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `app_user_uq1`: UNIQUE (email).
- `app_user_ck1`: `email = lower(btrim(email)) AND position('@' in email) > 1`.
- `app_user_ck2`: `locale IN ('kk','ru','en')`.
- `app_user_ck3`: `status IN ('active','suspended')`.

### `auth_session` — 01 Identity

Revocable web or scanner session with rotated refresh-token digest.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `user_id` | `uuid` | No | `—` | Account owner. |
| `refresh_token_hash` | `text` | No | `—` | Only digest stored; rotate on refresh. |
| `client_kind` | `text` | No | `—` | web or scanner. |
| `expires_at` | `timestamptz` | No | `—` | Absolute authorization expiry. |
| `revoked_at` | `timestamptz` | Yes | `—` | Set on logout/reset/suspension. |
| `last_seen_at` | `timestamptz` | Yes | `—` | Operational metadata. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `auth_session_uq1`: UNIQUE (refresh_token_hash).
- `auth_session_uq2`: UNIQUE (id, user_id).
- `auth_session_ck1`: `client_kind IN ('web','scanner')`.
- `auth_session_ck2`: `expires_at > created_at`.
- `fk_auth_session_001`: (user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `account_token` — 01 Identity

One-use email-verification or password-reset challenge.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `user_id` | `uuid` | No | `—` | Account being verified/reset. |
| `purpose` | `text` | No | `—` | email_verify or password_reset. |
| `token_hash` | `text` | No | `—` | Digest only; never return this stored digest as a token. |
| `expires_at` | `timestamptz` | No | `—` | Expiry. |
| `consumed_at` | `timestamptz` | Yes | `—` | Consumption under row lock. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `account_token_uq1`: UNIQUE (token_hash).
- `account_token_ck1`: `purpose IN ('email_verify','password_reset')`.
- `account_token_ck2`: `expires_at > created_at`.
- `fk_account_token_077`: (user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `platform_admin` — 01 Identity

Explicit audited internal-staff grant; unrelated to organization membership.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `user_id` | `uuid` | No | `—` | Granted account. |
| `granted_by_user_id` | `uuid` | Yes | `—` | NULL only for audited bootstrap. |
| `revoked_at` | `timestamptz` | Yes | `—` | Revoke instead of deleting. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `platform_admin_uq1`: UNIQUE (user_id).
- `fk_platform_admin_078`: (user_id) -> `app_user` (id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_platform_admin_079`: (granted_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `organization` — 02 Organizations

Organizer workspace; one owner remains even if other memberships are revoked.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `owner_user_id` | `uuid` | No | `—` | Current owner; transfer only in authorized transaction. |
| `name` | `text` | No | `—` | Organizer name. |
| `contact_email` | `text` | No | `—` | Business contact. |
| `contact_phone` | `text` | Yes | `—` | Optional business contact. |
| `status` | `text` | No | `'active'` | active or suspended. |
| `updated_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Last change. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `organization_ck1`: `status IN ('active','suspended')`.
- `fk_organization_080`: (owner_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `organization_member` — 02 Organizations

Workspace membership, including scanner-only members.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `organization_id` | `uuid` | No | `—` | Workspace. |
| `user_id` | `uuid` | No | `—` | Member. |
| `status` | `text` | No | `'active'` | active or revoked. |
| `revoked_at` | `timestamptz` | Yes | `—` | Retained for attribution. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `organization_member_uq1`: UNIQUE (organization_id, user_id).
- `organization_member_uq2`: UNIQUE (id, organization_id).
- `organization_member_ck1`: `status IN ('active','revoked')`.
- `organization_member_ck2`: `(status = 'revoked') = (revoked_at IS NOT NULL)`.
- `fk_organization_member_002`: (organization_id) -> `organization` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_organization_member_081`: (user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `member_permission` — 02 Organizations

Organization-level capability, excluding implicit ownership.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `member_id` | `uuid` | No | `—` | Organization membership. |
| `capability` | `text` | No | `—` | manage_profile, manage_staff or finance. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `member_permission_uq1`: UNIQUE (member_id, capability).
- `member_permission_ck1`: `capability IN ('manage_profile','manage_staff','finance')`.
- `fk_member_permission_005`: (member_id) -> `organization_member` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `staff_invitation` — 02 Organizations

Expiring workspace invitation; owner configures final event permissions on acceptance.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `organization_id` | `uuid` | No | `—` | Inviting workspace. |
| `email` | `text` | No | `—` | Normalized intended recipient. |
| `invited_by_user_id` | `uuid` | No | `—` | Inviter. |
| `token_hash` | `text` | No | `—` | Opaque invite-token digest. |
| `expires_at` | `timestamptz` | No | `—` | Expiry. |
| `accepted_by_user_id` | `uuid` | Yes | `—` | Account matching verified invited email. |
| `accepted_at` | `timestamptz` | Yes | `—` | Acceptance timestamp. |
| `revoked_at` | `timestamptz` | Yes | `—` | Revoke without deletion. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `staff_invitation_uq1`: UNIQUE (token_hash).
- `staff_invitation_ck1`: `email = lower(btrim(email))`.
- `staff_invitation_ck2`: `expires_at > created_at`.
- `staff_invitation_ck3`: `(accepted_at IS NULL) = (accepted_by_user_id IS NULL)`.
- `fk_staff_invitation_082`: (organization_id) -> `organization` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_staff_invitation_083`: (invited_by_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_staff_invitation_084`: (accepted_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `event_staff` — 02 Organizations

Event assignment constrained to membership in the event's organization.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Assigned event. |
| `organization_id` | `uuid` | No | `—` | Scope discriminator, checked by composite FKs. |
| `member_id` | `uuid` | No | `—` | Member in same organization. |
| `revoked_at` | `timestamptz` | Yes | `—` | Online authorization stops immediately. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `event_staff_uq1`: UNIQUE (event_id, member_id).
- `event_staff_uq2`: UNIQUE (id, event_id).
- `fk_event_staff_003`: (event_id, organization_id) -> `event` (id, organization_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_staff_004`: (member_id, organization_id) -> `organization_member` (id, organization_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `staff_permission` — 02 Organizations

Event-level permission set; multiple capabilities per assignment.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_staff_id` | `uuid` | No | `—` | Assigned staff. |
| `capability` | `text` | No | `—` | event_edit, attendees, support, reports, refund, scan, reverse_checkin, staff. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `staff_permission_uq1`: UNIQUE (event_staff_id, capability).
- `staff_permission_ck1`: `capability IN ('event_edit','attendees','support','reports','refund','scan','reverse_checkin','staff')`.
- `fk_staff_permission_006`: (event_staff_id) -> `event_staff` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `category` — 03 Events

Seeded category with three interface labels.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `code` | `text` | No | `—` | Stable category code. |
| `name_kk` | `text` | No | `—` | Kazakh label. |
| `name_ru` | `text` | No | `—` | Russian label. |
| `name_en` | `text` | No | `—` | English label. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `category_uq1`: UNIQUE (code).

### `event` — 03 Events

Lifecycle, time, access, capacity and calendar identity. No stored upcoming/completed flag.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `organization_id` | `uuid` | No | `—` | Owning workspace. |
| `category_id` | `uuid` | No | `—` | Catalogue category. |
| `venue_id` | `uuid` | No | `—` | Physical venue. |
| `venue_layout_id` | `uuid` | Yes | `—` | Required for assigned seating. |
| `title` | `text` | No | `—` | User-authored title. |
| `description` | `text` | No | `—` | Sanitized on rendering. |
| `publication_state` | `text` | No | `'draft'` | draft, published, unpublished, cancelled. |
| `moderation_state` | `text` | No | `'normal'` | normal or suspended. |
| `visibility` | `text` | No | `'public'` | public, unlisted or private. |
| `seating_mode` | `text` | No | `'general'` | general or assigned. |
| `capacity` | `integer` | No | `—` | Configured total capacity. |
| `starts_at` | `timestamptz` | No | `—` | Start instant. |
| `ends_at` | `timestamptz` | No | `—` | End instant. |
| `time_zone` | `text` | No | `'Asia/Almaty'` | Validate against PostgreSQL timezone names. |
| `registration_opens_at` | `timestamptz` | No | `—` | Opening instant. |
| `registration_closes_at` | `timestamptz` | No | `—` | Closing instant. |
| `admission_opens_at` | `timestamptz` | No | `—` | Configured entrance start. |
| `admission_closes_at` | `timestamptz` | No | `—` | Configured entrance end. |
| `refund_allowed` | `boolean` | No | `true` | Voluntary refund rule. |
| `refund_cutoff_at` | `timestamptz` | Yes | `—` | Required when voluntary refunds allowed. |
| `calendar_uid` | `text` | No | `—` | Stable ICS UID, independent of version. |
| `calendar_sequence` | `integer` | No | `0` | Increment for calendar-relevant changes. |
| `availability_version` | `bigint` | No | `0` | Increment on inventory/admission/revocation changes. |
| `updated_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Application updates. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `event_uq1`: UNIQUE (calendar_uid).
- `event_uq2`: UNIQUE (id, organization_id).
- `event_uq3`: UNIQUE (id, venue_layout_id).
- `event_ck1`: `publication_state IN ('draft','published','unpublished','cancelled')`.
- `event_ck2`: `moderation_state IN ('normal','suspended')`.
- `event_ck3`: `visibility IN ('public','unlisted','private')`.
- `event_ck4`: `seating_mode IN ('general','assigned')`.
- `event_ck5`: `capacity >= 0`.
- `event_ck6`: `ends_at > starts_at`.
- `event_ck7`: `registration_closes_at > registration_opens_at AND registration_closes_at <= ends_at`.
- `event_ck8`: `admission_closes_at > admission_opens_at`.
- `event_ck9`: `NOT refund_allowed OR (refund_cutoff_at IS NOT NULL AND refund_cutoff_at <= starts_at)`.
- `event_ck10`: `(seating_mode = 'assigned') = (venue_layout_id IS NOT NULL)`.
- `event_ck11`: `calendar_sequence >= 0 AND availability_version >= 0`.
- `fk_event_007`: (venue_layout_id, venue_id) -> `venue_layout` (id, venue_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_008`: (category_id) -> `category` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_009`: (venue_id) -> `venue` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_085`: (organization_id) -> `organization` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_public_catalogue" ON "event" (starts_at, category_id) WHERE publication_state = 'published' AND moderation_state = 'normal' AND visibility = 'public';`.

### `event_access_grant` — 03 Events

Account-specific invitation/access grant for private event.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Private event. |
| `user_id` | `uuid` | No | `—` | Granted registered account. |
| `granted_by_user_id` | `uuid` | No | `—` | Authorized actor. |
| `revoked_at` | `timestamptz` | Yes | `—` | Revoke private access. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `event_access_grant_uq1`: UNIQUE (event_id, user_id).
- `fk_event_access_grant_086`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_access_grant_087`: (user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_access_grant_088`: (granted_by_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `event_media` — 03 Events

Ordered event images; storage lifecycle separate from publication.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Owning event. |
| `file_id` | `uuid` | No | `—` | Stored clean image. |
| `sort_order` | `integer` | No | `0` | Display order. |
| `alt_text` | `text` | No | `—` | Accessible image description. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `event_media_uq1`: UNIQUE (event_id, sort_order).
- `event_media_uq2`: UNIQUE (event_id, file_id).
- `event_media_ck1`: `sort_order >= 0`.
- `fk_event_media_089`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_media_090`: (file_id) -> `stored_file` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `venue` — 04 Venues

Reusable physical location; address snapshotted on orders.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `name` | `text` | No | `—` | Venue name. |
| `address` | `text` | No | `—` | Postal/street address. |
| `city` | `text` | No | `—` | Discovery location. |
| `country_code` | `text` | No | `'KZ'` | Initial Kazakhstan release. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `venue_ck1`: `country_code = 'KZ'`.

### `venue_layout` — 04 Venues

Versioned predefined layout; immutable after copied into a selling event.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `venue_id` | `uuid` | No | `—` | Physical venue. |
| `name` | `text` | No | `—` | Layout name. |
| `version` | `integer` | No | `1` | Seed layout revision. |
| `canvas_width` | `integer` | No | `—` | Seat-map coordinate width. |
| `canvas_height` | `integer` | No | `—` | Seat-map coordinate height. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `venue_layout_uq1`: UNIQUE (venue_id, name, version).
- `venue_layout_uq2`: UNIQUE (id, venue_id).
- `venue_layout_ck1`: `version > 0 AND canvas_width > 0 AND canvas_height > 0`.
- `fk_venue_layout_010`: (venue_id) -> `venue` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `venue_section` — 04 Venues

Section inside a layout.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `layout_id` | `uuid` | No | `—` | Layout. |
| `label` | `text` | No | `—` | Section identifier. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `venue_section_uq1`: UNIQUE (layout_id, label).
- `venue_section_uq2`: UNIQUE (id, layout_id).
- `fk_venue_section_011`: (layout_id) -> `venue_layout` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `venue_row` — 04 Venues

Numbered/labelled row in a section.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `layout_id` | `uuid` | No | `—` | Composite scope. |
| `section_id` | `uuid` | No | `—` | Section in same layout. |
| `label` | `text` | No | `—` | Row identifier. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `venue_row_uq1`: UNIQUE (section_id, label).
- `venue_row_uq2`: UNIQUE (id, layout_id).
- `fk_venue_row_012`: (section_id, layout_id) -> `venue_section` (id, layout_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `venue_seat` — 04 Venues

Physical seat and accessibility metadata, not per-event availability.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `layout_id` | `uuid` | No | `—` | Layout. |
| `row_id` | `uuid` | No | `—` | Row in same layout. |
| `label` | `text` | No | `—` | Seat number/label. |
| `price_category` | `text` | No | `—` | Predefined category mapped to event ticket types. |
| `is_accessible` | `boolean` | No | `false` | Accessibility is independent of sale state. |
| `x` | `numeric(10,2)` | No | `—` | Seat-map X. |
| `y` | `numeric(10,2)` | No | `—` | Seat-map Y. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `venue_seat_uq1`: UNIQUE (row_id, label).
- `venue_seat_uq2`: UNIQUE (id, layout_id).
- `venue_seat_ck1`: `x >= 0 AND y >= 0`.
- `fk_venue_seat_013`: (row_id, layout_id) -> `venue_row` (id, layout_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `ticket_type` — 05 Inventory

Event-specific free/paid product; type remains paid even if discounted to zero.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Owning event. |
| `name` | `text` | No | `—` | Ticket name. |
| `description` | `text` | No | `—` | Ticket description. |
| `kind` | `text` | No | `—` | free or paid. |
| `price_minor` | `bigint` | No | `—` | KZT minor units. |
| `quantity_limit` | `integer` | No | `—` | Total type capacity. |
| `per_order_limit` | `integer` | No | `—` | Maximum units in one order. |
| `sales_open_at` | `timestamptz` | No | `—` | Type sales opening. |
| `sales_close_at` | `timestamptz` | No | `—` | Type sales closing. |
| `is_hidden` | `boolean` | No | `false` | Hide without deleting history. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `ticket_type_uq1`: UNIQUE (id, event_id).
- `ticket_type_ck1`: `kind IN ('free','paid')`.
- `ticket_type_ck2`: `(kind = 'free' AND price_minor = 0) OR (kind = 'paid' AND price_minor > 0)`.
- `ticket_type_ck3`: `quantity_limit >= 0 AND per_order_limit > 0`.
- `ticket_type_ck4`: `sales_close_at > sales_open_at`.
- `fk_ticket_type_091`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `event_seat` — 05 Inventory

Seat copied into one event and mapped to an event ticket type.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event with assigned seating. |
| `layout_id` | `uuid` | No | `—` | Must equal event's configured layout. |
| `venue_seat_id` | `uuid` | No | `—` | Seat in same layout. |
| `ticket_type_id` | `uuid` | No | `—` | Ticket type for this event. |
| `section_label` | `text` | No | `—` | Stable event label snapshot. |
| `row_label` | `text` | No | `—` | Stable event label snapshot. |
| `seat_label` | `text` | No | `—` | Stable event label snapshot. |
| `is_blocked` | `boolean` | No | `false` | Organizer removes from sale; independent of allocation state. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `event_seat_uq1`: UNIQUE (event_id, venue_seat_id).
- `event_seat_uq2`: UNIQUE (event_id, section_label, row_label, seat_label).
- `event_seat_uq3`: UNIQUE (id, event_id, ticket_type_id).
- `fk_event_seat_014`: (event_id, layout_id) -> `event` (id, venue_layout_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_seat_015`: (venue_seat_id, layout_id) -> `venue_seat` (id, layout_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_seat_016`: (ticket_type_id, event_id) -> `ticket_type` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `checkout_hold` — 05 Inventory

Authenticated basket reservation; one event and buyer per hold.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Reserved event. |
| `buyer_user_id` | `uuid` | No | `—` | Verified buyer. |
| `status` | `text` | No | `'active'` | active, consumed, expired or released. |
| `expires_at` | `timestamptz` | No | `—` | Server-authoritative expiry. |
| `closed_at` | `timestamptz` | Yes | `—` | Set when no longer active. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `checkout_hold_uq1`: UNIQUE (id, event_id).
- `checkout_hold_uq2`: UNIQUE (id, event_id, buyer_user_id).
- `checkout_hold_ck1`: `status IN ('active','consumed','expired','released')`.
- `checkout_hold_ck2`: `expires_at > created_at`.
- `checkout_hold_ck3`: `(status = 'active') = (closed_at IS NULL)`.
- `fk_checkout_hold_092`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_checkout_hold_093`: (buyer_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_hold_expiry" ON "checkout_hold" (expires_at) WHERE status = 'active';`.

### `inventory_allocation` — 05 Inventory

One row per admission unit; preserve allocation history after release.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event scope. |
| `hold_id` | `uuid` | No | `—` | Original hold; remains linked after sale/refund. |
| `ticket_type_id` | `uuid` | No | `—` | Type in same event. |
| `event_seat_id` | `uuid` | Yes | `—` | NULL for general admission; required for assigned seating by TX-03. |
| `state` | `text` | No | `'held'` | held, sold, refund_quarantine or released. |
| `released_at` | `timestamptz` | Yes | `—` | Non-NULL only when released. |
| `release_reason` | `text` | Yes | `—` | expired, abandoned, free_cancel or refund_succeeded. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `inventory_allocation_uq1`: UNIQUE (id, event_id, hold_id, ticket_type_id).
- `inventory_allocation_ck1`: `state IN ('held','sold','refund_quarantine','released')`.
- `inventory_allocation_ck2`: `(state = 'released') = (released_at IS NOT NULL)`.
- `inventory_allocation_ck3`: `(state = 'released') = (release_reason IS NOT NULL)`.
- `inventory_allocation_ck4`: `release_reason IS NULL OR release_reason IN ('expired','abandoned','free_cancel','refund_succeeded')`.
- `fk_inventory_allocation_017`: (hold_id, event_id) -> `checkout_hold` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_inventory_allocation_018`: (ticket_type_id, event_id) -> `ticket_type` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_inventory_allocation_019`: (event_seat_id, event_id, ticket_type_id) -> `event_seat` (id, event_id, ticket_type_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE UNIQUE INDEX "uq_live_seat" ON "inventory_allocation" (event_seat_id) WHERE event_seat_id IS NOT NULL AND state IN ('held','sold','refund_quarantine');`.
- Index: `CREATE INDEX "ix_inventory_capacity" ON "inventory_allocation" (event_id, ticket_type_id, state);`.

### `ticket_order` — 06 Orders

One event per order; immutable quote and lifecycle separate from payment attempts.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event scope. |
| `buyer_user_id` | `uuid` | No | `—` | Purchaser, not necessarily recipient. |
| `hold_id` | `uuid` | No | `—` | Same event/buyer; one order per hold. |
| `status` | `text` | No | `'pending'` | pending, confirmed, failed, expired, cancelled, refund_pending or refunded. |
| `currency` | `text` | No | `'KZT'` | Initial currency. |
| `gross_minor` | `bigint` | No | `—` | Sum of item face values. |
| `discount_minor` | `bigint` | No | `0` | Sum of item discounts. |
| `payable_minor` | `bigint` | No | `—` | gross minus discount; buyer fee zero. |
| `processing_fee_minor` | `bigint` | No | `0` | Organizer charge snapshot. |
| `processing_rate_bps` | `integer` | No | `300` | Basis-point rate snapshot. |
| `policy_snapshot` | `jsonb` | No | `—` | Versioned refund/fee policy object. |
| `event_snapshot` | `jsonb` | No | `—` | Versioned title, times, timezone, venue/address. |
| `quote_expires_at` | `timestamptz` | No | `—` | Accepted quote expiry. |
| `confirmed_at` | `timestamptz` | Yes | `—` | First and only fulfillment time. |
| `fulfillment_payment_attempt_id` | `uuid` | Yes | `—` | NULL for zero-total orders. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `ticket_order_uq1`: UNIQUE (hold_id).
- `ticket_order_uq2`: UNIQUE (fulfillment_payment_attempt_id).
- `ticket_order_uq3`: UNIQUE (id, event_id).
- `ticket_order_uq4`: UNIQUE (id, event_id, hold_id).
- `ticket_order_ck1`: `status IN ('pending','confirmed','failed','expired','cancelled','refund_pending','refunded')`.
- `ticket_order_ck2`: `currency = 'KZT'`.
- `ticket_order_ck3`: `gross_minor >= 0 AND discount_minor BETWEEN 0 AND gross_minor`.
- `ticket_order_ck4`: `payable_minor = gross_minor - discount_minor`.
- `ticket_order_ck5`: `processing_fee_minor BETWEEN 0 AND payable_minor`.
- `ticket_order_ck6`: `processing_rate_bps BETWEEN 0 AND 10000`.
- `ticket_order_ck7`: `jsonb_typeof(policy_snapshot) = 'object' AND jsonb_typeof(event_snapshot) = 'object'`.
- `ticket_order_ck8`: `status NOT IN ('confirmed','refund_pending','refunded') OR confirmed_at IS NOT NULL`.
- `ticket_order_ck9`: `confirmed_at IS NULL OR ((payable_minor = 0 AND fulfillment_payment_attempt_id IS NULL) OR (payable_minor > 0 AND fulfillment_payment_attempt_id IS NOT NULL))`.
- `fk_ticket_order_020`: (hold_id, event_id, buyer_user_id) -> `checkout_hold` (id, event_id, buyer_user_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_ticket_order_021`: (fulfillment_payment_attempt_id, event_id) -> `payment_attempt` (id, event_id); child has **0..1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_buyer_orders" ON "ticket_order" (buyer_user_id, created_at);`.
- Index: `CREATE INDEX "ix_event_sales" ON "ticket_order" (event_id, confirmed_at) WHERE confirmed_at IS NOT NULL;`.

### `order_item` — 06 Orders

One admission unit, not an aggregate line: simplifies seat, recipient, ticket and refund mapping.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `order_id` | `uuid` | No | `—` | Purchaser order. |
| `event_id` | `uuid` | No | `—` | Scope discriminator. |
| `hold_id` | `uuid` | No | `—` | Must match order and allocation. |
| `ticket_type_id` | `uuid` | No | `—` | Same type as allocation. |
| `allocation_id` | `uuid` | No | `—` | Exactly one retained allocation. |
| `unit_number` | `integer` | No | `—` | Sequence in order, starting at 1. |
| `ticket_type_name` | `text` | No | `—` | Purchased name snapshot. |
| `recipient_name` | `text` | No | `—` | Attendee name snapshot. |
| `recipient_email` | `text` | No | `—` | Normalized intended recipient; no later resale/transfer. |
| `face_value_minor` | `bigint` | No | `—` | Unit price snapshot. |
| `discount_minor` | `bigint` | No | `0` | Allocated campaign discount. |
| `paid_minor` | `bigint` | No | `—` | face minus discount. |
| `processing_fee_minor` | `bigint` | No | `0` | Deterministic fee allocation. |
| `seat_snapshot` | `jsonb` | Yes | `—` | Section/row/seat when assigned. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `order_item_uq1`: UNIQUE (allocation_id).
- `order_item_uq2`: UNIQUE (order_id, unit_number).
- `order_item_uq3`: UNIQUE (id, event_id).
- `order_item_ck1`: `unit_number > 0`.
- `order_item_ck2`: `recipient_email = lower(btrim(recipient_email))`.
- `order_item_ck3`: `face_value_minor >= 0 AND discount_minor BETWEEN 0 AND face_value_minor`.
- `order_item_ck4`: `paid_minor = face_value_minor - discount_minor`.
- `order_item_ck5`: `processing_fee_minor BETWEEN 0 AND paid_minor`.
- `order_item_ck6`: `seat_snapshot IS NULL OR jsonb_typeof(seat_snapshot) = 'object'`.
- `fk_order_item_022`: (order_id, event_id, hold_id) -> `ticket_order` (id, event_id, hold_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_order_item_023`: (allocation_id, event_id, hold_id, ticket_type_id) -> `inventory_allocation` (id, event_id, hold_id, ticket_type_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.

### `payment_intent` — 07 Payments

One payment obligation for an order or event activation; retries belong to attempts.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Owning event. |
| `order_id` | `uuid` | Yes | `—` | Order payment target. |
| `activation_id` | `uuid` | Yes | `—` | Activation payment target, exclusive with order. |
| `purpose` | `text` | No | `—` | ticket_order or activation. |
| `expected_minor` | `bigint` | No | `—` | Expected charge, positive. |
| `currency` | `text` | No | `'KZT'` | Currency snapshot. |
| `environment` | `text` | No | `'simulation'` | simulation or sandbox; live outside this design baseline. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `payment_intent_uq1`: UNIQUE (order_id).
- `payment_intent_uq2`: UNIQUE (activation_id).
- `payment_intent_uq3`: UNIQUE (id, event_id, environment).
- `payment_intent_ck1`: `(purpose = 'ticket_order' AND order_id IS NOT NULL AND activation_id IS NULL) OR (purpose = 'activation' AND activation_id IS NOT NULL AND order_id IS NULL)`.
- `payment_intent_ck2`: `expected_minor > 0`.
- `payment_intent_ck3`: `currency = 'KZT'`.
- `payment_intent_ck4`: `environment IN ('simulation','sandbox')`.
- `fk_payment_intent_024`: (order_id, event_id) -> `ticket_order` (id, event_id); child has **0..1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_payment_intent_025`: (activation_id, event_id) -> `sales_activation` (id, event_id); child has **0..1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.

### `payment_attempt` — 07 Payments

Provider attempts preserve even duplicate successful charges; fulfillment chooses only one.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `intent_id` | `uuid` | No | `—` | Obligation. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `environment` | `text` | No | `—` | Must equal intent environment. |
| `provider` | `text` | No | `—` | simulator or selected sandbox provider. |
| `merchant_account_key` | `text` | No | `—` | Nonsecret provider-account discriminator. |
| `provider_payment_id` | `text` | Yes | `—` | Provider transaction ID when known. |
| `request_key` | `text` | No | `—` | Stable outbound idempotency key. |
| `status` | `text` | No | `'created'` | created, pending, succeeded or failed. |
| `charged_minor` | `bigint` | No | `0` | Actual confirmed charge. |
| `processing_fee_minor` | `bigint` | No | `0` | Actual/simulated fee. |
| `confirmed_at` | `timestamptz` | Yes | `—` | Authoritative success time. |
| `next_reconcile_at` | `timestamptz` | Yes | `—` | Pending/uncertain reconciliation schedule. |
| `safe_result` | `jsonb` | No | `'{}'::jsonb` | Allowlisted result fields only. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `payment_attempt_uq1`: UNIQUE (provider, environment, merchant_account_key, provider_payment_id).
- `payment_attempt_uq2`: UNIQUE (provider, environment, merchant_account_key, request_key).
- `payment_attempt_uq3`: UNIQUE (id, event_id).
- `payment_attempt_ck1`: `status IN ('created','pending','succeeded','failed')`.
- `payment_attempt_ck2`: `charged_minor >= 0 AND processing_fee_minor BETWEEN 0 AND charged_minor`.
- `payment_attempt_ck3`: `(status = 'succeeded') = (confirmed_at IS NOT NULL)`.
- `payment_attempt_ck4`: `status <> 'succeeded' OR charged_minor > 0`.
- `payment_attempt_ck5`: `jsonb_typeof(safe_result) = 'object'`.
- `fk_payment_attempt_026`: (intent_id, event_id, environment) -> `payment_intent` (id, event_id, environment); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_payment_reconcile" ON "payment_attempt" (next_reconcile_at) WHERE status = 'pending';`.

### `provider_event` — 07 Payments

Verified callback inbox; save received and processed times independently.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `provider` | `text` | No | `—` | Source adapter. |
| `environment` | `text` | No | `—` | simulation or sandbox. |
| `merchant_account_key` | `text` | No | `—` | Nonsecret account scope. |
| `external_event_id` | `text` | No | `—` | Provider event ID or stable adapter-derived fingerprint. |
| `payment_attempt_id` | `uuid` | Yes | `—` | Resolved payment attempt. |
| `refund_attempt_id` | `uuid` | Yes | `—` | Resolved refund attempt. |
| `payload_hash` | `text` | No | `—` | Digest to detect same ID with altered data. |
| `safe_payload` | `jsonb` | No | `—` | Validated allowlist, no card/token secrets. |
| `status` | `text` | No | `'received'` | received, processed or rejected. |
| `processed_at` | `timestamptz` | Yes | `—` | Business effects committed with this timestamp. |
| `rejection_reason` | `text` | Yes | `—` | Safe diagnosis. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `provider_event_uq1`: UNIQUE (provider, environment, merchant_account_key, external_event_id).
- `provider_event_ck1`: `environment IN ('simulation','sandbox')`.
- `provider_event_ck2`: `status IN ('received','processed','rejected')`.
- `provider_event_ck3`: `num_nonnulls(payment_attempt_id,refund_attempt_id) <= 1`.
- `provider_event_ck4`: `jsonb_typeof(safe_payload) = 'object'`.
- `provider_event_ck5`: `status <> 'processed' OR processed_at IS NOT NULL`.
- `fk_provider_event_027`: (payment_attempt_id) -> `payment_attempt` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_provider_event_028`: (refund_attempt_id) -> `refund_attempt` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `payout_profile` — 08 Activation

Protected organizer payout destination; simulator reference or encrypted sandbox profile.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `organization_id` | `uuid` | No | `—` | Owner. |
| `environment` | `text` | No | `'simulation'` | simulation or sandbox. |
| `provider` | `text` | No | `—` | Profile adapter. |
| `provider_reference` | `text` | Yes | `—` | Provider token/reference; not card details. |
| `encrypted_details` | `bytea` | Yes | `—` | Encrypted payout metadata, if needed. |
| `status` | `text` | No | `'pending'` | pending, verified or rejected. |
| `verified_at` | `timestamptz` | Yes | `—` | Verification time. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `payout_profile_uq1`: UNIQUE (id, organization_id).
- `payout_profile_ck1`: `environment IN ('simulation','sandbox')`.
- `payout_profile_ck2`: `status IN ('pending','verified','rejected')`.
- `payout_profile_ck3`: `status <> 'verified' OR verified_at IS NOT NULL`.
- `fk_payout_profile_094`: (organization_id) -> `organization` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `verification_record` — 08 Activation

Retained demo/sandbox identity decisions; no production KYC documents.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `organization_id` | `uuid` | No | `—` | Applicant. |
| `submitted_by_user_id` | `uuid` | No | `—` | Submitting actor. |
| `reviewed_by_user_id` | `uuid` | Yes | `—` | Platform reviewer, NULL for simulator. |
| `environment` | `text` | No | `'simulation'` | simulation or sandbox. |
| `status` | `text` | No | `'pending'` | pending, approved or rejected. |
| `reviewed_at` | `timestamptz` | Yes | `—` | Decision timestamp. |
| `reason` | `text` | Yes | `—` | Safe decision explanation. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `verification_record_uq1`: UNIQUE (id, organization_id).
- `verification_record_ck1`: `environment IN ('simulation','sandbox')`.
- `verification_record_ck2`: `status IN ('pending','approved','rejected')`.
- `verification_record_ck3`: `status = 'pending' OR reviewed_at IS NOT NULL`.
- `fk_verification_record_095`: (organization_id) -> `organization` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_verification_record_096`: (submitted_by_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_verification_record_097`: (reviewed_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `terms_acceptance` — 08 Activation

Immutable evidence of event paid-terms acceptance.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event. |
| `accepted_by_user_id` | `uuid` | No | `—` | Authorized actor. |
| `terms_version` | `text` | No | `—` | Version identifier. |
| `terms_hash` | `text` | No | `—` | Digest of exact accepted terms. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `terms_acceptance_uq1`: UNIQUE (event_id, terms_version, accepted_by_user_id).
- `terms_acceptance_uq2`: UNIQUE (id, event_id).
- `fk_terms_acceptance_098`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_terms_acceptance_099`: (accepted_by_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `sales_activation` — 08 Activation

Event-level checklist and paid-sales gate.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | One activation per event. |
| `organization_id` | `uuid` | No | `—` | Must match event organization. |
| `payout_profile_id` | `uuid` | Yes | `—` | Verified destination in same organization. |
| `verification_record_id` | `uuid` | Yes | `—` | Approved decision in same organization. |
| `terms_acceptance_id` | `uuid` | Yes | `—` | Acceptance for same event. |
| `status` | `text` | No | `'incomplete'` | incomplete, pending, active, failed or suspended. |
| `activation_fee_minor` | `bigint` | No | `500000` | Demo KZT 5,000 in minor units. |
| `currency` | `text` | No | `'KZT'` | Saved fee currency. |
| `paid_attempt_id` | `uuid` | Yes | `—` | Chosen successful activation charge. |
| `activated_at` | `timestamptz` | Yes | `—` | First activation success. |
| `suspension_reason` | `text` | Yes | `—` | Reason for paid-sales suspension. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `sales_activation_uq1`: UNIQUE (event_id).
- `sales_activation_uq2`: UNIQUE (paid_attempt_id).
- `sales_activation_uq3`: UNIQUE (id, event_id).
- `sales_activation_ck1`: `status IN ('incomplete','pending','active','failed','suspended')`.
- `sales_activation_ck2`: `activation_fee_minor > 0 AND currency = 'KZT'`.
- `sales_activation_ck3`: `status <> 'active' OR (payout_profile_id IS NOT NULL AND verification_record_id IS NOT NULL AND terms_acceptance_id IS NOT NULL AND paid_attempt_id IS NOT NULL AND activated_at IS NOT NULL)`.
- `fk_sales_activation_029`: (event_id, organization_id) -> `event` (id, organization_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_sales_activation_030`: (payout_profile_id, organization_id) -> `payout_profile` (id, organization_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_sales_activation_031`: (verification_record_id, organization_id) -> `verification_record` (id, organization_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_sales_activation_032`: (terms_acceptance_id, event_id) -> `terms_acceptance` (id, event_id); child has **0..1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_sales_activation_033`: (paid_attempt_id, event_id) -> `payment_attempt` (id, event_id); child has **0..1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.

### `campaign` — 09 Campaigns

One discount definition per event; edits do not rewrite purchased snapshots.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Campaign event. |
| `name` | `text` | No | `—` | Organizer label. |
| `discount_kind` | `text` | No | `—` | percentage or fixed. |
| `percentage_bps` | `integer` | Yes | `—` | 1..10000 basis points for percentage. |
| `fixed_minor` | `bigint` | Yes | `—` | Positive fixed KZT discount. |
| `starts_at` | `timestamptz` | No | `—` | Validity opening. |
| `ends_at` | `timestamptz` | No | `—` | Validity closing. |
| `max_redemptions` | `integer` | No | `—` | Lifetime successful-order limit. |
| `is_enabled` | `boolean` | No | `true` | Rechecked at fulfillment. |
| `all_ticket_types` | `boolean` | No | `true` | False requires eligible join rows. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `campaign_uq1`: UNIQUE (id, event_id).
- `campaign_ck1`: `(discount_kind = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND percentage_bps IS NOT NULL AND fixed_minor IS NULL) OR (discount_kind = 'fixed' AND fixed_minor > 0 AND fixed_minor IS NOT NULL AND percentage_bps IS NULL)`.
- `campaign_ck2`: `ends_at > starts_at AND max_redemptions > 0`.
- `fk_campaign_100`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `campaign_ticket_type` — 09 Campaigns

Eligible ticket types; composite FKs prevent cross-event discounts.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `campaign_id` | `uuid` | No | `—` | Campaign. |
| `ticket_type_id` | `uuid` | No | `—` | Eligible type in same event. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `campaign_ticket_type_uq1`: UNIQUE (campaign_id, ticket_type_id).
- `fk_campaign_ticket_type_034`: (campaign_id, event_id) -> `campaign` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_campaign_ticket_type_035`: (ticket_type_id, event_id) -> `ticket_type` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `promo_code` — 09 Campaigns

Human code and separate opaque campaign-link token.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `campaign_id` | `uuid` | No | `—` | Campaign. |
| `code_normalized` | `text` | No | `—` | Unique uppercase code. |
| `link_token_hash` | `text` | No | `—` | Opaque campaign-link digest; different purpose from ticket. |
| `is_enabled` | `boolean` | No | `true` | Code-level switch. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `promo_code_uq1`: UNIQUE (code_normalized).
- `promo_code_uq2`: UNIQUE (link_token_hash).
- `promo_code_uq3`: UNIQUE (id, event_id, campaign_id).
- `promo_code_ck1`: `code_normalized = upper(btrim(code_normalized))`.
- `fk_promo_code_036`: (campaign_id, event_id) -> `campaign` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `promo_reservation` — 09 Campaigns

One active redemption allowance per hold; released/consumed history retained.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `campaign_id` | `uuid` | No | `—` | Campaign lock protects lifetime limit. |
| `promo_code_id` | `uuid` | No | `—` | Code in same campaign/event. |
| `hold_id` | `uuid` | No | `—` | Inventory hold in same event. |
| `status` | `text` | No | `'active'` | active, consumed or released. |
| `expires_at` | `timestamptz` | No | `—` | No later than hold expiry. |
| `discount_snapshot` | `jsonb` | No | `—` | Versioned exact discount definition used in quote. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `promo_reservation_uq1`: UNIQUE (id, event_id, campaign_id).
- `promo_reservation_ck1`: `status IN ('active','consumed','released')`.
- `promo_reservation_ck2`: `expires_at > created_at`.
- `promo_reservation_ck3`: `jsonb_typeof(discount_snapshot) = 'object'`.
- `fk_promo_reservation_037`: (promo_code_id, event_id, campaign_id) -> `promo_code` (id, event_id, campaign_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_promo_reservation_038`: (hold_id, event_id) -> `checkout_hold` (id, event_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE UNIQUE INDEX "uq_active_promo_hold" ON "promo_reservation" (hold_id) WHERE status = 'active';`.
- Index: `CREATE INDEX "ix_campaign_pending" ON "promo_reservation" (campaign_id, status, expires_at);`.

### `promo_redemption` — 09 Campaigns

Immutable successful-order attribution; refund never deletes/replenishes it.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `campaign_id` | `uuid` | No | `—` | Campaign. |
| `reservation_id` | `uuid` | No | `—` | Consumed allowance. |
| `order_id` | `uuid` | No | `—` | One redemption per order. |
| `discount_minor` | `bigint` | No | `—` | Sum of order item discount allocations. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `promo_redemption_uq1`: UNIQUE (order_id).
- `promo_redemption_uq2`: UNIQUE (reservation_id).
- `promo_redemption_ck1`: `discount_minor >= 0`.
- `fk_promo_redemption_039`: (reservation_id, event_id, campaign_id) -> `promo_reservation` (id, event_id, campaign_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_promo_redemption_040`: (order_id, event_id) -> `ticket_order` (id, event_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_campaign_redemptions" ON "promo_redemption" (campaign_id, created_at);`.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `ticket` — 10 Tickets

One canonical ticket per unit; buyer and recipient are distinct.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `order_item_id` | `uuid` | No | `—` | One purchased admission unit. |
| `recipient_user_id` | `uuid` | Yes | `—` | Unclaimed until intended email verified. |
| `status` | `text` | No | `'valid'` | valid, checked_in, refund_pending, refunded or cancelled. |
| `qr_token_hash` | `text` | No | `—` | Purpose-bound ticket token digest. |
| `token_version` | `integer` | No | `1` | Signing/token revision, not a new admission. |
| `claimed_at` | `timestamptz` | Yes | `—` | Recipient association time. |
| `issued_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Canonical issuance time. |
| `pdf_file_id` | `uuid` | Yes | `—` | Protected printable rendering. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `ticket_uq1`: UNIQUE (order_item_id).
- `ticket_uq2`: UNIQUE (qr_token_hash).
- `ticket_uq3`: UNIQUE (id, event_id).
- `ticket_uq4`: UNIQUE (id, event_id, recipient_user_id).
- `ticket_ck1`: `status IN ('valid','checked_in','refund_pending','refunded','cancelled')`.
- `ticket_ck2`: `token_version > 0`.
- `ticket_ck3`: `(recipient_user_id IS NULL) = (claimed_at IS NULL)`.
- `fk_ticket_041`: (order_item_id, event_id) -> `order_item` (id, event_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_ticket_101`: (recipient_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_ticket_102`: (pdf_file_id) -> `stored_file` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `ticket_claim` — 10 Tickets

Expiring claim challenge; intended email comes from immutable order item.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `ticket_id` | `uuid` | No | `—` | Ticket to claim. |
| `token_hash` | `text` | No | `—` | Digest, not raw claim secret. |
| `expires_at` | `timestamptz` | No | `—` | Expiry. |
| `consumed_at` | `timestamptz` | Yes | `—` | Single successful use. |
| `consumed_by_user_id` | `uuid` | Yes | `—` | Verified intended recipient. |
| `revoked_at` | `timestamptz` | Yes | `—` | Explicitly close expired/replaced claim before inserting another. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `ticket_claim_uq1`: UNIQUE (token_hash).
- `ticket_claim_ck1`: `expires_at > created_at`.
- `ticket_claim_ck2`: `(consumed_at IS NULL) = (consumed_by_user_id IS NULL)`.
- `fk_ticket_claim_042`: (ticket_id) -> `ticket` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_ticket_claim_103`: (consumed_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE UNIQUE INDEX "uq_open_ticket_claim" ON "ticket_claim" (ticket_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;`.

### `entry_confirmation` — 10 Tickets

Short-lived signed-in attendee proof; separate from printed ticket identity.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `ticket_id` | `uuid` | No | `—` | Claimed ticket. |
| `event_id` | `uuid` | No | `—` | Same event. |
| `attendee_user_id` | `uuid` | No | `—` | Must equal ticket recipient. |
| `session_id` | `uuid` | No | `—` | Session belongs to attendee. |
| `token_hash` | `text` | No | `—` | Purpose-bound one-time confirmation digest. |
| `signing_key_id` | `text` | No | `—` | Public verification key identifier for offline package. |
| `expires_at` | `timestamptz` | No | `—` | Short validity; not later than session. |
| `consumed_at` | `timestamptz` | Yes | `—` | Set atomically with authoritative admission. |
| `revoked_at` | `timestamptz` | Yes | `—` | Optional explicit cancellation. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `entry_confirmation_uq1`: UNIQUE (token_hash).
- `entry_confirmation_uq2`: UNIQUE (id, ticket_id, event_id).
- `entry_confirmation_ck1`: `expires_at > created_at`.
- `fk_entry_confirmation_043`: (ticket_id, event_id, attendee_user_id) -> `ticket` (id, event_id, recipient_user_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_entry_confirmation_044`: (session_id, attendee_user_id) -> `auth_session` (id, user_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `scanner_device` — 11 Admission

Registered scanner installation, owned by one account; event permissions checked separately.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `owner_user_id` | `uuid` | No | `—` | Scanner account. |
| `device_key` | `text` | No | `—` | Installation identifier, not a secret bearer credential. |
| `label` | `text` | No | `—` | Operator-readable name. |
| `revoked_at` | `timestamptz` | Yes | `—` | Device authorization stop. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `scanner_device_uq1`: UNIQUE (device_key).
- `scanner_device_uq2`: UNIQUE (id, owner_user_id).
- `fk_scanner_device_104`: (owner_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `check_in` — 11 Admission

Append-preserved accepted admission; current state represented by reversed_at.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `ticket_id` | `uuid` | No | `—` | Canonical ticket. |
| `event_id` | `uuid` | No | `—` | Same event. |
| `entry_confirmation_id` | `uuid` | No | `—` | Consumed attendee confirmation. |
| `scanner_user_id` | `uuid` | No | `—` | Authorized scanner at operation time. |
| `scanner_session_id` | `uuid` | No | `—` | Session belongs to scanner. |
| `device_id` | `uuid` | No | `—` | Device belongs to scanner. |
| `operation_id` | `uuid` | No | `—` | Client retry/deduplication ID. |
| `source` | `text` | No | `—` | online or offline_sync. |
| `accepted_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server acceptance time. |
| `captured_at` | `timestamptz` | No | `—` | Device observation, not conflict priority. |
| `reversed_at` | `timestamptz` | Yes | `—` | Materialized current-admission flag; written with reversal row. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `check_in_uq1`: UNIQUE (device_id, operation_id).
- `check_in_uq2`: UNIQUE (entry_confirmation_id).
- `check_in_uq3`: UNIQUE (id, ticket_id, event_id).
- `check_in_ck1`: `source IN ('online','offline_sync')`.
- `fk_check_in_045`: (entry_confirmation_id, ticket_id, event_id) -> `entry_confirmation` (id, ticket_id, event_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_check_in_046`: (scanner_session_id, scanner_user_id) -> `auth_session` (id, user_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_check_in_047`: (device_id, scanner_user_id) -> `scanner_device` (id, owner_user_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE UNIQUE INDEX "uq_current_admission" ON "check_in" (ticket_id) WHERE reversed_at IS NULL;`.

### `check_in_reversal` — 11 Admission

One retained reversal for an accepted admission; never erase original row.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `check_in_id` | `uuid` | No | `—` | Admission being reversed. |
| `actor_user_id` | `uuid` | No | `—` | Authorized reversal actor. |
| `reason` | `text` | No | `—` | Mandatory explanation. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `check_in_reversal_uq1`: UNIQUE (check_in_id).
- `check_in_reversal_ck1`: `length(btrim(reason)) > 0`.
- `fk_check_in_reversal_048`: (check_in_id) -> `check_in` (id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_check_in_reversal_105`: (actor_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `refund` — 12 Refunds and finance

One full refund obligation per successful charge, including compensating duplicate/late charges.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `payment_attempt_id` | `uuid` | No | `—` | Exactly one charged attempt. |
| `event_id` | `uuid` | No | `—` | Scope. |
| `reason` | `text` | No | `—` | voluntary, event_cancelled, late_payment, duplicate_charge or blocked_fulfillment. |
| `status` | `text` | No | `'requested'` | requested, pending, failed or succeeded. |
| `amount_minor` | `bigint` | No | `—` | Full amount of referenced actual charge. |
| `requested_by_user_id` | `uuid` | Yes | `—` | NULL for background compensation/cancellation worker. |
| `approved_by_user_id` | `uuid` | Yes | `—` | Authorized approver; NULL for system policy. |
| `succeeded_at` | `timestamptz` | Yes | `—` | Authoritative refund completion, not request acceptance. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `refund_uq1`: UNIQUE (payment_attempt_id).
- `refund_uq2`: UNIQUE (id, event_id).
- `refund_ck1`: `reason IN ('voluntary','event_cancelled','late_payment','duplicate_charge','blocked_fulfillment')`.
- `refund_ck2`: `status IN ('requested','pending','failed','succeeded')`.
- `refund_ck3`: `amount_minor > 0`.
- `refund_ck4`: `(status = 'succeeded') = (succeeded_at IS NOT NULL)`.
- `fk_refund_049`: (payment_attempt_id, event_id) -> `payment_attempt` (id, event_id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_refund_106`: (requested_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_refund_107`: (approved_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `refund_attempt` — 12 Refunds and finance

Transport attempts for the same logical refund. Uncertain outcome reconciles before resend.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `refund_id` | `uuid` | No | `—` | Obligation. |
| `attempt_number` | `integer` | No | `—` | Sequence. |
| `provider_refund_id` | `text` | Yes | `—` | Provider refund operation reference. |
| `provider_request_key` | `text` | No | `—` | Same logical refund key across transport retries. |
| `status` | `text` | No | `'pending'` | pending, succeeded, failed or unknown. |
| `sent_at` | `timestamptz` | Yes | `—` | External send time. |
| `resolved_at` | `timestamptz` | Yes | `—` | Known terminal outcome. |
| `safe_result` | `jsonb` | No | `'{}'::jsonb` | Allowlisted provider response. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `refund_attempt_uq1`: UNIQUE (refund_id, attempt_number).
- `refund_attempt_ck1`: `attempt_number > 0`.
- `refund_attempt_ck2`: `status IN ('pending','succeeded','failed','unknown')`.
- `refund_attempt_ck3`: `jsonb_typeof(safe_result) = 'object'`.
- `fk_refund_attempt_050`: (refund_id) -> `refund` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `demo_payout` — 12 Refunds and finance

Event-scoped payout simulation; never represents a real bank transfer.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event. |
| `organization_id` | `uuid` | No | `—` | Owning workspace. |
| `payout_profile_id` | `uuid` | No | `—` | Profile in same organization. |
| `amount_minor` | `bigint` | No | `—` | Positive reserved payable funds. |
| `currency` | `text` | No | `'KZT'` | Currency. |
| `status` | `text` | No | `'pending'` | pending, eligible, sent or failed. |
| `request_key` | `text` | No | `—` | Idempotent logical payout operation. |
| `sent_at` | `timestamptz` | Yes | `—` | Successful simulated send. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `demo_payout_uq1`: UNIQUE (event_id, request_key).
- `demo_payout_uq2`: UNIQUE (id, event_id).
- `demo_payout_ck1`: `amount_minor > 0 AND currency = 'KZT'`.
- `demo_payout_ck2`: `status IN ('pending','eligible','sent','failed')`.
- `demo_payout_ck3`: `(status = 'sent') = (sent_at IS NOT NULL)`.
- `fk_demo_payout_051`: (event_id, organization_id) -> `event` (id, organization_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_demo_payout_052`: (payout_profile_id, organization_id) -> `payout_profile` (id, organization_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `finance_entry` — 12 Refunds and finance

Append-only signed organizer balance effects; not a production accounting ledger.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event balance scope. |
| `payment_attempt_id` | `uuid` | Yes | `—` | Source sale, processing fee or activation payment. |
| `refund_id` | `uuid` | Yes | `—` | Source refund or fee reversal. |
| `demo_payout_id` | `uuid` | Yes | `—` | Source simulated payout debit. |
| `kind` | `text` | No | `—` | sale, processing_fee, activation_fee, refund, fee_reversal, activation_refund or payout. |
| `amount_minor` | `bigint` | No | `—` | Signed effect; credits positive, debits negative. |
| `currency` | `text` | No | `'KZT'` | KZT. |
| `environment` | `text` | No | `—` | simulation or sandbox. |
| `effective_at` | `timestamptz` | No | `—` | Business recognition timestamp. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `finance_entry_uq1`: UNIQUE (payment_attempt_id, kind).
- `finance_entry_uq2`: UNIQUE (refund_id, kind).
- `finance_entry_uq3`: UNIQUE (demo_payout_id, kind).
- `finance_entry_ck1`: `currency = 'KZT' AND environment IN ('simulation','sandbox')`.
- `finance_entry_ck2`: `(kind IN ('sale','processing_fee','activation_fee') AND payment_attempt_id IS NOT NULL AND refund_id IS NULL AND demo_payout_id IS NULL) OR (kind IN ('refund','fee_reversal','activation_refund') AND refund_id IS NOT NULL AND payment_attempt_id IS NULL AND demo_payout_id IS NULL) OR (kind = 'payout' AND demo_payout_id IS NOT NULL AND payment_attempt_id IS NULL AND refund_id IS NULL)`.
- `finance_entry_ck3`: `(kind IN ('sale','fee_reversal','activation_refund') AND amount_minor >= 0) OR (kind IN ('processing_fee','activation_fee','refund','payout') AND amount_minor <= 0)`.
- `fk_finance_entry_053`: (payment_attempt_id, event_id) -> `payment_attempt` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_finance_entry_054`: (refund_id, event_id) -> `refund` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_finance_entry_055`: (demo_payout_id, event_id) -> `demo_payout` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_event_finance" ON "finance_entry" (event_id, environment, effective_at);`.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `offline_package` — 13 Offline synchronization

Expiring signed event manifest for a specific scanner device/session.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Event. |
| `scanner_user_id` | `uuid` | No | `—` | Assigned account at download. |
| `session_id` | `uuid` | No | `—` | Scanner session. |
| `device_id` | `uuid` | No | `—` | Owned device. |
| `file_id` | `uuid` | No | `—` | Protected encrypted manifest object. |
| `snapshot_version` | `bigint` | No | `—` | Event availability version used. |
| `expires_at` | `timestamptz` | No | `—` | Package authorization expiry. |
| `content_hash` | `text` | No | `—` | Manifest integrity digest. |
| `signing_key_id` | `text` | No | `—` | Manifest verification key. |
| `revoked_at` | `timestamptz` | Yes | `—` | Online stop; cannot instantly reach disconnected device. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `offline_package_uq1`: UNIQUE (id, event_id, device_id).
- `offline_package_ck1`: `snapshot_version >= 0`.
- `offline_package_ck2`: `expires_at > created_at`.
- `fk_offline_package_056`: (session_id, scanner_user_id) -> `auth_session` (id, user_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_offline_package_057`: (device_id, scanner_user_id) -> `scanner_device` (id, owner_user_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_offline_package_108`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_offline_package_109`: (file_id) -> `stored_file` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `offline_operation` — 13 Offline synchronization

Retained raw client intent and per-operation reconciliation outcome; not authoritative admission.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `package_id` | `uuid` | No | `—` | Manifest used. |
| `event_id` | `uuid` | No | `—` | Package scope. |
| `device_id` | `uuid` | No | `—` | Package device. |
| `operation_id` | `uuid` | No | `—` | Client-generated stable ID. |
| `sequence_number` | `bigint` | No | `—` | Monotonic within package. |
| `kind` | `text` | No | `—` | check_in or reverse. |
| `claimed_ticket_id` | `uuid` | Yes | `—` | Untrusted supplied ID; intentionally not FK so invalid scans can be retained. |
| `claimed_confirmation_id` | `uuid` | Yes | `—` | Untrusted reference, not FK. |
| `parent_operation_id` | `uuid` | Yes | `—` | For reversal: client operation ID being reversed. |
| `captured_at` | `timestamptz` | No | `—` | Untrusted device time. |
| `payload_hash` | `text` | No | `—` | Detect retry with changed content. |
| `status` | `text` | No | `'received'` | received, accepted, duplicate, rejected or conflict. |
| `resolved_ticket_id` | `uuid` | Yes | `—` | Only valid resolved ticket FK. |
| `accepted_check_in_id` | `uuid` | Yes | `—` | Accepted or original deduplicated admission. |
| `rejection_code` | `text` | Yes | `—` | Machine-readable result. |
| `processed_at` | `timestamptz` | Yes | `—` | Server reconciliation time. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `offline_operation_uq1`: UNIQUE (device_id, operation_id).
- `offline_operation_uq2`: UNIQUE (package_id, sequence_number).
- `offline_operation_ck1`: `sequence_number > 0`.
- `offline_operation_ck2`: `kind IN ('check_in','reverse')`.
- `offline_operation_ck3`: `status IN ('received','accepted','duplicate','rejected','conflict')`.
- `offline_operation_ck4`: `(kind = 'reverse') = (parent_operation_id IS NOT NULL)`.
- `offline_operation_ck5`: `status = 'received' OR processed_at IS NOT NULL`.
- `fk_offline_operation_058`: (package_id, event_id, device_id) -> `offline_package` (id, event_id, device_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_offline_operation_059`: (resolved_ticket_id, event_id) -> `ticket` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_offline_operation_060`: (accepted_check_in_id) -> `check_in` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `sync_conflict` — 13 Offline synchronization

Organizer review of conflicting provisional operation; cannot create a second admission.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `offline_operation_id` | `uuid` | No | `—` | Conflicting upload. |
| `existing_check_in_id` | `uuid` | Yes | `—` | Already accepted admission if relevant. |
| `status` | `text` | No | `'open'` | open or resolved. |
| `reason` | `text` | No | `—` | Conflict explanation. |
| `resolved_by_user_id` | `uuid` | Yes | `—` | Authorized reviewer. |
| `resolution_note` | `text` | Yes | `—` | What actually happened at gate. |
| `resolved_at` | `timestamptz` | Yes | `—` | Review completion. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `sync_conflict_uq1`: UNIQUE (offline_operation_id).
- `sync_conflict_ck1`: `status IN ('open','resolved')`.
- `sync_conflict_ck2`: `status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution_note IS NOT NULL)`.
- `fk_sync_conflict_061`: (offline_operation_id) -> `offline_operation` (id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.
- `fk_sync_conflict_062`: (existing_check_in_id) -> `check_in` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_sync_conflict_110`: (resolved_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `stored_file` — 14 Files and support

Object storage metadata; DB transaction does not pretend to atomically commit remote bytes.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `uploaded_by_user_id` | `uuid` | Yes | `—` | NULL for PDF/manifest worker. |
| `object_key` | `text` | No | `—` | Private storage locator; never a public permanent URL. |
| `purpose` | `text` | No | `—` | event_image, ticket_pdf, support_attachment or offline_package. |
| `mime_type` | `text` | No | `—` | Validated content type. |
| `size_bytes` | `bigint` | No | `—` | Verified byte length. |
| `sha256` | `text` | No | `—` | Integrity digest. |
| `status` | `text` | No | `'pending'` | pending, quarantined, clean, rejected or deleted. |
| `scanned_at` | `timestamptz` | Yes | `—` | Required for attachment release. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `stored_file_uq1`: UNIQUE (object_key).
- `stored_file_ck1`: `purpose IN ('event_image','ticket_pdf','support_attachment','offline_package')`.
- `stored_file_ck2`: `status IN ('pending','quarantined','clean','rejected','deleted')`.
- `stored_file_ck3`: `size_bytes >= 0`.
- `fk_stored_file_111`: (uploaded_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `support_case` — 14 Files and support

One contextual thread, resolved through current relationships and explicit escalation.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `requester_user_id` | `uuid` | No | `—` | Account that opened case. |
| `organization_id` | `uuid` | Yes | `—` | Organizer context/target queue. |
| `event_id` | `uuid` | Yes | `—` | Optional accessible event. |
| `order_id` | `uuid` | Yes | `—` | Buyer's order if linked. |
| `ticket_id` | `uuid` | Yes | `—` | Recipient's ticket if linked. |
| `case_kind` | `text` | No | `—` | attendee or organizer_platform. |
| `category` | `text` | No | `—` | delivery, payment, refund, seating, event_info, check_in, account or technical. |
| `subject` | `text` | No | `—` | Short subject. |
| `status` | `text` | No | `'open'` | open, in_progress, waiting_customer or resolved. |
| `assigned_to_user_id` | `uuid` | Yes | `—` | Authorized staff/admin, relationship checked transactionally. |
| `escalated_at` | `timestamptz` | Yes | `—` | Platform access granted for attendee case. |
| `resolved_at` | `timestamptz` | Yes | `—` | Current resolution time; cleared on reopening, history retained. |
| `updated_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Last case change. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `support_case_ck1`: `case_kind IN ('attendee','organizer_platform')`.
- `support_case_ck2`: `category IN ('delivery','payment','refund','seating','event_info','check_in','account','technical')`.
- `support_case_ck3`: `status IN ('open','in_progress','waiting_customer','resolved')`.
- `support_case_ck4`: `(status = 'resolved') = (resolved_at IS NOT NULL)`.
- `support_case_ck5`: `order_id IS NULL OR event_id IS NOT NULL`.
- `support_case_ck6`: `ticket_id IS NULL OR event_id IS NOT NULL`.
- `support_case_ck7`: `event_id IS NULL OR organization_id IS NOT NULL`.
- `support_case_ck8`: `case_kind <> 'attendee' OR (event_id IS NOT NULL AND organization_id IS NOT NULL)`.
- `fk_support_case_063`: (event_id, organization_id) -> `event` (id, organization_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_support_case_064`: (order_id, event_id) -> `ticket_order` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_support_case_065`: (ticket_id, event_id) -> `ticket` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_support_case_112`: (requester_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_support_case_113`: (assigned_to_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `support_message` — 14 Files and support

Append-only persisted message; delivery/reconnect does not duplicate it.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `case_id` | `uuid` | No | `—` | Thread. |
| `author_user_id` | `uuid` | No | `—` | Authorized participant at send time. |
| `client_message_id` | `uuid` | No | `—` | Client retry ID. |
| `body` | `text` | No | `—` | Plain/sanitized text. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `support_message_uq1`: UNIQUE (case_id, author_user_id, client_message_id).
- `support_message_uq2`: UNIQUE (id, case_id).
- `support_message_ck1`: `length(btrim(body)) > 0`.
- `fk_support_message_066`: (case_id) -> `support_case` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_support_message_114`: (author_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_case_cursor" ON "support_message" (case_id, created_at, id);`.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `support_attachment` — 14 Files and support

Protected attachment belongs to an actual persisted message and its case.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `case_id` | `uuid` | No | `—` | Scope for protected download. |
| `message_id` | `uuid` | No | `—` | Message in same case. |
| `file_id` | `uuid` | No | `—` | Clean, allowed attachment object. |
| `original_filename` | `text` | No | `—` | Display only; never used as filesystem path. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `support_attachment_uq1`: UNIQUE (file_id).
- `fk_support_attachment_067`: (message_id, case_id) -> `support_message` (id, case_id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_support_attachment_115`: (file_id) -> `stored_file` (id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.

### `case_change` — 14 Files and support

Append-only status, assignment, escalation and reopening history.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `case_id` | `uuid` | No | `—` | Thread. |
| `actor_user_id` | `uuid` | No | `—` | Actor. |
| `change_kind` | `text` | No | `—` | status, assignment or escalation. |
| `before_value` | `text` | Yes | `—` | Prior scalar value/user ID. |
| `after_value` | `text` | Yes | `—` | New scalar value/user ID. |
| `reason` | `text` | Yes | `—` | Explanation. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `case_change_ck1`: `change_kind IN ('status','assignment','escalation')`.
- `fk_case_change_068`: (case_id) -> `support_case` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_case_change_116`: (actor_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `notification` — 15 Delivery and audit

Durable user inbox and email intent; context pointers still require authorization.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `recipient_user_id` | `uuid` | No | `—` | Recipient. |
| `event_id` | `uuid` | Yes | `—` | Event context. |
| `kind` | `text` | No | `—` | Template/event code. |
| `locale` | `text` | No | `—` | Saved delivery locale. |
| `deduplication_key` | `text` | No | `—` | Stable business-operation notification key. |
| `safe_payload` | `jsonb` | No | `—` | Versioned allowlist; no card/password/session secrets. |
| `read_at` | `timestamptz` | Yes | `—` | In-app read state. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `notification_uq1`: UNIQUE (recipient_user_id, deduplication_key).
- `notification_ck1`: `locale IN ('kk','ru','en')`.
- `notification_ck2`: `jsonb_typeof(safe_payload) = 'object'`.
- `fk_notification_117`: (recipient_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_notification_118`: (event_id) -> `event` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_inbox" ON "notification" (recipient_user_id, created_at, id);`.

### `notification_delivery` — 15 Delivery and audit

One logical delivery per channel with retry bookkeeping.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `notification_id` | `uuid` | No | `—` | Message intent. |
| `channel` | `text` | No | `—` | email or in_app. |
| `status` | `text` | No | `'pending'` | pending, sent or failed. |
| `attempt_count` | `integer` | No | `0` | Increment on dispatch. |
| `next_attempt_at` | `timestamptz` | Yes | `—` | Retry schedule. |
| `provider_message_id` | `text` | Yes | `—` | Provider reference. |
| `sent_at` | `timestamptz` | Yes | `—` | Known success. |
| `last_error` | `text` | Yes | `—` | Redacted diagnostic. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `notification_delivery_uq1`: UNIQUE (notification_id, channel).
- `notification_delivery_ck1`: `channel IN ('email','in_app')`.
- `notification_delivery_ck2`: `status IN ('pending','sent','failed')`.
- `notification_delivery_ck3`: `attempt_count >= 0`.
- `notification_delivery_ck4`: `status <> 'sent' OR sent_at IS NOT NULL`.
- `fk_notification_delivery_069`: (notification_id) -> `notification` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `outbox_job` — 15 Delivery and audit

Durable job/event saved with business commit; leased for at-least-once delivery.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | Yes | `—` | Optional event scope. |
| `kind` | `text` | No | `—` | email, pdf, refund, reconcile, broadcast, analytics, etc. |
| `deduplication_key` | `text` | No | `—` | Unique logical side-effect key. |
| `payload` | `jsonb` | No | `—` | Versioned safe IDs/options; no plaintext tokens. |
| `status` | `text` | No | `'pending'` | pending, leased, done or dead. |
| `attempt_count` | `integer` | No | `0` | Attempts. |
| `available_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Next eligible run. |
| `lease_token` | `uuid` | Yes | `—` | Worker fencing token. |
| `lease_until` | `timestamptz` | Yes | `—` | Crash recovery deadline. |
| `completed_at` | `timestamptz` | Yes | `—` | Success time. |
| `last_error` | `text` | Yes | `—` | Redacted error. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `outbox_job_uq1`: UNIQUE (deduplication_key).
- `outbox_job_ck1`: `status IN ('pending','leased','done','dead')`.
- `outbox_job_ck2`: `attempt_count >= 0`.
- `outbox_job_ck3`: `jsonb_typeof(payload) = 'object'`.
- `outbox_job_ck4`: `(status = 'leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (status <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)`.
- `outbox_job_ck5`: `status <> 'done' OR completed_at IS NOT NULL`.
- `fk_outbox_job_119`: (event_id) -> `event` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_jobs_ready" ON "outbox_job" (available_at, created_at) WHERE status = 'pending';`.
- Index: `CREATE INDEX "ix_jobs_lease" ON "outbox_job" (lease_until) WHERE status = 'leased';`.

### `idempotency_record` — 15 Delivery and audit

Request deduplication; commit result with business effect, never cache auth bypass.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `actor_user_id` | `uuid` | No | `—` | Authenticated actor; provider callbacks have separate inbox. |
| `operation` | `text` | No | `—` | Endpoint/business action namespace. |
| `request_key` | `text` | No | `—` | Client key. |
| `request_hash` | `text` | No | `—` | Canonical payload digest. |
| `resource_type` | `text` | No | `—` | Result entity type, informational not a polymorphic FK. |
| `resource_id` | `uuid` | No | `—` | Result entity ID; returned only after current authorization. |
| `response_code` | `integer` | No | `—` | Original successful response code. |
| `expires_at` | `timestamptz` | No | `—` | Retention deadline; irreversible entities retain independent unique keys. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `idempotency_record_uq1`: UNIQUE (actor_user_id, operation, request_key).
- `idempotency_record_ck1`: `response_code BETWEEN 200 AND 299`.
- `idempotency_record_ck2`: `expires_at > created_at`.
- `fk_idempotency_record_120`: (actor_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `audit_log` — 15 Delivery and audit

Append-only authorized activity timeline; immutable safe entity snapshots.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | Yes | `—` | Event scope. |
| `organization_id` | `uuid` | Yes | `—` | Workspace scope. |
| `actor_user_id` | `uuid` | Yes | `—` | NULL when service actor used. |
| `service_actor` | `text` | Yes | `—` | Worker/simulator identity when user absent. |
| `action` | `text` | No | `—` | Stable operation code. |
| `entity_type` | `text` | No | `—` | Whitelisted affected entity kind. |
| `entity_id` | `uuid` | No | `—` | Historical target ID; deliberately not a generic FK. |
| `description` | `text` | No | `—` | Short safe description. |
| `safe_change` | `jsonb` | No | `'{}'::jsonb` | Limited before/after fields, no secrets or full messages. |
| `correlation_id` | `uuid` | No | `—` | Operation trace. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `audit_log_ck1`: `num_nonnulls(actor_user_id,service_actor) = 1`.
- `audit_log_ck2`: `jsonb_typeof(safe_change) = 'object'`.
- `audit_log_ck3`: `event_id IS NULL OR organization_id IS NOT NULL`.
- `fk_audit_log_070`: (event_id, organization_id) -> `event` (id, organization_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_audit_log_121`: (actor_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_event_timeline" ON "audit_log" (event_id, created_at, id);`.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `event_report` — 16 Administration and analytics

Signed-in report about accessible event.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `event_id` | `uuid` | No | `—` | Reported event. |
| `reporter_user_id` | `uuid` | No | `—` | Reporter. |
| `category` | `text` | No | `—` | Reason code. |
| `description` | `text` | No | `—` | Reporter explanation. |
| `status` | `text` | No | `'open'` | open, reviewing or resolved. |
| `resolved_by_user_id` | `uuid` | Yes | `—` | Platform reviewer. |
| `resolution` | `text` | Yes | `—` | Resolution explanation. |
| `resolved_at` | `timestamptz` | Yes | `—` | Completion time. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `event_report_ck1`: `status IN ('open','reviewing','resolved')`.
- `event_report_ck2`: `status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution IS NOT NULL)`.
- `fk_event_report_122`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_report_123`: (reporter_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_event_report_124`: (resolved_by_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE UNIQUE INDEX "uq_open_report" ON "event_report" (event_id, reporter_user_id, category) WHERE status IN ('open','reviewing');`.

### `moderation_action` — 16 Administration and analytics

Append-only moderation evidence; exactly one real target.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `actor_user_id` | `uuid` | No | `—` | Platform admin. |
| `target_user_id` | `uuid` | Yes | `—` | Account target. |
| `target_event_id` | `uuid` | Yes | `—` | Event target. |
| `target_activation_id` | `uuid` | Yes | `—` | Paid-sales target. |
| `action` | `text` | No | `—` | suspend or reinstate. |
| `reason` | `text` | No | `—` | Required reason. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `moderation_action_ck1`: `num_nonnulls(target_user_id,target_event_id,target_activation_id) = 1`.
- `moderation_action_ck2`: `action IN ('suspend','reinstate')`.
- `moderation_action_ck3`: `length(btrim(reason)) > 0`.
- `fk_moderation_action_071`: (target_event_id) -> `event` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_moderation_action_072`: (target_activation_id) -> `sales_activation` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_moderation_action_125`: (actor_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_moderation_action_126`: (target_user_id) -> `app_user` (id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `platform_setting_version` — 16 Administration and analytics

Append-only versioned settings; current version selected by effective time/version.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `setting_key` | `text` | No | `—` | Whitelisted supported setting. |
| `version` | `integer` | No | `—` | Increasing per key. |
| `value` | `jsonb` | No | `—` | Typed by setting registry in application. |
| `effective_at` | `timestamptz` | No | `—` | When setting applies to new operations. |
| `actor_user_id` | `uuid` | No | `—` | Platform admin. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `platform_setting_version_uq1`: UNIQUE (setting_key, version).
- `platform_setting_version_ck1`: `version > 0`.
- `fk_platform_setting_version_127`: (actor_user_id) -> `app_user` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- Index: `CREATE INDEX "ix_effective_settings" ON "platform_setting_version" (setting_key, effective_at, version);`.
- Immutable-history trigger rejects UPDATE and DELETE. INSERT remains allowed to the authorized service.

### `ga4_connection` — 16 Administration and analytics

Optional organization-scoped analytics property configuration.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `organization_id` | `uuid` | No | `—` | Owner. |
| `property_id` | `text` | No | `—` | GA4 property identifier. |
| `secret_reference` | `text` | No | `—` | Reference in secret manager; not credential material. |
| `is_enabled` | `boolean` | No | `false` | External dependency switch. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `ga4_connection_uq1`: UNIQUE (organization_id).
- `fk_ga4_connection_128`: (organization_id) -> `organization` (id); child has **1** parent; parent has **0..1** children; DELETE/UPDATE RESTRICT.

### `analytics_export` — 16 Administration and analytics

Deduplicated allowlisted optional traffic/commerce measurement.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `connection_id` | `uuid` | No | `—` | Analytics destination. |
| `event_id` | `uuid` | No | `—` | Authorized event. |
| `order_id` | `uuid` | Yes | `—` | Optional canonical order. |
| `refund_id` | `uuid` | Yes | `—` | Optional refund. |
| `measurement_kind` | `text` | No | `—` | purchase, refund or other allowlisted server event. |
| `analytics_event_id` | `uuid` | No | `—` | Separate nonsecret analytics dedupe ID. |
| `safe_payload` | `jsonb` | No | `—` | No names, email, ticket identifiers, QR/session tokens. |
| `status` | `text` | No | `'pending'` | pending, sent, skipped or failed. |
| `sent_at` | `timestamptz` | Yes | `—` | Provider dispatch outcome. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `analytics_export_uq1`: UNIQUE (analytics_event_id).
- `analytics_export_uq2`: UNIQUE (connection_id, order_id, measurement_kind).
- `analytics_export_uq3`: UNIQUE (connection_id, refund_id, measurement_kind).
- `analytics_export_ck1`: `status IN ('pending','sent','skipped','failed')`.
- `analytics_export_ck2`: `jsonb_typeof(safe_payload) = 'object'`.
- `fk_analytics_export_073`: (connection_id) -> `ga4_connection` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_analytics_export_074`: (order_id, event_id) -> `ticket_order` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_analytics_export_075`: (refund_id, event_id) -> `refund` (id, event_id); child has **0..1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

### `ga4_cache` — 16 Administration and analytics

Disposable event-scoped traffic aggregates; never financial truth.

| Column | PostgreSQL type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key; immutable. |
| `connection_id` | `uuid` | No | `—` | Analytics source. |
| `event_id` | `uuid` | No | `—` | Event filter scope. |
| `query_hash` | `text` | No | `—` | Hash of canonical date range/dimensions/filters. |
| `range_start` | `date` | No | `—` | Inclusive period. |
| `range_end` | `date` | No | `—` | Exclusive period. |
| `metrics` | `jsonb` | No | `—` | Versioned aggregate values, not raw visitor records. |
| `fetched_at` | `timestamptz` | No | `—` | Freshness. |
| `expires_at` | `timestamptz` | No | `—` | Cache deadline. |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` | Server creation timestamp. |

**Primary key:** `id`.
- `ga4_cache_uq1`: UNIQUE (connection_id, event_id, query_hash).
- `ga4_cache_ck1`: `range_end > range_start`.
- `ga4_cache_ck2`: `expires_at > fetched_at`.
- `ga4_cache_ck3`: `jsonb_typeof(metrics) = 'object'`.
- `fk_ga4_cache_076`: (connection_id) -> `ga4_connection` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.
- `fk_ga4_cache_129`: (event_id) -> `event` (id); child has **1** parent; parent has **0..*** children; DELETE/UPDATE RESTRICT.

## 10. Query and integration contracts

- Current seat availability derives from event_seat.is_blocked plus the one live allocation. Accessible is venue_seat.is_accessible, not a sale state. Expired-but-active holds remain occupied until cleanup acquires the mutex.
- General-admission available count = allowed capacity minus all held/sold/refund_quarantine allocations, bounded by ticket-type and event limits. Sold percentage uses sold/quarantine allocations, not released historical tickets. Separate held and refund-pending counts.
- Fulfilled sales use ticket_order.confirmed_at and immutable item snapshots. Aggregate order totals before joining payment_attempt or check_in history to avoid multiplying amounts. Cumulative gross sales and current occupied inventory are different metrics.
- Successful charged amounts and successful refunds come from attempt/refund records. finance_entry is an append-only organizer balance model: recognize ticket charges (including charges awaiting compensation) as sale credit plus fee debit; block unresolved/compensating amounts from payout; refund adds debit and fee reversal adds credit. Activation charge is debit; a compensating duplicate activation refund is activation_refund credit. An ordinary activation fee remains nonrefundable under the proposed demo policy.
- Fees reversed by demo simulator use separate fee_reversal entries. Do not count activation_refund as ticket refund revenue. Provider sandbox settlement semantics must be matched by the adapter; demo payout only operates on simulation balance.
- Pending/eligible payouts reserve amount; sent payout has one negative ledger entry, so do not subtract sent amount twice. Pending refund liabilities also reduce payable amount. Later successful refund can make balance negative after a prior payout, as an explicit adjustment.
- Case/event history and inbox cursors use stable (created_at,id) ordering. Server receipt time is distinct from offline captured_at; timestamps from devices never establish globally earliest entry.
- ICS is generated from event data, calendar_uid and calendar_sequence; cancellation uses same UID and increased sequence. No calendar token or account table is required.
- GA4 connection must match event organization; exports honor consent and remove PII, ticket IDs and sensitive URL parameters. Keep transaction/analytics IDs distinct. Cache failure is unavailable, not zero operational sales.
- UUID equality/foreign keys are not authorization. Every row, downloaded file and live subscription must be scoped to the current account and relationship.

## 11. Validation and implementation checklist

The accompanying validation report records what was actually executed. Do not confuse a successful DDL load with complete application correctness. Before implementation acceptance, test:

1. Concurrent last-seat/general-admission reservation and promo-limit exhaustion using independent PostgreSQL connections.
2. Duplicate/out-of-order callbacks, payment amount mismatch, late/extra success and compensation without extra ticket issuance.
3. Refund/check-in race, refund failure/retry, release after success, and rebuy with different IDs while old rows remain.
4. Same-event/same-org FK rejection, revoked staff/session denial, private-file and support-context isolation.
5. Concurrent scanner admission, reversal consistency, stale offline upload and same operation key with changed payload.
6. Payout reservation versus refund race, post-payout adjustment, exact fee/discount/revenue reconciliation.
7. Worker crash before/after external side effect, lease fencing, durable outbox retry and restore with preserved keys.
8. Full integration with the requirements acceptance scenarios AC-01 through AC-28.

## 12. Sources and regeneration

- Local authority: `../BiletFlow_Backend_Requirements.md` and the user-confirmed decisions recorded there.
- [PostgreSQL constraint semantics](https://www.postgresql.org/docs/current/ddl-constraints.html): row checks, foreign keys and conditional uniqueness.
- [draw.io XML generation reference](https://www.drawio.com/docs/reference/diagram-generation/): editable mxfile structure and validation.
- [draw.io style reference](https://www.drawio.com/docs/reference/diagram-generation/style-reference/): class compartments, native shapes and connectors.
- [PGlite documentation](https://pglite.dev/docs/): disposable PostgreSQL/WASM validation runtime when native PostgreSQL is unavailable.

Regenerate using `python tools/build_database_schema.py` from the project root. `schema_model.json` is the shared design source. It is not an application ORM model. Hand edits in draw.io remain editable, but regenerating will replace them; reflect lasting changes in the shared model/builder first.
