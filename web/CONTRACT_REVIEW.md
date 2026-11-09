# Backend contract review

Reviewed against fetched `origin/main` at `eec9a75`, including backend commit
`7195486`. Backend files were read from Git; they were not checked out or edited.
The local branch remains `ershuku-web`. Only web files are changed.

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

## Still awaiting contracts

`ANALYTICS_API.md` and a final finance API contract do not exist in the fetched
tree. No event analytics, finance summary or event image upload routes were
found there. Their planned web types and unavailable states remain explicit.
No planned response shape has been presented as a confirmed backend contract.

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
