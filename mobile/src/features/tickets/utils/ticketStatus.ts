import type { TicketAdmission, TicketDelivery } from "@/api/types/checkout";
import type { StatusTone } from "@/utils/status";
import { t } from "@/i18n";

const DELIVERY: Record<string, { label: string; tone: StatusTone }> = {
  none: { get label() { return t("tickets.not_sent"); }, tone: "neutral" },
  queued: { get label() { return t("tickets.queued"); }, tone: "pending" },
  sending: { get label() { return t("tickets.sending"); }, tone: "pending" },
  delivered: { get label() { return t("tickets.delivered"); }, tone: "positive" },
  failed: { get label() { return t("tickets.delivery_failed"); }, tone: "blocked" },
};

export function deliveryLook(status: string): { label: string; tone: StatusTone } {
  return DELIVERY[status] ?? { label: status.replace(/_/g, " "), tone: "neutral" };
}

export interface AdmissionSummary {
  label: string;
  tone: StatusTone;
  detail: string;
}

// Plain-language admission state for the attendee.
export function admissionSummary(admission: TicketAdmission, now: Date = new Date()): AdmissionSummary {
  if (admission.status === "checked_in" && admission.checked_in_at) {
    return { label: t("tickets.checked_in"), tone: "positive", detail: t("tickets.admitted") };
  }
  if (admission.status !== "valid" && admission.status !== "checked_in") {
    return { label: admission.status.replace(/_/g, " "), tone: "blocked", detail: t("tickets.invalid_entry") };
  }
  if (admission.reversed_at) {
    return {
      label: t("tickets.admission_reversed"),
      tone: "pending",
      detail: t("tickets.admission_reversed_hint"),
    };
  }
  const opens = new Date(admission.admission_window.opens_at).getTime();
  const closes = new Date(admission.admission_window.closes_at).getTime();
  if (now.getTime() < opens) return { label: t("tickets.doors_not_open"), tone: "neutral", detail: t("tickets.admission_not_open") };
  if (now.getTime() > closes) return { label: t("tickets.doors_closed"), tone: "neutral", detail: t("tickets.admission_closed") };
  return {
    label: t("tickets.doors_open"),
    tone: "positive",
    detail: t("tickets.admission_open"),
  };
}

// The resend button is only offered when the server says it is allowed.
export function resendHint(delivery: TicketDelivery): string {
  if (delivery.can_resend) return "";
  if (delivery.ticket_status !== "valid") return t("tickets.resend_valid_only");
  if (delivery.resend_count >= 5) return t("tickets.resend_max");
  return delivery.next_resend_at ? t("tickets.resend_soon") : t("tickets.resend_unavailable");
}

// The PDF is refused for refunded, cancelled and refund-pending tickets.
export function isPrintable(ticket: { qr_payload: string | null; status: string }): boolean {
  return Boolean(ticket.qr_payload) && (ticket.status === "valid" || ticket.status === "checked_in");
}
