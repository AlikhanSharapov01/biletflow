import { t, translate } from "../i18n";
// Error codes come from the backend's `{"detail": {"code": "..."}}` bodies.
// Every code the current API emits that a person can act on has a message here.

export const NETWORK_MESSAGE =
  t("errors.network");
export const SESSION_EXPIRED_MESSAGE = t("errors.session");

const MESSAGES: Record<string, string> = {
  get invalid_credentials() { return t("api.invalid_credentials"); },
  get email_not_verified() { return t("api.email_not_verified"); },
  get invalid_token() { return t("api.invalid_token"); },
  get invalid_input() { return t("errors.validation"); },
  get invalid_filter_range() { return t("api.invalid_filter"); },
  get rate_limited() { return t("api.rate_limited"); },
  get database_unavailable() { return t("errors.unavailable"); },
  get suspended_account() { return t("api.suspended_account"); },
  get permission_denied() { return t("api.permission_denied"); },
  get organization_not_found() { return t("api.organization_missing"); },
  get event_not_found() { return t("api.event_missing"); },
  get event_not_publishable() { return t("api.event_not_publishable"); },
  get usable_ticket_type_required() { return t("api.ticket_type_required"); },
  get event_not_editable() { return t("api.event_not_editable"); },
  get event_not_published() { return t("api.event_not_published"); },
  get event_not_on_sale() { return t("api.event_not_on_sale"); },
  get commerce_cancellation_required() { return t("api.commerce_cancel_required"); },
  get capacity_below_allocations() { return t("api.capacity_below_allocations"); },
  get ticket_capacity_exceeded() { return t("api.ticket_capacity_exceeded"); },
  get ticket_kind_has_history() { return t("api.ticket_kind_history"); },
  get ticket_type_not_found() { return t("api.ticket_type_missing"); },
  get ticket_configuration_conflict() { return t("api.ticket_configuration"); },
  get ticket_type_unavailable() { return t("api.ticket_type_unavailable"); },
  get sales_window_closed() { return t("api.sales_closed"); },
  get event_capacity_exceeded() { return t("api.capacity_exceeded"); },
  get per_order_limit_exceeded() { return t("api.per_order_limit"); },
  get too_many_active_holds() { return t("api.too_many_holds"); },
  get hold_expired() { return t("checkout.expired"); },
  get hold_not_found() { return t("api.hold_missing"); },
  get hold_already_consumed() { return t("api.hold_consumed"); },
  get paid_checkout_unavailable() { return t("api.paid_unavailable"); },
  get seats_required() { return t("api.seats_required"); },
  get assigned_seating_required() { return t("api.assigned_seating"); },
  get seat_unavailable() { return t("api.seat_unavailable"); },
  get recipient_allocation_mismatch() { return t("api.recipient_mismatch"); },
  get member_not_found() { return t("api.member_missing"); },
  get staff_not_found() { return t("api.staff_missing"); },
  get user_not_found() { return t("api.user_missing"); },
  get invitation_not_found() { return t("api.invitation_missing"); },
  get invalid_invitation() { return t("api.invalid_invitation"); },
  get invitation_already_accepted() { return t("api.invitation_accepted"); },
  get cannot_revoke_owner() { return t("api.revoke_owner"); },
  get cannot_delegate_unheld_permission() { return t("api.delegate_permission"); },
  get cannot_revoke_unheld_permission() { return t("api.revoke_permission"); },
  get owner_permissions_are_implicit() { return t("api.owner_permissions"); },
  get google_not_configured() { return t("api.google_not_configured"); },
  get google_unavailable() { return t("api.google_unavailable"); },
  get google_exchange_failed() { return t("api.google_exchange_failed"); },
  get google_authorization_denied() { return t("api.google_denied"); },
  get account_link_required() { return t("api.google_link_required"); },
  get invalid_oauth_state() { return t("api.google_state"); },
  get invalid_google_identity() { return t("api.google_identity"); },
  get google_identity_already_linked() { return t("api.google_already_linked"); },
  // Support and notifications
  get case_not_found() { return t("api.case_missing"); },
  get client_message_conflict() { return t("api.message_conflict"); },
  get context_mismatch() { return t("api.context_mismatch"); },
  get order_not_found() { return t("api.order_missing"); },
  get ticket_not_found() { return t("api.ticket_missing"); },
  get case_resolved() { return t("api.case_resolved"); },
  get status_unchanged() { return t("api.status_unchanged"); },
  get assignment_unchanged() { return t("api.assignment_unchanged"); },
  get assignee_not_eligible() { return t("api.assignee_ineligible"); },
  get already_escalated() { return t("api.already_escalated"); },
  get not_escalatable() { return t("api.not_escalatable"); },
  get unsupported_media_type() { return t("api.unsupported_media"); },
  get attachment_too_large() { return t("api.file_too_large"); },
  get attachment_empty() { return t("api.file_empty"); },
  get attachment_rejected() { return t("api.file_rejected"); },
  get attachment_not_available() { return t("api.attachment_unavailable"); },
  get attachment_not_found() { return t("api.attachment_missing"); },
  get download_link_invalid() { return t("api.download_expired"); },
  get download_link_expired() { return t("api.download_expired"); },
  get notification_not_found() { return t("api.notification_missing"); },
  // Checkout, tickets, events
  get payment_required() { return t("api.payment_required"); },
  get paid_sales_inactive() { return t("api.paid_inactive"); },
  get quote_expired() { return t("api.quote_expired"); },
  // The web client sends no Idempotency-Key header yet, so this is defensive copy.
  get idempotency_key_reused() { return t("api.idempotency_conflict"); },
  get payment_not_found() { return t("api.payment_missing"); },
  get confirmation_conflict() { return t("api.confirmation_conflict"); },
  get seats_not_applicable() { return t("api.seats_not_applicable"); },
  get duplicate_seat_selection() { return t("api.duplicate_seat"); },
  get ticket_not_valid() { return t("api.ticket_invalid"); },
  get resend_too_soon() { return t("api.resend_too_soon"); },
  get resend_limit_reached() { return t("tickets.resend_max"); },
  get already_checked_in() { return t("api.already_checked_in"); },
  get admission_closed() { return t("tickets.admission_closed"); },
  get sign_in_required() { return t("api.sign_in_entry"); },
  get event_cancelled() { return t("api.event_cancelled"); },
  get report_rate_limited() { return t("api.report_rate_limited"); },
  get promo_not_found() { return t("api.promo_missing"); },
  get promo_expired() { return t("api.promo_expired"); },
  get promo_disabled() { return t("api.promo_disabled"); },
  get promo_exhausted() { return t("api.promo_exhausted"); },
  get promo_not_applicable() { return t("api.promo_not_applicable"); },
  get promo_requote_required() { return t("api.promo_requote"); },
  get campaign_not_found() { return t("errors.campaign_not_found"); },
  get promo_code_taken() { return t("errors.promo_code_taken"); },
  get campaign_locked() { return t("errors.campaign_locked"); },
  get promo_limit_below_usage() { return t("errors.promo_limit_below_usage"); },
  get free_order_use_cancel() { return t("errors.free_order_use_cancel"); },
  get full_order_refund_required() { return t("errors.full_order_refund_required"); },
  get order_not_refundable() { return t("errors.order_not_refundable"); },
  get order_not_cancellable() { return t("errors.order_not_cancellable"); },
  get ticket_checked_in() { return t("errors.ticket_checked_in"); },
  get refund_not_allowed() { return t("errors.refund_not_allowed"); },
  get refund_cutoff_passed() { return t("errors.refund_cutoff_passed"); },
  // Organizer tools and platform admin
  get activation_incomplete() { return t("api.activation_incomplete"); },
  get paid_sales_suspended() { return t("api.paid_suspended"); },
  get terms_version_outdated() { return t("api.terms_outdated"); },
  get provider_event_conflict() { return t("api.provider_conflict"); },
  get seats_already_configured() { return t("api.seats_configured"); },
  get price_category_mapping_required() { return t("org.choose_type_per_category"); },
  get ticket_type_event_mismatch() { return t("api.ticket_type_event_mismatch"); },
  get seat_capacity_conflict() { return t("api.seat_capacity_conflict"); },
  get seat_ticket_limit_conflict() { return t("api.seat_ticket_limit"); },
  get seat_not_found() { return t("api.seat_missing"); },
  get seat_has_allocation() { return t("api.seat_allocated"); },
  get seat_has_history() { return t("api.seat_history"); },
  get usable_seats_required() { return t("api.usable_seats"); },
  get layout_already_in_use() { return t("api.layout_in_use"); },
  get layout_venue_mismatch() { return t("api.layout_venue_mismatch"); },
  get invalid_range() { return t("api.invalid_range"); },
  get export_too_large() { return t("api.export_too_large"); },
  get already_resolved() { return t("api.already_resolved"); },
  get no_admission_to_reverse() { return t("api.no_admission_reverse"); },
  get already_reversed() { return t("api.already_reversed"); },
  get admin_required() { return t("api.admin_required"); },
  get admin_cannot_be_suspended() { return t("api.admin_suspend"); },
  get user_already_suspended() { return t("api.user_already_suspended"); },
  get user_not_suspended() { return t("api.user_not_suspended"); },
  get event_already_suspended() { return t("api.event_already_suspended"); },
  get event_not_suspended() { return t("api.event_not_suspended"); },
  get report_not_open() { return t("api.report_not_open"); },
  get report_already_resolved() { return t("api.report_already_resolved"); },
  get setting_version_conflict() { return t("api.setting_conflict"); },
  get setting_out_of_range() { return t("api.setting_range"); },
  get invalid_effective_at() { return t("api.effective_at"); },
};

export function failureMessage(code: string | undefined, status: number): string {
  if (code && MESSAGES[code]) return translate(MESSAGES[code]);
  if (status === 401) return t("errors.sign_in");
  if (status === 403) return t("errors.permission");
  if (status === 404) return t("errors.not_found");
  if (status === 409) return code ? t("api.state_conflict_code", { p0: code.replace(/_/g, " ") }) : t("api.state_conflict");
  if (status === 422) return t("errors.validation");
  if (status >= 500) return t("errors.unavailable");
  return t("errors.generic");
}

export function googleErrorMessage(code: string): string {
  return MESSAGES[code] ?? t("api.google_generic");
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
  if (error instanceof Error && error.message) return translate(error.message);
  return t("errors.generic");
}

export function errorCodeOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

// True when the backend does not serve this endpoint yet (planned contract):
// FastAPI's own 404/405 carry no error code, unlike a real "not found".
export function isNotImplemented(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 501) return true;
  return (error.status === 404 || error.status === 405) && !error.code;
}
