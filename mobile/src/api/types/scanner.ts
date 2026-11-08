// Admission wire types, mirroring backend/app/admission_schemas.py, plus the
// client-side CheckInOutcome union the scan screen renders.

export type AssignedEvent = {
  id: string;
  title: string;
  venue: {
    name: string;
    address: string;
    city: string;
  };
  starts_at: string;
  ends_at: string;
  time_zone: string;
  admission_opens_at: string;
  admission_closes_at: string;
  time_status: "upcoming" | "active" | "completed";
};

export type AdmissionCounts = {
  event_id: string;
  registered: number;
  admitted: number;
};

export type Seat = {
  section_label: string;
  row_label: string;
  seat_label: string;
};

export type CheckInResult = {
  result: string;
  check_in_id: string;
  ticket_id: string;
  event_id: string;
  attendee_name: string;
  ticket_type_name: string;
  seat: Seat | null;
  checked_in_at: string;
  // true when this was a retry of an operation the server already admitted.
  replayed: boolean;
};

export type ReversalResult = {
  check_in_id: string;
  ticket_id: string;
  // "valid" again, unless the ticket was cancelled or refunded after entry.
  ticket_status: string;
  reversed_at: string;
  reason: string;
};

// What a check-in admits: the scanned ticket QR, or a ticket id from manual
// search, with the attendee's entry confirmation when the event requires it.
export type CheckInTarget = {
  qrPayload?: string;
  ticketId?: string;
  entryConfirmation?: string;
  entryCode?: string;
};

// One manual-search hit (GET /scanner/events/{id}/attendees).
export type AttendeeHit = {
  ticket_id: string;
  attendee_name: string;
  ticket_type_name: string;
  seat: Seat | null;
  status: string;
  claimed: boolean;
  checked_in: boolean;
  check_in_id: string | null;
};

// A scan always ends in one of these; business rejections are results, not
// exceptions, so the scan screen can show each one.
export type CheckInOutcome =
  | ({ kind: "admitted" } & CheckInResult)
  | {
      kind: "rejected";
      code: string;
      // already_checked_in: when the earlier admission happened.
      checkedInAt?: string;
      // ticket_not_valid: cancelled / refunded / refund_pending.
      ticketStatus?: string;
    }
  | { kind: "network" };
