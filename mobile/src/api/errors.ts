// Error codes come from the backend's `{"detail": {"code": "..."}}` bodies.
// Every code the current API emits that a person can act on has a message here.

export const NETWORK_MESSAGE =
  "Can’t reach BiletFlow right now. Check that the API is running and try again.";
export const SESSION_EXPIRED_MESSAGE = "Your session expired. Sign in again to continue.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don’t match.",
  email_not_verified: "Please verify your email before signing in.",
  invalid_token: "This link is invalid, expired or already used. Request a new one.",
  invalid_input: "Some details need attention. Review the form and try again.",
  invalid_filter_range: "The selected filter range is invalid.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  database_unavailable: "The service is temporarily unavailable. Please try again shortly.",
  suspended_account: "This account is unavailable. Contact support if you think this is a mistake.",
  permission_denied: "You don’t have permission to perform that action.",
  organization_not_found: "That organizer workspace is no longer available.",
  event_not_found: "That event is no longer available.",
  event_not_publishable: "This event cannot be published yet. Check its dates and ticket setup.",
  usable_ticket_type_required: "Add an available ticket type before publishing this event.",
  event_not_editable: "This event can no longer be edited.",
  event_not_published: "This event is not published.",
  event_not_on_sale: "Registration for this event is not open right now.",
  commerce_cancellation_required: "Tickets were already issued for this event, so it cannot be cancelled here yet.",
  capacity_below_allocations: "Capacity cannot go below the tickets already reserved or issued.",
  ticket_capacity_exceeded: "A ticket type cannot offer more tickets than the event capacity.",
  ticket_kind_has_history: "This ticket type already has reservations, so its kind cannot change.",
  ticket_configuration_conflict: "That ticket configuration conflicts with the event setup.",
  ticket_type_unavailable: "That ticket type is not available.",
  sales_window_closed: "Sales for that ticket type are closed right now.",
  event_capacity_exceeded: "Not enough places are left for that selection.",
  per_order_limit_exceeded: "That quantity is above the per-order limit for this ticket type.",
  too_many_active_holds: "You already have several reservations in progress. Finish or release one first.",
  hold_expired: "Your reservation expired. Choose your tickets again.",
  hold_not_found: "That reservation no longer exists.",
  hold_already_consumed: "That reservation was already confirmed.",
  paid_checkout_unavailable: "Paid tickets for this event are not on sale right now.",
  seats_required: "Choose your seats on the seat map before reserving.",
  assigned_seating_required: "This event uses assigned seating. Choose your seats on the seat map.",
  seat_unavailable: "One of the selected seats is no longer available.",
  recipient_allocation_mismatch: "Each reserved place needs exactly one recipient.",
  member_not_found: "That team member is not part of this workspace.",
  staff_not_found: "That staff assignment no longer exists.",
  user_not_found: "No account matches that email address.",
  invitation_not_found: "That invitation is no longer valid.",
  invalid_invitation: "This invitation is invalid, expired, revoked or addressed to a different email.",
  invitation_already_accepted: "This invitation was already accepted.",
  cannot_revoke_owner: "The workspace owner cannot be removed.",
  cannot_delegate_unheld_permission: "You can only grant permissions that you hold yourself.",
  cannot_revoke_unheld_permission: "You can only remove permissions that you hold yourself.",
  owner_permissions_are_implicit: "The owner already has every permission.",
  google_not_configured: "Google sign-in is not configured for this environment.",
  google_unavailable: "Google sign-in is temporarily unavailable. Please try again.",
  google_exchange_failed: "Google could not complete sign-in. Please try again.",
  google_authorization_denied: "Google sign-in was cancelled. You can try again whenever you’re ready.",
  account_link_required:
    "This Google account matches an existing BiletFlow account. Sign in with your password first, then link Google from your account.",
  invalid_oauth_state: "This Google sign-in expired or could not be verified. Please start again.",
  invalid_google_identity: "Google did not return a verified account. Try a different Google account.",
  google_identity_already_linked: "That Google account is linked to a different BiletFlow account.",
  // Support and notifications
  case_not_found: "That support case doesn’t exist or you no longer have access to it.",
  client_message_conflict: "This message was already sent with different content. Refresh and try again.",
  context_mismatch: "The event, order and ticket you linked don’t belong together.",
  order_not_found: "That order isn’t one of yours.",
  ticket_not_found: "That ticket isn’t assigned to you.",
  case_resolved: "This case is resolved. Only the requester can reopen it by replying.",
  status_unchanged: "The case already has that status.",
  assignment_unchanged: "The case is already assigned that way.",
  assignee_not_eligible: "That person can’t work on this case.",
  already_escalated: "This case was already escalated.",
  not_escalatable: "Platform cases can’t be escalated.",
  unsupported_media_type: "Only PNG, JPEG and PDF files can be attached.",
  attachment_too_large: "That file is larger than 5 MB.",
  attachment_empty: "That file is empty.",
  attachment_rejected: "That file’s contents don’t match its type.",
  attachment_not_available: "An attached file expired or was already used. Remove it and attach it again.",
  attachment_not_found: "That file is no longer available.",
  download_link_invalid: "This download link expired. Try again.",
  download_link_expired: "This download link expired. Try again.",
  notification_not_found: "That notification no longer exists.",
  // Checkout, tickets, events
  payment_required: "Paid tickets need payment. Continue to the payment step.",
  paid_sales_inactive: "Paid tickets for this event are not on sale yet.",
  quote_expired: "Your price quote expired. Choose your tickets again.",
  confirmation_conflict: "This reservation was already confirmed with different recipients.",
  seats_not_applicable: "This event doesn’t use seat selection.",
  duplicate_seat_selection: "Each seat can only be chosen once.",
  ticket_not_valid: "This ticket is no longer valid.",
  resend_too_soon: "Please wait a minute before re-sending this ticket.",
  resend_limit_reached: "This ticket was re-sent the maximum number of times.",
  already_checked_in: "This ticket has already been checked in.",
  admission_closed: "Admission for this event has closed.",
  sign_in_required: "Sign in again to confirm entry.",
  event_cancelled: "This event was cancelled.",
  report_rate_limited: "You’ve sent several reports recently. Please try again later.",
  promo_not_found: "That promo code doesn’t exist.",
  promo_expired: "That promo code has expired.",
  promo_disabled: "That promo code is no longer active.",
  promo_exhausted: "That promo code has been fully used.",
  promo_not_applicable: "That promo code doesn’t apply to these tickets.",
  promo_requote_required: "The promo changed. Choose your tickets again for a new price.",
  campaign_not_found: "That campaign no longer exists for this event.",
  promo_code_taken: "That promo code is already used in this event.",
  campaign_locked: "This campaign has redemptions. Its discount, ticket types and code cannot change.",
  promo_limit_below_usage: "The limit cannot be below completed orders plus active reservations.",
  free_order_use_cancel: "This order is free. Cancel the registration instead.",
  full_order_refund_required: "Paid tickets must be refunded as a whole order.",
  order_not_refundable: "This order is not in a state that allows a refund.",
  order_not_cancellable: "This order is not in a state that allows cancellation.",
  ticket_checked_in: "Reverse the ticket’s admission before cancelling or refunding it.",
  refund_not_allowed: "The saved policy for this order does not allow refunds.",
  refund_cutoff_passed: "The refund deadline for this order has passed.",
  idempotency_key_reused: "That request was already sent with different details. Start again.",
  invalid_idempotency_key: "The app sent an invalid request. Try again.",
  analytics_range_too_large: "That range has too many points. Choose a shorter range or group by day.",
  invalid_analytics_filter: "That filter doesn’t belong to this event. Clear the filters and try again.",
  image_empty: "That image file is empty.",
  image_rejected: "That image couldn’t be read. Choose a different PNG or JPEG.",
  image_too_large: "That image is too large. Choose one under the upload limit.",
  image_limit_reached: "An event can have up to 10 images. Delete one to add another.",
  image_not_found: "That image no longer exists. Refresh the event.",
  image_upload_expired: "The upload took too long. Try again.",
  invalid_image_order: "The gallery changed. Refresh the event and try again.",
  insufficient_payable_balance: "That amount is more than can be paid out now.",
  payout_not_yet_eligible: "Payouts can be sent once the event has ended.",
  invalid_payout_transition: "That payout has already moved past this step.",
  payout_environment_mismatch: "Some payments came from a different environment, so they can’t fund a demo payout.",
  payout_not_found: "That payout no longer exists. Refresh the page.",
  payout_profile_not_verified: "Verify the payout profile on the Paid sales tab first.",
  storage_unavailable: "File storage is unavailable right now. Try again shortly.",
  // Organizer tools and platform admin
  activation_incomplete: "Finish every paid-sales step before paying the activation fee.",
  paid_sales_suspended: "Paid sales for this event are suspended by the platform.",
  terms_version_outdated: "The terms changed. Reload and accept the latest version.",
  provider_event_conflict: "That simulated payment update conflicts with an earlier one.",
  seats_already_configured: "Seats for this event are already set up.",
  price_category_mapping_required: "Choose a ticket type for every price category.",
  ticket_type_event_mismatch: "That ticket type belongs to another event.",
  seat_capacity_conflict: "Unblocked seats exceed the event capacity.",
  seat_ticket_limit_conflict: "Unblocked seats exceed a ticket type’s quantity.",
  seat_has_allocation: "This seat is reserved or sold and cannot change.",
  seat_has_history: "This seat has sales history, so its ticket type cannot change.",
  usable_seats_required: "Assigned-seating events need at least one sellable seat.",
  layout_already_in_use: "The layout cannot change after tickets were reserved.",
  layout_venue_mismatch: "That layout belongs to a different venue.",
  invalid_range: "The end of the range must be after the start.",
  export_too_large: "Too many rows to export. Narrow the date range.",
  already_resolved: "This conflict was already resolved.",
  no_admission_to_reverse: "There is no admission to reverse for this conflict.",
  already_reversed: "That admission was already reversed.",
  admin_required: "This area is for platform administrators.",
  admin_cannot_be_suspended: "Platform admins cannot be suspended.",
  user_already_suspended: "That account is already suspended.",
  user_not_suspended: "That account is not suspended.",
  event_already_suspended: "That event is already suspended.",
  event_not_suspended: "That event is not suspended.",
  report_not_open: "Only open reports can be moved to review.",
  report_already_resolved: "This report was already resolved.",
  setting_version_conflict: "Another admin changed this setting. Review the latest value.",
  setting_out_of_range: "That value is outside the allowed range.",
  invalid_effective_at: "Choose a time from now up to a year ahead.",
};

export function failureMessage(code: string | undefined, status: number): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (status === 401) return "Please sign in to continue.";
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 404) return "This item could not be found.";
  if (status === 409) return code ? `This change conflicts with the current state (${code.replace(/_/g, " ")}).` : "This change conflicts with the current state. Refresh and try again.";
  if (status === 422) return "Some details need attention. Review the form and try again.";
  if (status >= 500) return "The service is temporarily unavailable. Please try again shortly.";
  return "Something went wrong. Please try again.";
}

export function googleErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Google sign-in could not be completed. Please try again.";
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function errorCodeOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
