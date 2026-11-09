# Organizer and event APIs

Implemented on 24 September 2026 as the next Stage B increment. Use [interactive OpenAPI](http://localhost:8000/docs) for exact request/response fields. All paths below begin with `/api/v1`.

This increment lets an organizer publish a free event and configure staff, ticket types and assigned seats. Ticket acquisition, paid activation, orders, payment/refund processing and check-in are the next modules. A published event currently advertises its configuration; it cannot issue tickets yet.

## Authentication and permissions

Every write requires a verified active account and a live session using `Authorization: Bearer <access_token>`. Each request checks current database permissions. Workspace ownership grants every organization and event capability. Ownership transfer is not exposed. The owner cannot be removed through membership or staff revocation.

Organization capabilities are `manage_profile`, `manage_staff`, and `finance`. Only the owner grants or removes these capabilities. `manage_profile` permits updating the workspace and creating events. `manage_staff` permits inviting/removing ordinary members, but does not grant access to every event. Only the owner can remove another workspace staff administrator. `finance` is stored for the future finance module.

Event capabilities are `event_edit`, `attendees`, `support`, `reports`, `refund`, `scan`, `reverse_checkin`, and `staff`. An active member needs an explicit assignment to that event. A delegated staff manager can grant or remove only capabilities they hold themselves. Support, refund and admission capabilities establish the permission model; their business operations are not implemented here. A non-owner who creates or duplicates an event receives a new `event_edit` assignment for that draft.

Revocation retains membership, assignment and permission records with timestamps. Reinviting a revoked member does not restore their old permissions. Their account and sessions remain usable elsewhere, but no longer authorize the revoked workspace/event. WebSocket and offline-package revocation belong to their future modules.

## Workspace and invitation operations

| Method and path | Required access | Result / flow |
|---|---|---|
| `POST /organizations` | Verified account | Create workspace and owner membership together; return 201 |
| `GET /organizations` | Verified account | List active owned/joined workspaces |
| `GET /organizations/{org_id}` | Active member or owner | Read workspace profile |
| `PATCH /organizations/{org_id}` | `manage_profile` or owner | Update supplied name/contact fields |
| `GET /organizations/{org_id}/members` | `manage_staff` or owner | Member identities, status and explicit organization permissions |
| `PUT /organizations/{org_id}/members/{member_id}/permissions` | Owner | Replace explicit organization permissions |
| `DELETE /organizations/{org_id}/members/{member_id}` | `manage_staff` or owner | Revoke member and all event assignments/capabilities atomically |
| `POST /organizations/{org_id}/invitations` | `manage_staff` or owner | Replace pending invite to that email and queue delivery; return 201 |
| `GET /organizations/{org_id}/invitations` | `manage_staff` or owner | List invitation metadata; never token digests/secrets |
| `DELETE /organizations/{org_id}/invitations/{invitation_id}` | `manage_staff` or owner | Revoke an unaccepted invitation |
| `POST /staff-invitations/accept` | Verified intended recipient | Consume email token once and join/reactivate membership |

Invitation flow: invite by email → worker delivers a link → recipient registers/verifies or signs in using that exact normalized email → frontend submits the `#token=` value to the acceptance endpoint → owner grants organization permissions and/or event assignment. Acceptance alone grants no event capability. The acceptance page is a client integration task; Swagger can submit the token during the backend demo.

The implementation uses a seven-day invitation lifetime as a default, not a new user-confirmed requirement. Tokens are purpose-bound, stored as digests, and reconstructed only for delivery. Replaced, revoked, expired, already accepted or wrong-account tokens cannot join the workspace. Acceptance and delivery recheck the inviter's current authority. Invitation creation and acceptance use the existing shared rate limiter. Concurrent acceptance produces one membership and one successful acceptance.

## Event images (9 November 2026)

Event responses include ordered `images` and nullable `cover_image_url`. Each image has
`id`, `url`, `mime_type`, `size_bytes`, `alt_text`, `sort_order`, and `is_cover`.
The first image is the cover; deleting it promotes the next image. URLs point to the
API and never expose storage keys. Existing web/mobile upload response fields are preserved.

| Method and path | Required access | Result |
|---|---|---|
| `POST /events/{event_id}/images` | `event_edit` or owner | Raw image body; 201 image metadata |
| `PUT /events/{event_id}/images/order` | `event_edit` or owner | JSON `{"image_ids":["uuid", "uuid"]}`; complete gallery permutation, 200 ordered metadata |
| `PUT /events/{event_id}/images/{image_id}/cover` | `event_edit` or owner | Move image to first position, preserve remaining relative order; 200 ordered metadata |
| `DELETE /events/{event_id}/images/{image_id}` | `event_edit` or owner | Remove image and compact order; 204 |
| `GET /events/{event_id}/images/{image_id}/content` | Current permitted event viewer | Validated image bytes, `private, no-store` and `nosniff` |

Upload uses exact `Content-Type: image/png` or `image/jpeg`; multipart, SVG, PDF,
animated images, malformed/truncated bytes and mismatched types are rejected.
Query `filename` is optional (default `image`); it is sanitized metadata and never
part of the object key. `alt_text` is optional for existing clients (default `Event image`),
nonblank and at most 500 characters. Supply a descriptive value when possible.
The effective byte ceiling is the smaller of `ATTACHMENT_MAX_BYTES` and the current
platform `upload_max_mb` setting, applying to received and normalized bytes.
Streaming requests are bounded even without Content-Length; supplied lengths must match.
Images are fully decoded, bounded to 16 million pixels, EXIF orientation applied, and
re-encoded without source metadata/appended content. `size_bytes` describes stored bytes.
Pillow already arrives through the existing ReportLab dependency; no new package is added.

Implementation defaults: ten images per event, contiguous positions 0–9, and 20 upload
attempts per account per minute (coarse IP cap 200). Reordering must name every current
same-event image once; duplicate, foreign or missing IDs fail with 422. Concurrent gallery
mutations serialize on the existing event/organization guards, backed by unique bounded
database positions. Mutations are audited with the event version change in one transaction.
Cancelled or moderated events cannot be edited. Image changes alone do not send event notices.

Every content request rechecks live event visibility, account/session and access grants.
Published unlisted links work directly but never enter discovery. Private events require
current staff/grant access; draft/unpublished images are available only to authorized staff.
Knowing an image ID or retaining an old URL grants no access after revocation/unpublication.

Storage lifecycle reserves a pending `stored_file`, writes the generated UUID key outside
the business transaction, then reauthorizes and attaches it as clean under an event lock.
Failed finalize/commit compensates only that upload's object. Delete commits removal and
deleted metadata before physical deletion. The existing worker reconciles pending/deleted
event-image metadata every hold-sweep interval (15 seconds), claiming at most 50 due files.
Implementation defaults: pending uploads have one hour of grace, and cleanup claims advance
the durable `cleanup_after` timestamp by five minutes before object IO. Failed deletes or
worker interruption therefore retry on later passes. Legacy NULL schedules are recovered
without a bulk backfill. Clean files and all existing event/support/ticket references are protected.

Cleanup atomically fences stale pending metadata as deleted; upload finalization locks that
metadata and requires pending status, so a cleanup winner cannot be attached/published.
All object IO happens after the short claiming transaction has committed. Deleted tombstones
stay periodically scheduled even after successful deletion: this reclaims a slow interrupted
object write that finishes after an earlier cleanup pass. A cleanup worker never holds an
event/organization/advisory lock or database connection during storage IO. Recovery requires
the worker to run and storage/database availability to return; storage deletion is idempotent.
No support attachment or existing gallery object is deleted on upload failure.
Schema migration `0015_event_images` adds `event_media`; its down migration drops gallery
links and cannot restore those links/data. `0016_image_cleanup` adds the nullable durable
schedule and concurrent partial index; its downgrade removes scheduling, preserving image
links/file metadata. Stored file metadata and objects remain separate.

Errors include 401 authentication, 403 insufficient event capability, 404 unrelated/inaccessible
event or image, 409 gallery full/event not editable/upload expired during cleanup, 413 too large, 415 unsupported type,
422 invalid bytes/order/input, 429 upload rate limit, and 503 storage/database unavailable.

## Discovery and event lifecycle

| Method and path | Required access | Result / flow |
|---|---|---|
| `GET /categories` | Public | Category names in kk/ru/en |
| `GET /venues` | Public | Predefined venue catalogue; optional city filter |
| `GET /venues/{venue_id}/layouts` | Public | Available immutable layout versions |
| `GET /venues/{venue_id}/layouts/{layout_id}` | Public | Coordinates, section/row/seat labels, accessibility and price categories |
| `POST /organizations/{org_id}/events` | `manage_profile` or owner | Create draft with new calendar UID; return 201 |
| `GET /organizations/{org_id}/events` | Active member or owner | Owner sees all; staff see their assigned events |
| `GET /events` | Public | Published public events in active workspaces with normal moderation |
| `GET /events/{event_id}` | Permitted viewer | Detail and derived upcoming/active/completed status |
| `PUT /events/{event_id}` | `event_edit` or owner | Replace editable configuration, validate capacity/history, increment versions |
| `POST /events/{event_id}/publish` | `event_edit` or owner | Publish a complete usable configuration |
| `POST /events/{event_id}/unpublish` | `event_edit` or owner | Hide published event without deleting history |
| `POST /events/{event_id}/cancel` | `event_edit` or owner | Terminal cancellation when no sold/quarantined allocation exists; release active holds |
| `POST /events/{event_id}/duplicate` | `event_edit` plus organization `manage_profile`, or owner | Copy whitelisted configuration to a fresh draft; return 201 |
| `PUT /events/{event_id}/access` | `attendees` or owner | Grant one existing account private-event access |
| `DELETE /events/{event_id}/access/{user_id}` | `attendees` or owner | Revoke private-event access |
| `GET /events/{event_id}/history` | `reports` or owner | Paginated immutable event activity |

Anonymous users can browse public events and open published unlisted events by URL. Unlisted/private events never appear in public search. Private events require a signed-in account with an active access grant, or authorized event staff. Draft, unpublished, cancelled and moderated events are hidden from ordinary visitors. Invalid supplied bearer credentials return 401 rather than silently browsing as a guest.

Discovery filters: category UUID, city, literal title text `q`, aware `date_from`/`date_to`, `min_price`/`max_price` in KZT minor units, and `free=true/false`. Price filters use non-hidden nonzero-capacity ticket types. Results are ordered by start time and ID. List endpoints with pagination accept `limit` (default 50, maximum 100) and `offset`; seats default to 100 with maximum 500. Category/layout/ticket-type lists return all items for that resource.

Activity history accepts optional `actor` (user UUID, exact `actor_user_id` match), `action` (exact action code, nonblank and at most 128 characters), and offset-aware `from`/`to` timestamps. Filters combine with AND inside the authorized event; unknown or other-event actor/action values return an empty list. Service activity remains visible when no actor filter is supplied. Dates use `[from,to)`; equal/reversed bounds and malformed filters return 422. Pagination and ordering remain `created_at DESC, id ASC` with the same list response.

Event flow: select category/venue → create draft with timezone and registration/admission/refund windows → create ticket types → optionally configure assigned seats → publish. Publishing requires positive capacity, an event that has not ended, an open or future registration window, at least one visible usable ticket type, and usable seats for assigned seating. Times must include an offset; `time_zone` must be a valid IANA zone. Refund cutoff is required when refunds are enabled and cannot follow event start. Validation errors roll back the entire operation.

`PUT` requests send the complete input representation; server lifecycle, moderation, IDs and version fields are not writable. Duplicate creates new event/type/seat IDs and calendar UID, preserving dates for deliberate editing before publication. It copies no prior staff assignments, access grants, allocations, payments or activity. A non-owner creator receives only a fresh editor assignment. Cancellation with sales invalidates tickets and starts refunds in the same transaction; see [REFUNDS_API.md](REFUNDS_API.md#cancelling-an-event).

## Ticket configuration, seating and staff

| Method and path | Required access | Result / flow |
|---|---|---|
| `POST /events/{event_id}/ticket-types` | `event_edit` or owner | Create free/paid type; return 201 |
| `GET /events/{event_id}/ticket-types` | Permitted viewer | Visible types; editors also see hidden types |
| `PUT /events/{event_id}/ticket-types/{type_id}` | `event_edit` or owner | Replace configuration while preserving allocated identity |
| `POST /events/{event_id}/seats/configure` | `event_edit` or owner | Map every physical price category to a same-event type; create event seats once |
| `GET /events/{event_id}/seats` | Permitted viewer | Coordinates, accessibility, status and availability version |
| `PATCH /events/{event_id}/seats/{seat_id}` | `event_edit` or owner | Block/unblock or retarget an eligible unallocated seat |
| `PUT /events/{event_id}/staff` | `staff` or owner | Create/restore member assignment and replace its event capabilities |
| `GET /events/{event_id}/staff` | `staff` or owner | List assignments and explicit capabilities |
| `DELETE /events/{event_id}/staff/{staff_id}` | `staff` or owner | Revoke event assignment and its capabilities |

Money is integer KZT minor units: 500000 means KZT 5,000. Free types require zero; paid types require a positive price. Type sales windows must fit the event registration window. Each type's quantity cannot exceed event capacity; future checkout must also enforce shared event capacity across types. Hidden types remain in history. Published events cannot be edited into an unusable configuration.

Ticket-type create/update responses and list responses for event owners or staff with `event_edit`/`reports` include integer `sold`, `reserved`, `refunded`, and `checked_in` counts per type. `sold` is current sold plus refund-quarantined allocations (including free registrations), so pending/failed refunds retain occupied inventory. `reserved` counts held allocations belonging to active, unexpired holds; expired holds are excluded even before cleanup releases them. `refunded` is historical tickets with confirmed successful refunds, and may exceed current capacity after repeated refund/rebuy cycles. `checked_in` counts eligible valid/checked-in tickets with an unreversed accepted admission; provisional offline operations and reversed admissions are excluded. These definitions match operational analytics; historical refunded tickets never inflate current sold inventory. Counts are read in a consistent snapshot without row locks. Public visitors, attendees and scanner-only staff receive the original configuration fields without organizer counts. Hidden types remain visible only to editors/owners, preserving existing visibility rules.

Assigned-seat flow: read a predefined layout → create types → submit `{"ticket_types": {"premium": "<type UUID>", "standard": "<type UUID>"}}` → read event seats. All categories must be mapped; cross-event types are rejected. Unblocked configured seats must fit event capacity and each mapped type's quantity. Configure using adequate limits, then block seats and reduce limits if needed. No custom layout editor is included.

Seat status is derived as `available`, `unavailable`, `blocked`, `held`, `sold`, or `refund_pending`. Expired holds continue occupying inventory until the future expiry service explicitly releases them. Paid seats include `paid_activation_required: true`; this is a configuration preview, not a checkout authorization. This increment has no reservation endpoint. Capacity reductions count held, sold and refund-quarantined allocations. Allocated seats cannot be blocked/repointed; historical allocations also prevent changing layout or ticket kind/seat identity.

## Database and transaction contract

Run `python -m app.bootstrap` using the migration owner to apply `0002_event_setup`, grant the runtime role access, and seed the catalogue. Existing identity rows are retained. The migration adds 18 tables to the nine identity/supporting tables:

- Organizations: `organization`, `organization_member`, `member_permission`, `staff_invitation`, `event_staff`, `staff_permission`.
- Catalogue: `category`, `event`, `event_access_grant`, `venue`, `venue_layout`, `venue_section`, `venue_row`, `venue_seat`.
- Inventory configuration: `ticket_type`, `event_seat`, `checkout_hold`, `inventory_allocation`.

The last two tables support capacity guardrails and future checkout; their presence does not implement reservations or fulfillment. Composite foreign keys enforce event/type/layout/member scope. A partial unique index permits only one live allocation per seat across held/sold/refund-quarantined states. Both permission tables add nullable `revoked_at` to the atlas design to preserve permission rows.

Audit/outbox's temporary authentication-only scope checks are replaced with organization/event FKs. Mutation transactions lock the authenticated user/session, then the workspace, then the event when applicable. The workspace mutex serializes membership/permission revocation with event editing. Future inventory services must use the same order. Aggregate capacity and authorization are service contracts, not CHECK constraints. Changes and audit entries commit together; invitation creation also commits its durable email intent. SMTP runs outside business transactions.

The repeatable seed adds two categories and a fictional Almaty hall with 12 seats (two rows, two accessible seats). It creates no user, order, activation or paid-price fixture. Run `python -m app.seed` to restore missing seed rows without overwriting existing values. Ticketon-based paid demo prices remain part of the upcoming commerce fixtures.

Errors use `{"detail":{"code":"..."}}` for business failures and FastAPI's validation details for malformed inputs: 401 invalid session, 403 missing capability/delegation, 404 inaccessible or missing scoped resource, 409 state/capacity/history conflict, 422 invalid configuration/reference, 429 rate limit. Create/duplicate/invite operations create new records and do not yet accept idempotency keys. Publish/unpublish/cancel repeated in the reached state preserve the business state; invitation acceptance is single-use. Revocation is a retained state change, not row deletion.

## Remaining work in the overall plan

Stage B's basic publication/authorization/capacity checks are implemented. Downstream event-change notifications, live availability broadcasts, moderation UI/API and full finance/payout profiles remain. Stage C adds authenticated holds and expiry, orders, free issuance, activation, simulated payments/refunds, campaigns and ticket delivery. Subsequent stages add admission/offline synchronization, support, reporting, calendar and administration. These API boundaries do not mark all BF-02–BF-05 requirements or the overall acceptance matrix complete.
