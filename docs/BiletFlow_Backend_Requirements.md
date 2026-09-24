# BiletFlow: complete backend requirements and delivery plan

Status: shared requirements baseline; BF-01 authentication and the Stage B organizer/event setup increment are implemented in `../backend` on 24 September 2026. The latter covers workspaces/invitations, scoped permissions, event discovery/lifecycle, ticket-type configuration and predefined seating; see [API scope and remaining work](../backend/CATALOG_API.md). Checkout, payment/refund processing, admission and later modules remain planned. Event images and downstream event notifications also remain. Live Google consent requires OAuth credentials; client UI integration remains separate.  
Stack: FastAPI + PostgreSQL.  
Scope: backend services and contracts used by attendee/organizer web, platform-admin web, and the iOS/Android scanner app.  
Source: `BiletFlow_SRS_Initial_Draft.pdf`, version 0.3, supplemented by the user's confirmed decisions.  
Prepared: 22 September 2026.

## 1. Confirmed scope and interpretation

The user's decisions take precedence over the draft. All required SRS features and its bonus features are in this project's scope. The SRS's calendar and seating contradictions are resolved by including both. Its suggested schedule is not used.

Confirmed decisions:

- Use FastAPI and PostgreSQL, with one primary backend implementation.
- Include Google sign-in alongside email/password authentication. Use signed short-lived access JWTs and store only hashed refresh tokens in separate revocable session records (confirmed 24 September 2026). JWT signing is not encryption; access JWTs are not persisted.
- Anonymous visitors may browse. Registration/sign-in is required to obtain tickets and to participate in event admission; scanner staff must also sign in.
- Support multiple organizer staff and multiple scanners for each event.
- Invalidate tickets before initiating an approved refund. Do not resell the released seat/capacity until the refund succeeds. A later purchase receives a new ticket and QR code.
- Include assigned seating, calendar export, advanced GA4 analytics, offline verification synchronization, support attachments, and real-time support messages.
- Start with academic payments, but describe a credible route to a payment-provider integration.
- Use Ticketon as a reference for realistic dummy prices, without representing invented fees as Ticketon tariffs.
- Plan by dependencies and completion criteria, not days or weeks.

### 1.1 Planning defaults, explicitly distinguished from confirmed decisions

These make the specification concrete. They are proposed product rules, not claims that the user or SRS already specified them.

| Topic | Proposed baseline |
|---|---|
| Application structure | One modular FastAPI application; background worker from the same codebase |
| Organizations | An organizer workspace has one owner and multiple staff; permissions can be restricted to assigned events |
| Ticket recipients | Buyer can buy multiple tickets and nominate recipients by email; each recipient must link their ticket to a verified account before admission |
| Admission sign-in | A signed-in attendee creates a short-lived entry confirmation; the scanner validates it with the ticket. Printed ticket alone does not prove sign-in |
| Refund amount | Full-order refunds of the amount actually paid; no partial refunds or refund deductions in the academic baseline |
| Voluntary refunds | Organizer sets whether allowed and a cutoff before event start; checked-in orders require authorized reversal/review before a normal refund |
| Event cancellation | Stop sales and check-in, invalidate outstanding tickets, and enqueue refunds for paid orders; never reopen cancelled-event inventory for purchase |
| Refunded inventory | Release after confirmed refund success; whether it is purchasable still depends on event status, sales window, and suspension rules |
| Payment simulation | Required, including controlled success, failure, delay, retry, refund failure, and reconciliation scenarios |
| Provider sandbox | A separate integration extension; credentials and provider access determine whether it can be demonstrated |
| Promo stacking | One code per order; percentage or fixed-KZT discount; never below zero |
| Promo usage | One redemption per successful order; refund does not replenish the campaign's lifetime redemption allowance |
| Holds | Ten-minute demonstration checkout hold, including reserved promo allowance; server clock is authoritative |
| Money | KZT, exact minor-unit integers or fixed decimals; no floating-point amounts |
| Locales | Kazakh and Russian, with English supported as an additional locale; user-authored content is not automatically translated |
| Offline admission | Provisional verification and queued operations; final admission waits for connectivity under the confirmed signed-in admission rule |
| Audit retention | Retain academic event/transaction/audit history through the project lifecycle; production retention remains a separate policy decision |

### 1.2 Still excluded

Real-money payouts and production financial operation; production KYC/KYB; arbitrary venue imports and visual layout designer; production-grade offline guarantees; advanced disputes/chargebacks and partial refunds; app-store publication; resale/transfer marketplace; native attendee/organizer apps; affiliates; recurring events; advanced marketing automation; entry hardware; multi-organizer payout splits; tax/accounting automation; full field-level version history and rollback.

Initial recipient assignment is included to satisfy signed-in admission for multi-ticket purchases. It is not a resale or post-assignment transfer service.

## 2. Architecture and shared rules

### 2.1 Minimum application shape

- **FastAPI application:** versioned REST API, authenticated WebSocket connections for support and live updates, shared business rules.
- **PostgreSQL:** authoritative source for users, permissions, event inventory, orders, money records, admission, support, and audit history.
- **Background worker:** durable work for email, PDF generation, refunds, provider reconciliation, expired holds, analytics export, and retryable notifications. Persist jobs/outbox records in PostgreSQL; a particular queue product is not required.
- **Object storage:** event images, PDFs, and protected support attachments. Use an S3-compatible service for the Docker demonstration.
- **Email delivery:** transactional provider or an explicitly labelled local mail viewer in demonstrations.
- **Docker Compose:** API, worker, database, storage, and demo email service, with documented environment configuration.

Use module boundaries inside one application, not separately deployed microservices. Shared transaction handling is particularly important for inventory, campaigns, payments, refunds, and check-in.

### 2.2 Rules every module must obey

1. Check both the user's role and their relationship to the target event, organization, order, or support case. Knowing an ID never grants access.
2. Validate and calculate prices, discounts, availability, permissions, and state transitions on the server.
3. Use PostgreSQL transactions, conditional updates, and uniqueness constraints to prevent overselling, over-redemption, and duplicate admission. A read-then-write check without concurrency protection is insufficient.
4. Make checkout creation, provider notifications, ticket issuance, refund initiation/completion, and check-in safe to retry. Reusing an operation key with a different payload must fail.
5. Record business changes and their audit/outbox work in the same database transaction. External provider requests happen after that commit, with durable retry/reconciliation.
6. Store UTC timestamps plus the event's named time zone. Return timestamps with offsets; never infer event time from a browser's locale.
7. Preserve order-time prices, discount allocations, fee rules, refund policy, and seat identifiers. Later edits must not rewrite historical purchases.
8. Deny new purchases when an event is cancelled, suspended, unpublished, outside its registration window, or out of eligible inventory.
9. Explicitly label every simulated financial record and keep simulated and provider records distinguishable.
10. A campaign QR is a promotional link; a ticket QR identifies a ticket; an entry confirmation proves a recent authenticated attendee action. Never interchange these token purposes.
11. Paginate lists, validate filters, and cap bulk operations. Errors need stable machine-readable codes and safe user-facing messages.
12. Commit the core business result even if an email, analytics exporter, or WebSocket delivery is temporarily unavailable; retry those deliveries independently.

## 3. Roles and authorization

Permissions are cumulative: the same account may be an attendee, organizer, and scanner for different events.

| Actor | Allowed access | Important restrictions |
|---|---|---|
| Anonymous visitor | Public discovery, permitted event pages, prices, public seat availability, campaign landing links | No checkout, private personal records, or admission actions |
| Registered attendee/buyer | Own orders, assigned tickets, entry confirmations, permitted support cases and refund requests | Cannot see another buyer's payment details; must satisfy private-event access rules |
| Organizer owner | Organization profile, events, staff assignment, sales activation, finance, support, analytics and history | Only their organization; cannot self-grant platform-admin privileges |
| Organizer staff | Event editing, attendee management, support, reporting or refunds according to granted permissions | Finance/refunds and staff management are explicit permissions, not implicit in all staff roles |
| Event scanner | Assigned events, minimum attendee lookup data, verification, check-in and permitted reversals | No payout information, unrelated events, or broad organizer administration |
| Platform admin | Moderation, activation inspection, platform settings, operational search/reports and escalated support | Privileged changes are audited; ticket ownership still cannot be changed casually |
| Background/provider actor | Narrow internal jobs or authenticated callbacks | Cannot use public caller-supplied roles to bypass authorization |

Private events require an explicit invitation/access grant, including for signed-in users. Unlisted events can be opened through their link but do not appear in public discovery. Public preview of a draft requires an owner/staff permission; an unpublished draft must not leak through catalog endpoints.

## 4. Feature catalogue: requirements, flows, and completion checks

Each numbered feature below is required for the agreed full academic scope. Provider sandbox/live operation is separately identified where conditional.

### BF-01. Accounts, authentication, and session management

**Purpose:** establish the identity used for ticket ownership, staff permissions, and admission.

**Requirements**

- Register by email, verify email, sign in/out, refresh an authenticated session, reset forgotten passwords, and view/update a basic profile and preferred locale.
- Email verification and password reset tokens are single-use and expire. Passwords are securely hashed, never recoverable plaintext.
- Maintain revocable sessions for web and mobile; password reset and account suspension revoke relevant sessions.
- Require verified accounts for registration/checkout and event admission. Anonymous users can inspect public event inventory without creating a hold.
- Apply rate limits to login, verification/resend, reset, invitations, entry confirmations, and token validation.

**Flow:** register -> receive verification email -> verify -> sign in -> return to intended event -> perform authorized action. Logout revokes the session. Password reset verifies its one-use token, updates the password, and ends old sessions.

**Completion checks:** unverified/anonymous checkout is rejected; expired and reused reset tokens fail; a revoked session cannot create a new order or check-in confirmation; failed login does not expose whether an email exists.

**Current implementation (24 September 2026):** `backend/` provides registration, verification/resend, email/password and Google sign-in, explicit authenticated Google account linking, refresh rotation/replay detection, logout/all-session revocation, password recovery, profile updates, session listing/revocation, durable email delivery, shared rate limits and PostgreSQL migrations/tests. See [backend setup and API contract](../backend/README.md). Access JWTs last ten minutes by default; session lifetime is thirty days without sliding extension. Web refresh tokens use HttpOnly cookies and origin checks; scanner refresh tokens use protected device storage. Matching a Google email never silently merges accounts. Google-only users have a nullable password hash and may add a password through email recovery. These are implementation defaults, distinct from confirmed product decisions. Checkout/admission services and client screens are still unimplemented; their future use of the verified-account/session guard must be tested when those modules are added.

### BF-02. Organizer workspace, profiles, and staff

**Purpose:** support several people operating the same events without giving every user every permission.

**Requirements**

- Create an organizer workspace/profile with contact information and a protected simulated payout profile.
- Invite existing/new accounts, accept expiring invitations, assign event-scoped permissions, list staff, and revoke assignments.
- Separate event editing, support, reports, refunds, scanner admission, reversal, and staff-management permissions.
- Allow several organizer staff and several scanners on one event. Prevent removal of the last owner through ordinary staff management.
- Revocation takes effect on the next online request and closes unauthorized live connections; offline revocation limitations are handled by BF-12.

**Flow:** owner creates workspace -> invites staff -> staff sign in and accept -> owner assigns events and capabilities -> staff see only their allowed events/actions -> owner may revoke access.

**Completion checks:** scanner-only users cannot refund or edit an event; removing a staff assignment blocks further online access; staff of organizer A cannot read organizer B's records.

### BF-03. Event lifecycle, discovery, and visibility

**Purpose:** create and expose physical venue-based events while preserving historical records.

**Requirements**

- Create, edit, preview, duplicate, publish, unpublish, and cancel events.
- Store title, description, category, images, venue/address, start/end time, named time zone, visibility, capacity, registration window, and refund policy.
- Public listing supports pagination and filters for date, category, location, and price/free status, plus a basic title search.
- Support public, unlisted, and private visibility with consistent access across detail, availability, media, campaign, and calendar endpoints.
- Validate publication prerequisites: valid venue/time, capacity, and at least one usable ticket type. Paid sales remain gated independently by activation.
- Classify noncancelled events as Upcoming, Active, or Completed using event times. Keep this separate from draft/published/unpublished status and moderation suspension.
- Notify affected attendees about material changes and cancellation. Do not allow venue/seating edits that invalidate allocated seats.

**Flow:** organizer saves draft -> configures venue and tickets -> previews -> publishes -> permitted visitors discover/open it -> sales follow configured windows -> event becomes active/completed -> history remains accessible. Cancellation follows BF-13.

**Completion checks:** private/unlisted events do not leak through catalog search; drafts cannot be purchased; unpublishing preserves existing orders/tickets but stops new sales; duplication creates a new draft without old transactions, staff assignments, active campaigns, activation payment, or support cases.

### BF-04. Venues, assigned seating, and capacity

**Purpose:** support both general admission and seat-specific sales.

**Requirements**

- Provide at least one seeded venue layout with sections, rows, numbered seats, accessibility flags, price categories, and coordinates/labels needed by the web seat map.
- Organizer chooses general admission or assigned seating before sales, then configures that event's layout, ticket-category mapping, and blocked seats.
- Store event-specific seat availability: the same physical venue can host different events independently.
- Return available, held, sold, blocked/unavailable, and refund-pending states. Accessible is a seat attribute, not an availability state. Selected-but-not-held is local client state.
- Validate seat selections and category prices server-side. Enforce event capacity and ticket-type limits together.
- Do not delete/relabel allocated seats or reduce capacity below committed inventory, including paid, refund-pending, and active holds.
- Supply prompt availability refresh through updates or bounded polling; all purchase decisions still revalidate in PostgreSQL.

**Flow:** organizer selects layout -> enables/blocks seats and maps price categories -> visitor views map -> signed-in attendee selects seats -> backend attempts hold -> seats become held or a conflict explains why selection failed.

**Completion checks:** two events at one venue have independent inventory; concurrent requests for one seat yield at most one hold; the layout exposes accessible labels and readable seat identifiers; occupied seats cannot disappear through editing.

### BF-05. Ticket types and inventory holds

**Purpose:** configure saleable inventory and protect it during checkout.

**Requirements**

- Create free/paid ticket types with name, description, price, quantity, sale dates, visibility, and per-order limit.
- Hide a ticket type without deleting its orders; changing its current price does not change existing orders.
- Return distinct available, reserved, issued, refund-pending, refunded, cancelled, and checked-in counts. Document which counts are historical versus current.
- Create expiring holds for general-admission quantities and assigned seats only for authenticated, eligible accounts.
- Enforce event capacity across ticket types and purchases across simultaneous requests. Prevent abuse through bounded active holds per account.
- Release expired/abandoned holds and pending campaign allowances reliably, including after worker restarts.
- Treat hold expiry using server time; do not let a client countdown extend the reservation.

**Flow:** select quantity/seats -> server validates account, event, ticket type, limits, price and capacity -> reserve atomically -> return hold ID and expiry -> commit to an order on successful free registration/payment, or release on expiry/cancellation.

**Completion checks:** simultaneous purchases of the last general-admission place never oversell; repeated requests with the same operation key do not create extra holds; expired holds cannot issue tickets; inventory is correct after restart.

### BF-06. Paid-sales activation and payout profile

**Purpose:** gate paid checkout independently for each event.

**Requirements**

- Expose checklist status: paid ticket exists, simulated identity verification complete, payout profile valid, current terms accepted, activation fee paid.
- Store verification result, terms version/time, activation payment reference, fee snapshot, event, and actor.
- Support incomplete, pending, active, failed, and suspended activation states with clear failure reasons.
- Activation is event-specific. Duplicating an event never copies its activation.
- Platform admins may suspend/reinstate paid sales with a recorded reason. Event suspension can separately stop all sales/admission.
- Free registrations remain possible when only paid sales are inactive, provided other event rules allow them.

**Flow:** organizer opens checklist -> completes demo verification/payout details -> accepts terms -> pays simulated activation fee -> backend confirms every prerequisite -> marks paid sales active. Failed activation payment leaves sales locked and allows a safe retry.

**Completion checks:** creating a paid ticket alone cannot enable sales; a fee payment alone is insufficient if verification is missing; activation for event A cannot unlock event B; suspension blocks new paid checkout and is rechecked at fulfillment.

### BF-07. Checkout, free registrations, and order ownership

**Purpose:** turn reserved inventory into a durable purchase/registration record.

**Requirements**

- Sign-in is required before reserving or checking out, including for free tickets. Preserve selected event/campaign context across the sign-in redirect but revalidate it afterward.
- Collect buyer and attendee details needed for ticket delivery/admission; do not add demographic questions for analytics.
- Support several order items and attendee recipients; separate purchaser/payment ownership from ticket-recipient access.
- Calculate subtotal, eligible discount, processing charge, amount payable, and organizer estimate on the server; persist the quote and policy snapshots.
- At most one campaign applies. An expired quote/hold requires a fresh quote; never silently increase the accepted price.
- A zero-total order completes without card information or a payment-provider call. A 100%-discounted paid ticket still requires that the event is activated for paid sales.
- Return clear order and payment states, not a misleading success response while payment is pending.

**Flow:** browse -> sign in -> select items/recipients -> obtain hold and quote -> optionally apply campaign -> confirm -> free/zero-total order finalizes atomically; otherwise initiate BF-08 -> issue tickets after confirmed success -> display order and send delivery notifications.

**Completion checks:** client-edited price/discount is ignored or rejected; free registration creates an order with zero total; failed payment never produces usable tickets; refreshing confirmation does not issue a second ticket set.

### BF-08. Payments, simulation, and provider integration boundary

**Purpose:** model realistic payment behavior without presenting demo money as real funds.

**Requirements**

- Required simulator handles payment success/failure, pending outcomes, repeated/out-of-order notifications, timeout, late success, refunds, and failed refunds.
- Keep order state separate from individual payment attempts; at most one successful fulfillment per order. Detect and refund/reconcile an extra successful charge rather than issuing extra tickets.
- Verify payment reference, expected amount, currency, environment, and authoritative outcome before fulfillment. Browser redirects are not proof of payment.
- Authenticate provider callbacks using the selected provider's documented method; deduplicate incoming events. Internal simulation controls are available only in the demo environment to authorized testers.
- Reconcile uncertain payments by querying authoritative status. Unknown status is not equivalent to failure.
- On late success after inventory was released, do not take a seat sold to another order: record the charge, issue no ticket, and initiate a compensating full refund.
- If event cancellation/suspension prevents fulfillment, preserve the payment record and handle refund/reconciliation explicitly.
- Store provider references and safe metadata; never accept/store card PAN/CVV in BiletFlow. Prefer provider-hosted payment entry for any provider demo.

**Flow:** persist pending order/payment attempt -> ask simulator/provider to initialize payment -> attendee completes payment -> authenticated result/status lookup reaches backend -> transaction validates order and inventory -> finalizes order, consumes inventory/promo reservation, creates canonical tickets and notification jobs -> client reads final result.

**Provider extension:** implement the same boundary for one sandbox when access is available: initialize payment, query status, accept verified notification, request refund, and query refund outcome. Keep simulator operational for deterministic tests. Do not implement several providers merely for completeness.

**Completion checks:** duplicate callbacks cannot duplicate tickets or revenue; tampered amount/currency fails; the late-payment path refunds without overselling; timeouts can be reconciled after process restart.

### BF-09. Promo campaigns and campaign QR codes

**Purpose:** apply controlled discounts and attribute orders to campaigns.

**Requirements**

- Authorized organizer staff create/edit/disable campaigns per event with unique codes, percent or fixed-KZT discounts, validity dates, applicable ticket types, and maximum redemptions.
- Generate a distinct campaign QR/image with an HTTPS event link containing an opaque token; never trust a discount embedded in the URL.
- Resolve the campaign for permitted event viewers and preserve it through sign-in. A campaign link does not bypass private-event access controls.
- Show eligibility, applied discount, and final amount before purchase; report expired, disabled, exhausted, or inapplicable codes clearly.
- Reserve redemption allowance during checkout; release it when checkout fails/expires; consume exactly once on completed order. Revalidate disabling/validity before fulfillment; if invalid, require a fresh quote rather than charging a higher amount automatically.
- Percentage applies only to eligible lines. Fixed discount applies once to eligible subtotal and is capped at it. Allocate discount across eligible items deterministically so totals/refunds reconcile.
- Record campaign, code, eligible items, discount, order, and redemption. Retain attribution after campaign edits and refunds.
- Admission validation must reject campaign tokens before attempting ticket admission.

**Flow:** organizer creates campaign -> receives code/link/QR -> visitor scans -> correct event opens -> sign-in if buying -> server validates code and reserves allowance with inventory -> checkout finalizes -> redemption and revenue attribution are recorded.

**Completion checks:** concurrent checkouts cannot exceed campaign allowance; modified URL discount values have no effect; mixed eligible/ineligible tickets discount only eligible items; a campaign QR never admits a person.

### BF-10. Digital tickets, account assignment, PDF and delivery

**Purpose:** issue one canonical ticket per admission, available electronically and on paper.

**Requirements**

- Ticket record contains unique ID, event, ticket type, order item, recipient, applicable section/row/seat, issued time, and current validity status.
- Use unguessable/tamper-resistant ticket tokens with an explicit token purpose. Do not expose personal details inside QR payloads.
- Issue tickets only from fulfilled zero-value orders or confirmed paid orders.
- Link nominated recipients to verified accounts through authenticated claim/invitation flow. A signed-in account with a different email cannot claim someone else's ticket merely by guessing an ID.
- Buyer sees their order and its ticket delivery status; recipients see their own assigned tickets, not the buyer's full financial/order data.
- Email ticket delivery and make tickets available through authenticated web accounts.
- Generate print-ready PDF with event name/time/venue, ticket type, attendee, seat if applicable, ticket ID, and clear QR code. Support A4 and grayscale. Include no payment-card data.
- PDF, email, and screen represent the same ticket; downloading twice never creates another admission. Admission still consults current server/snapshot state.
- Resending delivery does not rotate or duplicate a ticket by default. Refunded tickets remain in history but cannot regain validity through an old PDF.

**Flow:** order fulfills -> canonical ticket records created -> recipients are linked/invited -> delivery/PDF jobs run -> attendee signs in to view/download -> attendee prepares entry confirmation for BF-11.

**Completion checks:** one order item quantity maps to exactly that many tickets; PDF QR matches the canonical ticket; unauthorized downloads fail; old copies of refunded tickets are rejected online; a delivery failure does not cancel a successful order.

### BF-11. Online scanner verification and signed-in attendee admission

**Purpose:** admit the correct registered attendee exactly once through an authorized scanner.

**Requirements**

- Scanner signs in, receives assigned events, selects one, and sees only the minimum attendee data needed for entry.
- Attendee must also be signed in. Proposed mechanism: authenticated attendee requests a short-lived, event/ticket-bound entry confirmation. It can be displayed with the digital ticket or paired with a printed ticket using a short-lived confirmation code.
- A durable PDF QR by itself proves possession of a ticket, not current account sign-in. Do not treat it as sufficient for the confirmed admission rule.
- Online check-in validates scanner assignment, attendee entry confirmation/session, event, ticket authenticity, recipient association, admission window, ticket state, and lack of a current check-in.
- Successful validation and admission are a single atomic operation. A read-only preview is allowed but never guarantees a later check-in.
- Return explicit valid/admitted, invalid, wrong-event, expired confirmation, sign-in-required, cancelled/refunded/refund-pending, already-used, and not-authorized outcomes.
- Manual attendee search/check-in uses the same rules as QR entry; it is not an authentication or refund bypass.
- Record scanner, device, actor, ticket, event, timestamp, operation ID, and source. Provide registered and admitted counts.
- Authorized reversal needs a reason and audit record. Preserve prior check-in history; consume a fresh attendee confirmation on subsequent admission.

**Flow:** attendee signs in and opens ticket/entry confirmation -> scanner signs in and selects assigned event -> scans -> backend validates and atomically records check-in -> scanner receives admitted result -> concurrent scans receive already-used. On accidental entry, an authorized user reverses it with a reason.

**Completion checks:** two online scanners racing on one ticket yield one admission; anonymous requests cannot create entry confirmation; campaign QR is rejected; refund initiation and check-in racing cannot both treat a ticket as valid; unauthorized reversal fails.

### BF-12. Offline verification and synchronization

**Purpose:** demonstrate controlled disconnected operation and reconciliation, without claiming impossible real-time guarantees.

**Requirements**

- Scanner authenticates online first and explicitly downloads a limited, expiring, event-specific verification package with authorized device/session, ticket verification data, current revocations, and snapshot version.
- Provide signed, short-lived attendee entry confirmations that can be verified offline. These prove recent authenticated issuance; they cannot prove that a remote session is still active after disconnection.
- Store the minimum encrypted local data needed for verification. Device retains local accepted/reversed operations with unique operation IDs, sequence numbers, captured timestamp, and snapshot version.
- Locally reject wrong-event, campaign, malformed, expired, known-revoked, and already-scanned-on-this-device tokens. Expired authorization/package stops offline acceptance.
- Clearly label results **provisional offline verification** and display snapshot age. Separate these records from authoritative admission until synchronized.
- Upload queued operations on reconnect with authenticated device access and idempotent batch processing; return an outcome for every operation, plus refreshed state/revocations.
- Central acceptance is atomic. A ticket already admitted online or by another device, refunded, cancelled, or inconsistent with the user's assignment becomes a conflict for organizer review; do not silently count a second entry.
- Preserve device time and server receipt time separately. Server-accepted records determine authoritative counts; do not trust client clocks to pick a globally earliest scan.
- Offline reversals reference the original operation and reconcile in sequence. Staff revocation prevents new accepted operations; rejected uploads remain reviewable.

**Flow:** online sign-in and event preparation -> snapshot download -> network lost -> locally validate ticket plus entry confirmation -> queue provisional check-in -> reconnect -> upload -> server accepts, deduplicates, or flags conflict -> refresh package and counts.

**Boundary:** disconnected scanners cannot know a refund, account logout, or admission made elsewhere after their last synchronization. To preserve the confirmed signed-in admission rule and prevent global duplicate admission, the proposed baseline requires online confirmation before physical entry. Offline preparation, local verification, queuing and synchronization are included; unrestricted disconnected admission is not promised. Allowing provisional physical entry would be a separate product-policy change that accepts stale-state risk.

**Completion checks:** same operation uploaded twice changes counts once; two devices accepting the same ticket produce one central admission and one visible conflict; refunds since snapshot are rejected on sync; expired offline authorization fails closed.

### BF-13. Cancellations, refunds, and inventory return

**Purpose:** implement the user's confirmed refund order without prematurely reselling inventory.

**Requirements**

- Attendee may request refund through their order/support case; only authorized organizer/platform staff approve and initiate it under the saved order policy.
- Full-order refund uses the original actual paid amount, not current ticket prices or the undiscounted subtotal. Zero-value registrations use cancellation, with no fake payment refund.
- In one transaction, verify eligibility, mark affected tickets invalid/refund-pending, quarantine their inventory, persist refund intent and audit entry, and enqueue the provider request.
- After that commit, send the refund request. Provider acceptance/pending status is not refund success. Use confirmed simulator/provider outcome as completion evidence.
- While refund is pending, uncertain, or failed, the old ticket remains invalid and the inventory cannot be resold. Expose failure/retry/support handling; never silently reactivate it.
- On confirmed success, mark financial refund succeeded and tickets refunded; release the inventory exactly once. It becomes buyable only if event and sales rules allow it.
- Replacement purchase creates a different ticket and admission token. Retain the old ticket/order/payment/refund records.
- Checked-in orders are not automatically eligible for ordinary refunds; require authorized review/reversal first. Event cancellation is a separately authorized bulk invalidation/refund flow with retained history.
- Free cancellation invalidates tickets and releases inventory atomically because no money return is pending.
- Cancelling the event immediately closes sales and admission; invalidates tickets and enqueues paid-order refunds. Completion never makes a cancelled event purchasable.

**Flow:** request -> authorized approval -> invalidate tickets and quarantine seat/capacity -> initiate refund -> pending/failed remains blocked -> confirmed success -> release inventory -> a new eligible buyer may purchase -> new ticket issued.

**Completion checks:** seat cannot be rebought while refund is pending/failed; repeated refund requests or callbacks do not double-refund/release; old ticket cannot enter after refund starts; a successful refund after sales close does not reopen checkout.

### BF-14. Organizer finance and simulated payout tracking

**Purpose:** explain where demonstration money comes from and its current status.

**Requirements**

- Show face-value sales, discounts, collected amounts, processing charges, completed/pending refunds, activation charges, estimated organizer net, and demonstration payout states.
- Retain monetary records and reconciliation links; do not derive past fees from today's fee configuration.
- Keep payout profile details restricted to finance-authorized users and mask sensitive values.
- Model pending, eligible, sent, failed, and adjusted demo payout statuses. Avoid negative or duplicate transfers; block unsettled/refund-pending amounts from being treated as payable.
- No real bank transfer is made. Status changes are controlled, audited simulation actions.
- Handle refund after a simulated payout as an explicit negative balance/adjustment, not a rewrite of historical payout totals.

**Flow:** completed orders accrue proceeds -> subtract saved fees and confirmed refunds -> show pending refund exposure separately -> determine demonstrable payout amount -> simulator records a payout result -> notify organizer -> retain history.

**Completion checks:** totals reconcile to order/payment/refund records; replaying payout simulation cannot pay twice; staff without finance permission cannot read payout profile data.

### BF-15. Transactional notifications

**Purpose:** deliver required account, event, ticket, support, and finance updates reliably.

**Requirements**

- Support email verification/reset, staff/recipient invitations, registration/purchase confirmation, payment failure, ticket delivery, event updates/cancellation, refund completion, payout status, support messages/assignment/status changes.
- Provide in-app notifications for applicable signed-in users with read/unread status and pagination.
- Use recipient locale with a documented fallback; avoid sensitive ticket/authentication tokens in logs.
- Persist delivery intent, attempt count, status, retry time, and failure reason. Use bounded retries and expose exhausted failures to admins.
- Deduplicate jobs generated by replayed business operations. Ordinary SMTP may still deliver a duplicate after an uncertain send; ticket validity must never depend on email delivery count.
- Payment failure notifications must not contradict a subsequently confirmed success; check current business state before delayed delivery.

**Flow:** business transaction creates notification intent -> worker renders correct template -> sends email/in-app record -> marks outcome -> retries temporary failure -> authorized user may resend appropriate delivery.

**Completion checks:** worker outage does not lose notifications; replayed payment callbacks do not create extra delivery intents; notification links enforce target-record permissions.

### BF-16. Support cases, messages, attachments, and real-time updates

**Purpose:** allow attendees and organizers to resolve issues with the relevant context attached.

**Requirements**

- Attendee opens a case from an accessible event, own order, or assigned ticket; organizer opens platform support for account/activation/payment/technical issues.
- Validate every linked entity and relationship; never trust arbitrary client-supplied order/user IDs as context.
- Categories include delivery, payment, refund, seating, event information, check-in, account, and technical problems.
- Persist messages, author, timestamps, assignment, participants, and status: Open, In Progress, Waiting for Customer, Resolved.
- Attendee cases route to authorized organizer support staff; organizer platform cases route to Platform Admins. Allow auditable escalation.
- Authorized staff assign/reassign and change status; requester replies to a resolved case reopen it under the proposed default. Retain case history.
- Support protected file attachments with type/size/count limits, content validation, malware/quarantine handling, and authorized short-lived downloads. No public attachment URLs.
- Send real-time message/status updates through authenticated connections, with replay/resume from a persisted cursor and REST polling fallback. Validate permission on subscribe and delivery.
- Persist a message before broadcasting; retries with the same client message ID do not duplicate it. No typing indicators, voice messages, or chatbot required.

**Flow:** user chooses context/category -> sends message/optional attachment -> backend creates case and assigns queue -> staff reply via REST -> persisted update reaches connected clients and notifications -> staff resolve -> later reply can reopen -> escalation exposes only authorized context.

**Completion checks:** unrelated users cannot read thread, attachment, or WebSocket events; reconnect recovers missed messages; revoked staff lose live access; invalid uploads never become available for download.

### BF-17. Calendar exports and links

**Purpose:** let an authorized viewer add event details to an external calendar.

**Requirements**

- Generate standard iCalendar files and common-service event links, without requesting write access to calendar accounts.
- Include stable UID per event, version/sequence, creation/update metadata, timezone-aware start/end, venue/address, description, and permitted event URL.
- Emit updated event/cancellation data with the same UID. Do not expose attendee identity, admission tokens, or private access secrets in calendar links.
- Apply visibility/ownership checks consistently, including exports for private events and completed purchases.
- A downloaded/imported file does not guarantee automatic updates in every external calendar client; provide updated downloads and notifications.

**Flow:** event/order/ticket viewer selects calendar -> backend checks access -> returns file or service link -> external client imports -> changed/cancelled event produces updated export with stable identity.

**Completion checks:** event times survive timezone conversion; cancelled export has appropriate cancellation status; repeated exports keep the event UID; private event details are not public through export URLs.

### BF-18. Basic organizer analytics and campaign reporting

**Purpose:** give exact operational reporting from BiletFlow's own records.

**Requirements**

- Capacity, current issued tickets, remaining/held/blocked inventory, sold percentage, registrations, check-ins, absences, and attendance percentage.
- Face-value sales, discounts, actual collections, processing charges, successful and pending refunds, net revenue, and payout estimates in KZT.
- Sales over time, by ticket type, and by campaign; campaign redemptions, tickets originally attributed, refunded tickets, retained tickets, discount and revenue.
- Filters: authorized event, date range, ticket type, and campaign where applicable. Return timezone, metric definitions, applied filters, and freshness timestamp.
- Separate cumulative sales from current valid inventory so refunded/reissued tickets do not inflate sold percentage.
- Count free tickets in attendance/inventory but not paid revenue. Show refund-pending liability separately from completed refunds.
- Aggregate in PostgreSQL with bounded queries/read models; analytics must not lock or delay checkout and scanner operations.

**Flow:** authorized organizer selects filters -> backend checks scope -> aggregates from authoritative records -> returns totals/time series -> frontend draws charts -> CSV/report export uses the same definitions.

**Completion checks:** seeded examples reconcile manually; refund/rebuy does not inflate occupied capacity; campaign totals reconcile to order totals; event staff cannot query other organizers by changing filters.

### BF-19. Advanced GA4 traffic/funnel integration

**Purpose:** supplement exact sales reports with traffic and funnel measurements.

**Requirements**

- Define frontend/backend contracts for campaign landing, event view, checkout start, purchase, and refund measurements with consistent attribution and deduplication.
- Required integration code can be disabled without affecting checkout. A connected GA4 property is an external dependency for displaying live provider data.
- Use consent-aware collection and allowlisted parameters. Do not send names, emails, phone numbers, ticket identifiers, QR tokens, entry confirmations, support text, or private-event details.
- Use dedicated analytics identifiers when deduplication is needed; do not expose operational secrets. Scrub sensitive query parameters from collected page URLs.
- Attribute completed orders in the BiletFlow database even if an attendee rejects optional tracking or blocks GA4.
- Fetch authorized aggregate GA4 metrics through a server-side integration, protect property credentials, and cache results. Show source/freshness and unavailable/error states.
- Keep GA4 traffic/conversion metrics separate from BiletFlow financial totals; do not treat missing GA4 purchases as missing sales.

**Flow:** consented visitor follows campaign -> allowlisted events track browsing/checkout -> successful order writes authoritative redemption/revenue -> exporter sends deduplicated purchase measurement -> organizer dashboard combines separately labelled traffic and operational panels.

**Completion checks:** sensitive fields/tokens never appear in captured analytics payloads; disabling GA4 cannot break purchases; a provider outage produces an unavailable panel rather than incorrect zero sales; requests are scoped to permitted events.

### BF-20. Event history, duplication, and audit trail

**Purpose:** retain operational history and make important changes accountable.

**Requirements**

- List upcoming, active, completed, and cancelled events; allow authorized inspection of retained orders, tickets, refunds, check-ins, campaigns, support and analytics.
- Create chronological audit records for event publication/cancellation, capacity/price changes, staff permissions, activation, payment/refund changes, campaigns, support status/assignment, check-in/reversal, moderation and platform settings.
- Record timestamp, actor/service, action, event and affected entity, safe description, correlation ID, and useful limited change context.
- Filter history by date and activity type; paginate deterministically.
- No ordinary organizer or platform UI can edit/delete audit entries. Restrict database access and exclude secrets, passwords, card data, and whole support-message bodies from audit payloads.
- Duplicate reusable event configuration into a new draft with explicit selected source fields, fresh IDs, no attendees/transactions/check-ins/support, and fresh activation/staff/campaign setup.

**Flow:** authorized action executes -> transaction writes audit entry -> organizer opens past event/timeline -> filters history -> optionally duplicates configuration -> adjusts new draft and publishes independently.

**Completion checks:** duplication preserves original event records; audit cannot be modified through ordinary APIs; history permissions match event permissions; background changes identify their service actor.

### BF-21. Platform administration, moderation, and settings

**Purpose:** let internal staff operate and moderate the platform.

**Requirements**

- Search users, events, orders, payments, refunds and support cases with authorized detail views and pagination.
- Allow signed-in users to report an accessible event with category/reason; deduplicate/rate-limit reports and let admins review/resolve them.
- Suspend/reinstate users, events or paid sales, recording scope and reason. User suspension revokes sessions; event suspension stops new orders and admission, while existing records remain inspectable.
- Inspect activation, payment/refund failures, basic dispute/support records, campaign activity, job/notification failures, offline conflicts, and escalations.
- Configure demonstration activation fee, processing rate, hold duration, upload limits, and public platform settings with validation and audit history.
- Settings changes apply prospectively; they must not recalculate saved orders or paid activation records.
- Export basic operational reports with access controls and spreadsheet-formula-safe CSV values.
- Suspension alone does not automatically refund every order; event cancellation and refunds are explicit business actions.

**Flow:** report/failure arrives -> admin investigates linked records -> applies moderation or routes support/refund -> action takes effect on relevant API operations -> affected users receive suitable notices -> audit retains the decision.

**Completion checks:** ordinary organizer cannot call admin functions; suspended event cannot accept payment fulfillment/admission unnoticed; changed fees do not rewrite past financial records; exports do not leak unrelated private data.

### BF-22. Deployment, operations, security, and integration readiness

**Purpose:** make the backend reproducible and usable by the other three developers.

**Requirements**

- Provide Dockerfiles/Compose setup, environment template without secrets, database migrations, deterministic seed/reset procedure for demo data, and startup instructions.
- Start API/worker only when dependencies are ready; expose liveness and readiness checks with no sensitive internals.
- Provide structured logs, request correlation IDs, safe error responses, metrics for latency/errors/job backlog, and protection against secret/personal-data leakage in logs.
- Protect data in transit and sensitive stored data/backups. Development-only local HTTP is documented; remote demos use TLS. Define key/secret handling outside source control.
- Password hashing, session revocation, rate limiting, input validation, least-privilege database/storage accounts, CORS allowlist, and appropriate browser cookie/CSRF handling form the baseline.
- Document and test PostgreSQL and file-storage backup/restore together. Demo success includes a recovery exercise.
- Publish versioned OpenAPI contracts, auth/role examples, pagination/errors, WebSocket event schemas, scanner/offline schemas, and integration fixtures.
- Backend supports localized response codes/templates and seat accessibility metadata; visual accessibility and camera/UI work belong to frontend/mobile.
- Run automated API, permission, database integration, concurrency, payment, refund, token, PDF/calendar and synchronization tests in CI. Use PostgreSQL for concurrency tests.

**Flow:** teammate obtains repo/config -> starts containers -> applies migrations/seeds -> uses API docs/test accounts -> connects web/mobile -> runs end-to-end demonstration -> restarts/restores deployment without corrupting durable state.

**Completion checks:** clean environment can run the backend with documented commands; secrets are absent from repo; migration/restore tests pass; background work survives restart; published contracts match tested behavior.

## 5. Business states and invariants

### 5.1 Event state is multi-dimensional

- Publication: Draft -> Published <-> Unpublished; Cancelled is terminal in this academic flow.
- Time classification: Upcoming / Active / Completed, calculated from event start/end.
- Moderation: Normal / Suspended.
- Paid activation: Incomplete / Pending / Active / Failed / Suspended.

For example, a published upcoming event may have free registration open while paid activation is incomplete. A completed event remains readable but cannot sell new tickets.

### 5.2 Separate records, separate lifecycles

| Record | Main transitions |
|---|---|
| Inventory hold | Active -> Consumed, Expired, or Released |
| Order | Pending -> Confirmed, Failed, Expired, or Cancelled; Confirmed -> Refund Pending -> Refunded |
| Payment attempt | Created -> Pending -> Succeeded or Failed; uncertain result stays pending/reconciliation-required |
| Ticket | Valid -> Checked In -> Valid after authorized reversal; Valid -> Refund Pending -> Refunded; Valid -> Cancelled |
| Refund | Requested -> Pending -> Succeeded or Failed; failed/uncertain requests may be reconciled/retried |
| Seat/capacity allocation | Available -> Held -> Sold -> Refund Quarantine -> Available/Blocked after success |
| Support case | Open -> In Progress / Waiting for Customer -> Resolved; new requester reply reopens |
| Offline operation | Locally Queued -> Accepted, Duplicate, Rejected, or Conflict |

Refund failure leaves the order in refund-pending handling and the ticket invalid; the refund attempt itself records failure. Historical check-in rows remain even when a ticket's current state changes.

### 5.3 Mandatory integrity conditions

- At most one active hold/sold allocation per event seat, with refund quarantine retaining its allocation until completion.
- At most one current accepted check-in per ticket. Reversal preserves history and makes a new admission possible.
- Issued quantity never exceeds both event capacity and ticket-type inventory; refund-pending allocations remain occupied.
- Completed campaign redemptions plus active campaign reservations never exceed the campaign limit.
- At most one canonical ticket per issued order-item unit; one payment event can fulfill an order only once.
- Refund total never exceeds the original successful charge; unknown provider outcome must be reconciled before sending an unrelated second refund.
- A ticket never becomes valid again merely because its inventory is released or a PDF is regenerated.
- A transaction either commits inventory/order/promo/ticket/audit/outbox changes together or commits none of them.

## 6. Money definitions and demonstration data

### 6.1 What was checked on Ticketon

The public Ticketon catalogue showed examples including "Master and Margarita" from KZT 2,500, "Silk Road" at ASTANA BALLET from KZT 3,000, and Valery Meladze in Astana from KZT 30,000. These are advertised starting prices, not guaranteed prices for every seat. Use the ordinary listed price rather than a bank cashback-adjusted display. Source: [Ticketon catalogue](https://ticketon.kz/?lang=ru), checked 21 September 2026.

Ticketon's published refund rules say that a service fee is not applied to every order and its amount is displayed at checkout. Their 5% figure concerns certain refund-processing deductions when no service fee was charged; it is not evidence of a universal checkout commission. No universal organizer activation fee was verified in the consulted pages. Source: [Ticketon refund rules](https://ticketon.kz/help/refundrules).

Do not copy Ticketon's refund policy into BiletFlow. The user's refund sequencing and this document's explicit academic defaults govern this project.

### 6.2 Seed values

| Item | Demo value | Basis |
|---|---:|---|
| Free campus/community event | KZT 0 | BiletFlow free-registration requirement |
| Theatre ticket | KZT 2,500 | Public Ticketon starting-price example |
| Seated cultural event, standard category | KZT 3,000 | Public Ticketon starting-price example |
| Community/concert mid-tier | KZT 10,000 | Rounded dummy price within the observed catalogue range |
| Premium concert category | KZT 30,000 | Public Ticketon starting-price example; not a universal premium tariff |
| Paid-sales activation | KZT 5,000 per event | Invented BiletFlow demonstration setting, not a Ticketon price |
| Processing fee | 3% of actual collected ticket amount, deducted from organizer proceeds | Invented demonstration rate, not a verified Ticketon/provider tariff |
| Buyer service fee | KZT 0 | No extra buyer fee in this academic baseline |
| Percentage campaign | 10%, maximum 100 successful orders | Dummy campaign |
| Fixed campaign | KZT 1,000 per eligible order, maximum 50 successful orders | Dummy campaign |
| Refund deduction | KZT 0 | Proposed full-refund demonstration policy |

Seed data must also contain sold-out, expired-hold, free, mixed-type, assigned-seat, cancelled, refund-pending, refunded, checked-in, campaign-exhausted, and private-event examples. Use fictional people/events for demo records rather than importing real customers.

### 6.3 Calculation definitions

- Gross face-value sales = sum of saved ticket prices for fulfilled order items before discounts.
- Discounts = saved item discount allocations for those fulfilled orders.
- Collected amount = gross face-value sales - discounts, since the proposed buyer fee is zero.
- Processing fee = collected amount x saved demo rate, rounded once per payment to the supported minor unit; item allocations, if needed, must sum to that value.
- Net ticket revenue = collected amount - successful ticket refunds - retained processing fees.
- Event net after activation = net ticket revenue - event activation fee paid.
- Pending refunds are shown separately and reduce payable funds before payout; they are not counted as completed refunds yet.
- Current sold percentage = currently allocated issued/refund-pending ticket quantity / configured saleable capacity, with pending refunds separately visible. Expired holds do not count as sold.
- Attendance percentage = current accepted check-ins / current eligible issued tickets; report zero when denominator is zero. Offline provisional records are separate. "Absent" is final only after the event; before then label it "not yet checked in."
- Campaign net = attributed collected amount - attributed successful refunds - attributed retained processing fees. Activation is event-level, not arbitrarily assigned to campaigns.

**Worked example:** two KZT 10,000 tickets with a 10% campaign produce KZT 20,000 face value, KZT 2,000 discount, KZT 18,000 collected and KZT 540 processing fee. Organizer ticket proceeds are KZT 17,460. After a KZT 5,000 activation fee, event net is KZT 12,460, assuming no other sales/refunds.

**Full-refund example:** refund KZT 18,000, not KZT 20,000. Default simulator returns the original processing charge too, making retained fee zero after success; activation is nonrefundable in this proposed demo policy. Keep fee-reversal records explicit, because a future real provider may apply a different contract. After the refund, that order contributes zero ticket proceeds; the activation charge still exists.

### 6.4 Real-payment opportunity, without committing to live money

- **Halyk ePay:** official documentation exposes a test refund endpoint and full/partial refund operations. It is a candidate for a sandbox proof once merchant test access and the appropriate hosted checkout route are confirmed. BiletFlow only needs full refunds for this scope. [Official refund documentation](https://epayment.kz/docs/vozvrat-chastichnyi-vozvrat).
- **Freedom Pay:** official merchant documentation describes payment receipt, payouts, and result notifications. Evaluate its hosted payment flow and sandbox availability as an alternative; this is not a promise of approved merchant access or rates. [Official Merchant API overview](https://freedompay.kz/docs/merchant-api/intro).
- Select one based on actual sandbox access and onboarding constraints. Produce a short adapter spike and test report. Do not add real payouts, production KYC, or live charges to the academic acceptance criteria.
- Before any future live launch, separately settle provider agreement, verified fees, merchant responsibilities, refund/payout settlement behavior, and applicable launch requirements. Current demo numbers must never silently become production tariffs.

## 7. Core data model inventory

This is the entity checklist for schema design, not a final migration design.

| Area | Entities and important relationships |
|---|---|
| Identity | User, Session, EmailVerification, PasswordReset; locale and verification status |
| Organizer | Organization/OrganizerProfile, Membership, Invitation, EventStaffAssignment; explicit capabilities and event scope |
| Catalogue | Event, Category, EventMedia, EventAccessGrant, Venue, VenueLayout, Section, Row, Seat, EventSeat |
| Inventory | TicketType, InventoryHold, HoldItem/SeatAllocation; expiry and allocation ownership |
| Commerce | Order, OrderItem, AttendeeRecipient, PaymentAttempt, ProviderEvent, Refund, RefundAttempt, FeeSnapshot, PaidSalesActivation, VerificationRecord, TermsAcceptance |
| Finance | PayoutProfile, DemoPayout, PayoutAdjustment; provider references and simulation flags |
| Ticketing | Ticket, TicketClaim, EntryConfirmation, CheckInRecord, CheckInReversal |
| Offline | ScannerDevice, OfflinePackage, OfflineOperation, SyncConflict |
| Campaigns | Campaign, PromoCode, PromoReservation, PromoRedemption; linked order and eligible item attribution |
| Support | SupportCase, SupportMessage, CaseAssignment/StatusHistory, Attachment |
| Communication | Notification, NotificationDelivery, OutboxJob; deduplication key and retry state |
| Administration | EventReport, ModerationAction, PlatformSettingVersion, AuditLog |
| Analytics | Derived aggregates/read models and analytics-export records; never a replacement for authoritative order/ticket data |

Keep real seat identity separate from its per-event availability; purchaser identity separate from ticket recipient; ticket validity separate from payment/refund attempt state; cumulative history separate from current counters.

## 8. API capability map

These route families are proposed contracts, not claims that endpoints already exist. Final payloads belong in OpenAPI before client integration.

| API family | Required capabilities |
|---|---|
| `/api/v1/auth`, `/me` | Registration, email verification, login, refresh, logout, password reset, profile and sessions |
| `/organizations` | Organizer profile, invitation acceptance, membership and permissions |
| `/events` | Authorized discovery/detail, draft CRUD, publish/unpublish/cancel/duplicate, private access, images and staff |
| `/venues`, `/events/{id}/seats` | Predefined layouts, event layout configuration, readable availability |
| `/events/{id}/ticket-types`, `/holds` | Ticket configuration, hold create/read/release, expiry/conflict responses |
| `/events/{id}/activation` | Checklist, verification/payout status, terms acceptance, activation payment, admin inspection |
| `/orders` | Quote/checkout, status/history/detail, recipients, free cancellation and refund requests |
| `/payments`, `/integrations/payments/{provider}` | Payment initialization/status and authenticated callback ingestion |
| `/refunds` | Authorized initiation, status, controlled retry/reconciliation |
| `/tickets` | Assigned tickets, claim, PDF, delivery retry, authenticated entry confirmation |
| `/scanner` | Assigned events, attendee lookup, atomic admission, reversal, attendance counts |
| `/scanner/offline` | Device/package authorization, snapshot/delta, operation batch upload, sync outcomes |
| `/events/{id}/campaigns`, `/campaign-links` | Campaign/code management, QR output, token resolution and code validation |
| `/support` | Contextual cases, participants, messages, assignment/status, attachments and escalation |
| `/notifications` | In-app inbox, read state; internal delivery administration |
| `/calendar` | Authorized ICS exports, updates/cancellations, common-service links |
| `/events/{id}/analytics`, `/finance` | Capacity/sales/campaign/attendance metrics, GA4 aggregates, finance/payout views, exports |
| `/events/{id}/history` | Filtered immutable activity timeline and past-event navigation |
| `/admin` | Moderation, reports, searches, settings, activation/finance/support/job inspection |
| WebSocket subscriptions | Authorized support messages/status, notifications, and event availability/check-in updates where used |
| `/health/live`, `/health/ready` | Deployment health without private data |

For every operation document: authentication, required permission, resource scope, input validation, response schema, state transitions, idempotency behavior, expected errors, audit event, and side effects.

## 9. Dependency-based implementation plan and ownership

Backend ownership is divided by coherent business areas. Both developers review changes affecting shared transactions; the mobile/Docker teammate owns container integration, with backend input. No calendar estimates are imposed.

| Stage | Deliverable | Primary ownership | Exit condition |
|---|---|---|---|
| A. Contracts and foundations | Shared state model, role matrix, entity relationships, API conventions, migrations, seed strategy, CI and basic containers | Backend 1 leads foundations; Backend 2 reviews commerce model; mobile/Docker owns container wiring | Both backend developers and client developers can use documented authenticated test endpoints and agreed contracts |
| B. Identity and event setup | BF-01/02/03, ticket-type setup, venue/layout model, shared audit and outbox skeleton | Backend 1: identity/organizations/events; Backend 2: inventory/seating; mobile/Docker: runtime | Organizer can create/publish a free event; unauthorized access and capacity-edit rules are tested |
| C. Core ticket lifecycle | BF-05/06/07/08/09/10/13/14; free and paid checkout, campaigns, refund sequencing and finance | Backend 2: commerce/inventory/activation/payments/refunds; Backend 1: ticket delivery/PDF and shared authorization | Free and paid orders issue correct tickets; concurrent purchase, promo and refund tests pass |
| D. Admission and support | BF-11/12/16, recipient/entry flows, scanner contracts and live messages | Backend 1: scanner/support APIs; Backend 2: transaction/race review; mobile developers: device flows/offline queue/camera | Online double entry prevented; offline conflicts reconcile visibly; support works across reconnects |
| E. Reporting and complete product coverage | BF-15/17/18/19/20/21, past-event history, calendar, advanced analytics and moderation | Backend 1: admin/history/calendar/notifications; Backend 2: finance/campaign analytics and GA4 integration | All agreed modules have contracts, working flows, scoped access and completion tests |
| F. Integration and delivery | BF-22, backup/restore, end-to-end journeys, failure recovery, docs; optional provider sandbox spike | Both backend developers; mobile/Docker deployment lead; frontend/mobile integration owners | Complete acceptance matrix passes and full demo is reproducible |

Stages show dependencies, not rigid serial assignments. For example, support can begin once identity/context rules exist, and reporting schemas can be agreed while checkout is being built. No feature is complete merely because an isolated endpoint returns success.

### 9.1 Suggested long-term backend ownership

- **Backend developer 1:** identity, organizer/staff authorization, events/discovery, ticket presentation/recipient access, online/offline admission APIs, support/live delivery, notifications, calendar, admin/history, API foundations.
- **Backend developer 2:** venue inventory/holds, ticket types, paid activation, checkout/orders, payment/refund/payout records, campaigns, monetary calculations, basic/advanced analytics, provider adapter.
- **Shared review required:** capacity/hold/payment completion, refund versus check-in, campaign redemption, permission changes, migration changes, token formats, offline reconciliation and audit.

This is an initial allocation, not a requirement to keep identical task counts. Commerce concurrency and offline admission deserve joint review even when one developer owns the code.

### 9.2 Handoffs to the rest of the team

| Teammate | Backend must provide | Client/deployment responsibility |
|---|---|---|
| Frontend developer | OpenAPI, event/seat availability schemas, account/recipient and admission-confirmation flow, checkout errors, support/live events, reporting definitions and fixtures | Attendee/organizer/admin web screens, seat map rendering, accessibility, localized interface, consent-aware analytics capture |
| Mobile + Docker developer | Scanner auth/events/check-in API, deterministic scanner fixtures, health endpoints, migration/worker/storage setup instructions | Scanner integration plus Docker/service configuration, environment wiring, recovery walkthrough |
| Mobile developer | Offline package/token formats, operation schemas, conflict outcomes, signed-in attendee confirmation verification contract | Camera/scanner UX, protected local storage, offline queue/sync and device-level tests |

Attendee sign-in and entry confirmation use the responsive web application; no native attendee app is required. Frontend/admin screens are part of the overall project but are not implemented by this backend plan.

## 10. Acceptance matrix: when the backend is complete

| ID | Scenario | Required observable result |
|---|---|---|
| AC-01 | Anonymous visitor browses then attempts to obtain a ticket | Browsing works; checkout/hold creation requires verified sign-in |
| AC-02 | Organizer publishes a free general-admission event | Zero-value order creates canonical tickets and delivery work without a provider payment |
| AC-03 | Paid event is not activated | Paid checkout rejected; allowed free types still work |
| AC-04 | Activation prerequisites complete | Only the intended event enables paid sales |
| AC-05 | Two buyers compete for last seat/place | At most one gets the allocation; no over-capacity fulfillment |
| AC-06 | Hold expires or user abandons checkout | Inventory and campaign reservation are released once |
| AC-07 | Payment fails, delays, repeats or arrives out of order | No invalid issuance; retry/reconciliation produces correct final state |
| AC-08 | Payment succeeds after its inventory is sold elsewhere | No second ticket; compensating refund and visible status |
| AC-09 | Two buyers use the last campaign redemption | Campaign limit never exceeded |
| AC-10 | Campaign link contains client-modified discount | Server ignores/rejects manipulation; campaign QR is never an admission token |
| AC-11 | PDF is downloaded/printed twice | Both copies identify one ticket; A4/grayscale scan succeeds and second admission fails |
| AC-12 | Attendee or scanner lacks required sign-in/access | Admission rejected with meaningful error |
| AC-13 | Two online scanners scan the same valid ticket | One accepted check-in, one already-used result |
| AC-14 | Staff reverse an accidental check-in | Only permitted actor succeeds; original history preserved; later entry needs fresh confirmation |
| AC-15 | Refund is approved | Old ticket immediately invalid; seat quarantined before refund request is sent |
| AC-16 | Refund pending/fails then succeeds | No resale before success; success releases once; replacement has a new ID/token |
| AC-17 | Event cancelled while payments/holds exist | Sales/admission stop; relevant tickets invalid; paid orders refunded/reconciled; inventory never offered for cancelled event |
| AC-18 | Staff member is revoked or tries another organizer's event | All online REST/download/live access denied consistently |
| AC-19 | Recipient opens a ticket claim | Only correct verified account claims it; recipient cannot see buyer's unrelated order data |
| AC-20 | Support message/attachment sent during reconnect | Message persisted once, missed updates recovered, only authorized participants see content |
| AC-21 | Offline devices conflict or use stale refund data | One central admission maximum; stale/duplicate operation visible as conflict; no false claim of real-time validation |
| AC-22 | Calendar exported then event updated/cancelled | Timezone and UID preserved; update/cancellation exported correctly |
| AC-23 | Sales, discount, refund and re-purchase sample runs | Capacity, revenue, campaign and attendance totals match authoritative records |
| AC-24 | GA4 disabled/unavailable or consent refused | Core flows still work; no PII leakage; traffic panel distinguishes unavailable data from zero |
| AC-25 | Past event duplicated | Fresh draft with selected configuration; original records unchanged; no historical transactions copied |
| AC-26 | API/worker stops after business commit | Restart completes durable side effects without duplicate business results |
| AC-27 | Database and storage restored to test environment | Orders, tickets, protected files, audit and pending jobs remain consistent |
| AC-28 | Demonstration payment/payout viewed or exported | Simulation label retained; no suggestion that real funds moved |

### 10.1 Measurable nonfunctional checks

- Online QR validation/check-in should normally complete within the SRS's two-second target. Proposed test target: p95 end-to-end within two seconds on the documented demo environment/network.
- Use a declared test baseline, for example 50 concurrent checkout attempts against constrained inventory and 10 scanner clients. These are proposed test parameters, not a promise of production capacity.
- Verify analytics queries under the same load do not breach the declared checkout/check-in targets; report dataset size and environment with measurements.
- Validate exact money arithmetic and zero/rounding boundaries with mixed eligible/ineligible promo items and full refunds.
- Check backup restore, migration setup, permission boundaries, upload controls, localizations, and personal-data-free logs/analytics with representative fixtures.
- Readiness for web/mobile integration requires contracts and failing-case examples, not just successful-path API documentation.

## 11. SRS coverage map

| Source area | Backend coverage |
|---|---|
| 3. Business model; 4.1 Accounts | BF-01, BF-02, BF-06, BF-14 |
| 4.2 Event management | BF-03, BF-20 |
| 4.3 Ticket management; 4.3.1 Assigned seating | BF-04, BF-05 |
| 4.4 Free registration | BF-07, BF-10 |
| 4.5 Paid-sales activation | BF-06, BF-08 |
| 4.6 Checkout and payments | BF-05, BF-07, BF-08, BF-14 |
| 4.7 Digital/printed tickets | BF-10, BF-11 |
| 4.8 Mobile verification/check-in | BF-11, BF-12; mobile UI is a client-team handoff |
| 4.9 Orders, cancellations, refunds | BF-07, BF-13 |
| 4.10 Notifications | BF-15 |
| 4.11 Calendar export | BF-17 |
| 4.12 Administration | BF-21 |
| 4.13 Support cases | BF-16, including attachments and real-time updates |
| 4.14 Campaigns and promotional QR | BF-09, BF-18, BF-19 |
| 4.15 Organizer analytics | BF-18, BF-19 |
| 4.16 Event history/audit | BF-20 |
| 6. Data entities | Section 7, expanded for confirmed staff, recipient and offline needs |
| 7. Nonfunctional requirements | Shared rules, BF-22 and Section 10.1; visual UI requirements are client handoffs |
| 8. MVP and bonuses | All included features mapped above; exclusions preserved in Section 1.2 |
| 9. Stack; 13. Delivery plan | FastAPI/PostgreSQL confirmed; dependency stages replace the draft's calendar schedule |
| 11. Success criteria | AC-01 through AC-28 |

## 12. Definition of done and remaining external dependencies

A feature is done when its documented flow, permission checks, state rules, audit/notification effects, meaningful automated tests, OpenAPI/events documentation, and required client integration all agree. A backend-only feature can be marked API-complete before its client UI is finished, but the end-to-end journey remains incomplete until integrated.

External dependencies to track without blocking simulation-based work:

1. A chosen provider's merchant sandbox access, documented callback verification, refund success semantics, and test credentials.
2. A GA4 property and authorized credentials for live advanced reporting; integration must still have deterministic test fixtures and a clear disconnected state.
3. Email delivery domain/provider credentials for external delivery, plus storage/deployment secrets for shared demonstrations.
4. Final review of proposed defaults: exact demo fees, refund cutoff, attendee entry-confirmation lifetime, hold limits, offline-package lifetime, and academic retention period. These are configuration/product-review items, not dates in the delivery plan.

The first implementation artifact should be the shared schema/state/API contract for identity, events, inventory, orders, tickets and refunds. Those definitions determine how both backend developers and all client developers can work together without incompatible assumptions.

## 13. Database design artifacts

The database design elaborates this requirements baseline without promoting proposed defaults to confirmed decisions:

- [Editable draw.io database atlas](database/BiletFlow_Database.drawio): domain tables, complete foreign-key diagrams, invariants, lifecycle operations and state transitions.
- [Database specification](database/BiletFlow_Database_Specification.md): full data dictionary, cardinalities, constraints, locking rules, transaction effects, permissions and retention boundaries.
- [PostgreSQL reference DDL](database/BiletFlow_PostgreSQL_Schema.sql): structural database constraints and immutable-history protection. This is a design script, not a migration already deployed.
- [Backend implementation](../backend/README.md): 27 tables across the identity and event-setup migrations; executable BF-01 plus the documented [organizer/event API increment](../backend/CATALOG_API.md). Nullable Google-only passwords, identity/refresh/OAuth/rate-limit tables and permission revocation timestamps extend the original atlas. Shared audit/outbox now have scoped organization/event FKs. The full 66-table DDL is not deployed; hold/allocation tables currently support capacity guards, with checkout services still pending.
- [Browser preview](database/BiletFlow_Database_Preview.html): rendered atlas with page selection and zoom.

Read the database specification before schema or transaction implementation. Cross-row rules marked TX still require the documented transactional service implementation; a valid schema alone does not implement checkout, refunds or access control.
