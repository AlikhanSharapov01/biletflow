// What the door staff sees for each admission outcome. Codes come from the
// check-in contract in backend/ADMISSION_API.md. Every state has its own
// icon and title, not just a colour, so it reads at a glance in a dark venue.

import type { CheckInOutcome, ReversalResult } from "@/api/types/scanner";
import { formatEventMoment } from "@/utils/eventTime";

export type Tone = "admitted" | "warning" | "rejected" | "offline";

export type OutcomeView = {
  tone: Tone;
  icon: string;
  title: string;
  lines: string[];
  // The ticket is fine but the attendee's entry confirmation is missing or
  // unusable: offer to scan it or type its code.
  needsConfirmation?: boolean;
};

// Prefixes the server uses for the two attendee codes (backend/app/signing.py).
export const ENTRY_CONFIRMATION_PREFIX = "biletflow:entry:";

export function isEntryConfirmation(payload: string): boolean {
  return payload.startsWith(ENTRY_CONFIRMATION_PREFIX);
}

export function isEntryCode(code: string): boolean {
  return /^\d{8}$/.test(code);
}

const CONFIRMATION_REJECTIONS: Record<string, Omit<OutcomeView, "tone" | "icon">> = {
  sign_in_required: {
    title: "Entry confirmation needed",
    lines: ["Ask the guest to open their ticket and show the entry confirmation, or read out its 8-digit code."],
  },
  confirmation_expired: {
    title: "Confirmation expired",
    lines: ["The entry confirmation is too old. Ask the guest to create a new one on their ticket."],
  },
  confirmation_used: {
    title: "Confirmation already used",
    lines: ["This entry confirmation was used or replaced. Ask the guest for a new one."],
  },
  invalid_confirmation: {
    title: "Confirmation not valid",
    lines: ["This entry confirmation doesn't belong to this ticket or event. Ask the guest for a new one."],
  },
  offline_code_unavailable: {
    title: "Scan the confirmation QR",
    lines: ["The 8-digit code can't be checked without a connection. Scan the guest's confirmation QR instead."],
  },
};

const TICKET_STATUS: Record<string, string> = {
  cancelled: "This ticket was cancelled.",
  refunded: "This ticket was refunded.",
  refund_pending: "A refund is in progress for this ticket.",
};

const REJECTIONS: Record<string, Omit<OutcomeView, "tone" | "icon">> = {
  ticket_unclaimed: {
    title: "Ticket not claimed",
    lines: ["The ticket holder hasn't linked this ticket to their account yet."],
  },
  wrong_event: {
    title: "Wrong event",
    lines: ["This ticket is for a different event."],
  },
  admission_not_open: {
    title: "Admission not open yet",
    lines: ["Entry for this event hasn't started."],
  },
  admission_closed: {
    title: "Admission closed",
    lines: ["Entry for this event has ended."],
  },
  ticket_not_found: {
    title: "Invalid ticket",
    lines: ["This QR code doesn't match any ticket. It may be forged or edited."],
  },
  not_a_ticket_qr: {
    title: "Not a ticket",
    lines: ["This QR code isn't an admission ticket (for example, a promo code)."],
  },
  event_not_found: {
    title: "Not authorized",
    lines: ["You're no longer assigned to scan this event."],
  },
  permission_denied: {
    title: "Not authorized",
    lines: ["You don't have permission to scan this event."],
  },
  operation_conflict: {
    title: "Scan conflict",
    lines: ["Please scan the ticket again."],
  },
  offline_unknown_ticket: {
    title: "Not on the offline list",
    lines: ["This ticket isn't on this phone's list. It may be forged, unclaimed, or issued after the list was downloaded."],
  },
};

export function describeOutcome(outcome: CheckInOutcome, timeZone: string): OutcomeView {
  if (outcome.kind === "admitted") {
    const lines = [outcome.attendee_name, outcome.ticket_type_name];
    if (outcome.seat) {
      lines.push(
        `Section ${outcome.seat.section_label} · Row ${outcome.seat.row_label} · Seat ${outcome.seat.seat_label}`
      );
    }
    return { tone: "admitted", icon: "✓", title: "Admitted", lines };
  }

  if (outcome.kind === "queued") {
    const lines = [outcome.attendee_name, outcome.ticket_type_name];
    if (outcome.seat) {
      lines.push(
        `Section ${outcome.seat.section_label} · Row ${outcome.seat.row_label} · Seat ${outcome.seat.seat_label}`
      );
    }
    lines.push("Provisional until this phone syncs.");
    return { tone: "admitted", icon: "✓", title: "Accepted offline", lines };
  }

  if (outcome.kind === "network") {
    return {
      tone: "offline",
      icon: "!",
      title: "No connection",
      lines: ["The ticket wasn't checked. Retry when you're back online."],
    };
  }

  if (outcome.code === "already_checked_in") {
    return {
      tone: "warning",
      icon: "!",
      title: "Already used",
      lines: [
        outcome.checkedInAt
          ? `Checked in at ${formatEventMoment(outcome.checkedInAt, timeZone)}.`
          : "This ticket has already been checked in.",
      ],
    };
  }

  if (outcome.code === "ticket_not_valid") {
    return {
      tone: "rejected",
      icon: "✕",
      title: "Not valid",
      lines: [
        (outcome.ticketStatus && TICKET_STATUS[outcome.ticketStatus]) ??
          "This ticket can't be used for entry.",
      ],
    };
  }

  const confirmation = CONFIRMATION_REJECTIONS[outcome.code];
  if (confirmation) {
    return { tone: "warning", icon: "?", needsConfirmation: true, ...confirmation };
  }

  const known = REJECTIONS[outcome.code];
  return {
    tone: "rejected",
    icon: "✕",
    title: known?.title ?? "Can't admit",
    lines: known?.lines ?? ["Something went wrong checking this ticket. Try scanning again."],
  };
}

// After an accidental admission is undone. The ticket normally goes back to
// valid; one cancelled or refunded after entry keeps that status instead.
export function describeReversal(result: ReversalResult, attendeeName: string): OutcomeView {
  return {
    tone: "warning",
    icon: "↺",
    title: "Admission undone",
    lines: [
      attendeeName,
      result.ticket_status === "valid"
        ? "The ticket can be scanned again."
        : (TICKET_STATUS[result.ticket_status] ?? "This ticket can't be used for entry."),
    ],
  };
}
