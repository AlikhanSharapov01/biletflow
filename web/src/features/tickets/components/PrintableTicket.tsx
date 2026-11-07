import type { IssuedTicket } from "../../../api/types";
import { FactList } from "../../../components/ui/FactList";
import { Panel } from "../../../components/ui/Panel";
import { dateLabel, seatLabel, statusLabel } from "../../../utils/format";
import { TicketQr } from "./TicketQr";

// The QR and ticket facts; the print stylesheet turns this into a paper ticket.
export function PrintableTicket({ ticket }: { ticket: IssuedTicket }) {
  return (
    <Panel className="printable-ticket">
      <div className="printable-ticket-grid">
        <TicketQr payload={ticket.qr_payload} />
        <div className="printable-ticket-copy">
          <p className="eyebrow">BiletFlow</p>
          <h2>{ticket.event_title}</h2>
          <FactList
            items={[
              { label: "When", value: dateLabel(ticket.event_starts_at) },
              { label: "Where", value: ticket.venue_name },
              { label: "Ticket", value: `${ticket.ticket_type_name} · ${seatLabel(ticket.seat_snapshot)}` },
              { label: "Attendee", value: ticket.recipient_name },
              { label: "Ticket ID", value: <code>{ticket.id}</code> },
              { label: "Status", value: `${statusLabel(ticket.status)} · issued ${dateLabel(ticket.issued_at)}` },
            ]}
          />
          <p className="ticket-footnote">
            Present this QR code at the entrance. A printed copy and the on-screen copy share one ticket ID, so only one can be admitted.
          </p>
        </div>
      </div>
    </Panel>
  );
}
