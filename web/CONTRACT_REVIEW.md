# Backend contract review

First reviewed against `origin/main` at `eec9a75`; updated on 2026-11-17 against
`origin/main` at `b1b73d0` after merging it into `ershuku-web`. Backend files were
read only; they were not edited. Only web files are changed.

## Confirmed and integrated

`backend/CAMPAIGNS_API.md`, `campaign_schemas.py`, `checkout_schemas.py` and
`backend/REFUNDS_API.md` / `refund_api.py` define the implemented contracts.

- Hold responses require `pricing` (gross, discount, subtotal, processing_fee,
  payable, lines) and nullable `promo`. The web shows this authoritative quote.
- A fixed discount applies once per basket, not once per ticket. Per-ticket fixed
  estimates were removed. Percent previews remain estimates until the hold.
- A positive-face-value basket discounted to zero uses free confirmation.
- Order responses contain nullable `{code, campaign_id}` promo attribution,
  payment, refunds and quote expiration. The saved promo is shown on the order.
- Campaign responses have a non-null code and a finite four-state status.
  Reports include refunded/kept ticket counts, collected amount, refunds and
  retained processing fees. Net is the backend's amount, never recomputed in UI.
- Campaign list/create/edit/disable, QR preview/download and report use the live
  endpoints. Failed creation preserves the form. QR links are not entry tickets.
- The campaign link and checkout code survive the sign-in round trip.
- Buyer refund requests return `202 {order_id, status, case_id}`. They open a
  support case; they do not approve or execute a refund. The web links that case.
- Organizer refunds return `{order_id, status, refund}`. Free ticket cancellation
  returns `{ticket_id, order_id, status}`; buyer cancellation returns the order.
- Paid cancellations are whole-order refunds. Checked-in tickets require reversal.
  Saved policy and cutoff are enforced by the server, with readable error messages.
- Order notification targets and the five commerce notification kinds are covered.

Tests cover the campaign workspace, QR download/report, failed form preservation,
sign-in promo preservation, server price summaries, zero-payable confirmation,
refund case links, destructive-action confirmation and policy failures.

## Integrated on 2026-11-17 (`b1b73d0`)

These replace the earlier planned web types. Each web type now mirrors its
backend schema field for field.

- **Analytics** (`ANALYTICS_API.md`, `analytics_schemas.py`). Applied filters,
  definitions, inventory (`expired_held`, `blocked`, `refund_pending`,
  `sold_percentage`), revenue (`collected`, `charged`/`reversed`/retained fees,
  `pending_refunds`, `environments`) and attendance (`not_checked_in` plus its
  `absent`/`not_yet_checked_in` label and `percentage`) are typed and shown.
  Percentages are the server's 0-100 values. The null-id campaign row is shown as
  "No campaign". The campaign filter lists the event's campaigns from the
  campaigns API, and is hidden for staff who cannot read campaigns.
- **Finance** (`FINANCE_API.md`, `finance_api.py`). The full `EventFinance` is
  shown: ticket money, net activation charge, net, sent, balance, reserved,
  estimated payable and `payout_eligible_at`. Payout history is paged by
  limit/offset. Reservations send `{amount_minor}` with an `Idempotency-Key`
  that is reused on retry, and are only offered when `simulation_only` is true.
  Demo transitions follow pending→eligible→sent and pending/eligible→failed. A
  404 from `/simulate` (simulator disabled) withdraws those buttons.
- **Event images** (`catalog_schemas.py` `EventImageView`, `event_api.py`).
  `EventView.images`/`cover_image_url` are typed. The gallery uploads raw PNG/JPEG
  with `alt_text`, reorders via `PUT …/images/order`, sets the cover via
  `PUT …/images/{id}/cover` and deletes. The list is replaced by each server
  answer. Images are fetched with the session because draft events need it.
- **Public settings** (`settings_api.py`). `upload_max_bytes` replaces the
  hardcoded 5 MB limits for images and support attachments. The admin settings
  page clears the cached values after a change.
- **Organizations** (`organization_api.py`). `PATCH /organizations/{id}` (profile)
  and `PUT …/members/{id}/permissions` (owner-only) are wired.
- **Admin** (`ADMIN_API.md`, `admin_commerce.py`). Paid-sales checklist,
  suspend and reinstate (with `Idempotency-Key`), and the payments,
  failed-payments and refunds lists with exact filters and CSV export. Free-text
  `q` is never sent for commerce kinds, because the server refuses it (422).
- **Notifications** (`notification_service.py`). The seven new kinds (account,
  event and paid-sales suspension/reinstatement, and `payout_status`) use the
  backend wording in en/ru/kk. Targets `organizer_event` and `account` are
  routed.
- **Error codes.** Messages were added for the image, analytics, payout and admin
  codes these routes return.

Deliberately not wired: `PUT`/`DELETE /events/{id}/access` (it needs a user id and
there is no organizer-visible user lookup) and the `/scanner/*` and offline routes
(mobile app scope).

Verification for this round: `tsc --noEmit` clean, 421 tests in 63 files passing,
the translation audit clean and `vite build` succeeding. The Compose stack was
not running, so these screens were not exercised against a live backend. The
routers were confirmed mounted in `backend/app/main.py`.

## Live validation and CI

The fetched `.github/workflows/smoke.yml` already starts Compose and runs
`tools/smoke_admission.py` and the updated `tools/smoke_paid_checkout.py`.
The first covers free issuance, QR/entry confirmation, admission and duplicate
rejection. The second covers activation, paid checkout/retry, campaign link,
discounted pricing, report reconciliation and organizer refunds. A duplicate
workflow was not added.

The existing Web workflow runs the new component, localization, source-string
and contrast tests when these web changes are included.

On 2026-11-09, after the user updated the branch and started Compose, the API,
proxy and Mailpit endpoints returned HTTP 200. Both existing smoke scripts ran
successfully from `web/`, against the running services:

```sh
python -u -B ../tools/smoke_admission.py
python -u -B ../tools/smoke_paid_checkout.py
```

Both exited zero with `SMOKE PASSED`. The free run issued a ticket QR, required
entry confirmation, admitted the attendee, and rejected duplicate, unassigned,
forged and campaign-link scans. The paid run activated sales, resolved a campaign
link, applied the discount, retried a failed payment, issued/admitted the ticket,
reconciled the campaign report, and completed an organizer refund with stock release.
These runs create isolated demonstration accounts/events and Mailpit messages.

The proxy's JavaScript asset matched the current local production build.
Direct Docker engine access is still denied, but HTTP access was enough for the
API smoke suites. GitHub job status is unverified; these were local runs.

Chrome and Edge automation stalled during debugging attachment/page setup in
this session. No browser-flow or screen-reader acceptance is claimed. Temporary
browser data remains in the ignored `web/.browser-smoke/` directory because
automatic approval review rejected process/profile cleanup (sandbox approval
is disabled). No browser automation helper was retained as a passing test.

The running local HTTP proxy has no CSP, X-Frame-Options, Referrer-Policy or
X-Content-Type-Options headers. The staged HTTPS configuration has not been
installed. HSTS is also absent, as expected for localhost HTTP.
