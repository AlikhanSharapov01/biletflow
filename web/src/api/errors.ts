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
  paid_checkout_unavailable: "Paid tickets cannot be bought yet. Free tickets are available.",
  seats_required: "This event uses assigned seating, which the browser does not support yet.",
  assigned_seating_required: "This event uses assigned seating, which the browser does not support yet.",
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
