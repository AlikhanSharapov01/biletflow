import type { Attendee } from "../../../api/types";

export interface TypeCount {
  ticketTypeId: string;
  name: string;
  issued: number;
  checkedIn: number;
  cancelled: number;
}

// Issued / checked-in / cancelled-or-refunded counts per ticket type, in the
// order types first appear.
export function countByTicketType(rows: Attendee[]): TypeCount[] {
  const counts = new Map<string, TypeCount>();
  for (const row of rows) {
    const entry = counts.get(row.ticket_type_id) ?? { ticketTypeId: row.ticket_type_id, name: row.ticket_type_name, issued: 0, checkedIn: 0, cancelled: 0 };
    entry.issued += 1;
    if (row.status === "checked_in") entry.checkedIn += 1;
    if (row.status === "cancelled" || row.status === "refunded" || row.status === "refund_pending") entry.cancelled += 1;
    counts.set(row.ticket_type_id, entry);
  }
  return [...counts.values()];
}
