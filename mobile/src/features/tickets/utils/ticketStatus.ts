import type { TicketAdmission, TicketDelivery } from "@/api/types/checkout";
import type { StatusTone } from "@/utils/status";

const DELIVERY: Record<string, { label: string; tone: StatusTone }> = {
  none: { label: "Not sent", tone: "neutral" },
  queued: { label: "Queued", tone: "pending" },
  sending: { label: "Sending", tone: "pending" },
  delivered: { label: "Delivered", tone: "positive" },
  failed: { label: "Delivery failed", tone: "blocked" },
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
    return { label: "Checked in", tone: "positive", detail: "You are checked in. Enjoy the event." };
  }
  if (admission.status !== "valid" && admission.status !== "checked_in") {
    return { label: admission.status.replace(/_/g, " "), tone: "blocked", detail: "This ticket can no longer be used for entry." };
  }
  if (admission.reversed_at) {
    return {
      label: "Admission reversed",
      tone: "pending",
      detail: "Staff undid your check-in. Show your ticket and a new entry confirmation to enter again.",
    };
  }
  const opens = new Date(admission.admission_window.opens_at).getTime();
  const closes = new Date(admission.admission_window.closes_at).getTime();
  if (now.getTime() < opens) return { label: "Doors not open", tone: "neutral", detail: "Admission has not opened yet." };
  if (now.getTime() > closes) return { label: "Doors closed", tone: "neutral", detail: "Admission for this event has closed." };
  return {
    label: "Doors open",
    tone: "positive",
    detail: "Admission is open. Show your ticket QR and an entry confirmation at the gate.",
  };
}

// The resend button is only offered when the server says it is allowed.
export function resendHint(delivery: TicketDelivery): string {
  if (delivery.can_resend) return "";
  if (delivery.ticket_status !== "valid") return "Only valid tickets can be re-sent.";
  if (delivery.resend_count >= 5) return "This ticket was re-sent the maximum number of times.";
  return delivery.next_resend_at ? "You can re-send again shortly." : "Re-sending is not available right now.";
}

// The PDF is refused for refunded, cancelled and refund-pending tickets.
export function isPrintable(ticket: { qr_payload: string | null; status: string }): boolean {
  return Boolean(ticket.qr_payload) && (ticket.status === "valid" || ticket.status === "checked_in");
}
