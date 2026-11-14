// What the door staff sees for each admission outcome. Codes come from the
// check-in contract in backend/ADMISSION_API.md. Every state has its own
// icon and title, not just a colour, so it reads at a glance in a dark venue.

import type { CheckInOutcome, ReversalResult } from "@/api/types/scanner";
import { formatEventMoment } from "@/utils/eventTime";
import { t } from "@/i18n";

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
    get title() { return t("mobile.scan.confirmation_needed"); },
    get lines() { return [t("mobile.scan.confirmation_needed_hint")]; },
  },
  confirmation_expired: {
    get title() { return t("mobile.scan.confirmation_expired"); },
    get lines() { return [t("mobile.scan.confirmation_expired_hint")]; },
  },
  confirmation_used: {
    get title() { return t("mobile.scan.confirmation_used"); },
    get lines() { return [t("mobile.scan.confirmation_used_hint")]; },
  },
  invalid_confirmation: {
    get title() { return t("mobile.scan.confirmation_invalid"); },
    get lines() { return [t("mobile.scan.confirmation_invalid_hint")]; },
  },
  offline_code_unavailable: {
    get title() { return t("mobile.scan.scan_confirmation_qr"); },
    get lines() { return [t("mobile.scan.code_needs_connection")]; },
  },
};

const TICKET_STATUS: Record<string, string> = {
  get cancelled() { return t("mobile.scan.ticket_cancelled"); },
  get refunded() { return t("mobile.scan.ticket_refunded"); },
  get refund_pending() { return t("mobile.scan.ticket_refund_pending"); },
};

const REJECTIONS: Record<string, Omit<OutcomeView, "tone" | "icon">> = {
  ticket_unclaimed: {
    get title() { return t("mobile.scan.not_claimed"); },
    get lines() { return [t("mobile.scan.not_claimed_hint")]; },
  },
  wrong_event: {
    get title() { return t("mobile.scan.wrong_event"); },
    get lines() { return [t("mobile.scan.wrong_event_hint")]; },
  },
  admission_not_open: {
    get title() { return t("mobile.scan.not_open"); },
    get lines() { return [t("mobile.scan.not_open_hint")]; },
  },
  admission_closed: {
    get title() { return t("mobile.scan.closed"); },
    get lines() { return [t("mobile.scan.closed_hint")]; },
  },
  ticket_not_found: {
    get title() { return t("mobile.scan.invalid_ticket"); },
    get lines() { return [t("mobile.scan.invalid_ticket_hint")]; },
  },
  not_a_ticket_qr: {
    get title() { return t("mobile.scan.not_a_ticket"); },
    get lines() { return [t("mobile.scan.not_a_ticket_hint")]; },
  },
  event_not_found: {
    get title() { return t("mobile.scan.not_authorized"); },
    get lines() { return [t("mobile.scan.no_longer_assigned")]; },
  },
  permission_denied: {
    get title() { return t("mobile.scan.not_authorized"); },
    get lines() { return [t("mobile.scan.no_permission")]; },
  },
  operation_conflict: {
    get title() { return t("mobile.scan.conflict"); },
    get lines() { return [t("mobile.scan.scan_again")]; },
  },
  offline_unknown_ticket: {
    get title() { return t("mobile.scan.not_on_list"); },
    get lines() { return [t("mobile.scan.not_on_list_hint")]; },
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
    return { tone: "admitted", icon: "✓", title: t("org.admitted"), lines };
  }

  if (outcome.kind === "queued") {
    const lines = [outcome.attendee_name, outcome.ticket_type_name];
    if (outcome.seat) {
      lines.push(
        `Section ${outcome.seat.section_label} · Row ${outcome.seat.row_label} · Seat ${outcome.seat.seat_label}`
      );
    }
    lines.push("Provisional until this phone syncs.");
    return { tone: "admitted", icon: "✓", title: t("mobile.scan.accepted_offline"), lines };
  }

  if (outcome.kind === "network") {
    return {
      tone: "offline",
      icon: "!",
      title: t("mobile.scan.no_connection"),
      lines: [t("mobile.scan.not_checked_offline")],
    };
  }

  if (outcome.code === "already_checked_in") {
    return {
      tone: "warning",
      icon: "!",
      title: t("mobile.scan.already_used"),
      lines: [
        outcome.checkedInAt
          ? t("mobile.scan.checked_in_at", { p0: formatEventMoment(outcome.checkedInAt, timeZone) })
          : t("api.already_checked_in"),
      ],
    };
  }

  if (outcome.code === "ticket_not_valid") {
    return {
      tone: "rejected",
      icon: "✕",
      title: t("mobile.scan.not_valid"),
      lines: [
        (outcome.ticketStatus && TICKET_STATUS[outcome.ticketStatus]) ??
          t("mobile.scan.cant_be_used"),
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
    title: known?.title ?? t("mobile.scan.cant_admit"),
    lines: known?.lines ?? [t("mobile.scan.check_failed")],
  };
}

// After an accidental admission is undone. The ticket normally goes back to
// valid; one cancelled or refunded after entry keeps that status instead.
export function describeReversal(result: ReversalResult, attendeeName: string): OutcomeView {
  return {
    tone: "warning",
    icon: "↺",
    title: t("mobile.scan.admission_undone"),
    lines: [
      attendeeName,
      result.ticket_status === "valid"
        ? t("mobile.scan.can_scan_again")
        : (TICKET_STATUS[result.ticket_status] ?? t("mobile.scan.cant_be_used")),
    ],
  };
}
