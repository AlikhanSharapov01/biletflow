// What the door staff sees for each admission outcome. Codes come from the
// check-in contract in backend/ADMISSION_API.md. Every state has its own
// icon and title, not just a colour, so it reads at a glance in a dark venue.

import type { CheckInOutcome } from "@/api/scanner";
import { formatEventMoment } from "@/utils/eventTime";

export type Tone = "admitted" | "warning" | "rejected" | "offline";

export type OutcomeView = {
  tone: Tone;
  icon: string;
  title: string;
  lines: string[];
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

  const known = REJECTIONS[outcome.code];
  return {
    tone: "rejected",
    icon: "✕",
    title: known?.title ?? "Can't admit",
    lines: known?.lines ?? ["Something went wrong checking this ticket. Try scanning again."],
  };
}
