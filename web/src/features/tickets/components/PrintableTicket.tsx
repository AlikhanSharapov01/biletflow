import { t, useLocale } from "../../../i18n";
import type { IssuedTicket } from "../../../api/types";
import { FactList } from "../../../components/ui/FactList";
import { Panel } from "../../../components/ui/Panel";
import { dateLabel, seatLabel, statusLabel } from "../../../utils/format";
import { TicketQr } from "./TicketQr";

// The QR and ticket facts; the print stylesheet turns this into a paper ticket.
export function PrintableTicket({ ticket }: { ticket: IssuedTicket }) {
  useLocale();
  return (
    <Panel className="printable-ticket">
      <div className="printable-ticket-grid">
        <TicketQr payload={ticket.qr_payload} />
        <div className="printable-ticket-copy">
          <p className="eyebrow">BiletFlow</p>
          <h2>{ticket.event_title}</h2>
          <FactList
            items={[
              { label: t("tickets.when"), value: dateLabel(ticket.event_starts_at) },
              { label: t("tickets.where"), value: ticket.venue_name },
              { label: t("common.ticket"), value: `${ticket.ticket_type_name} · ${seatLabel(ticket.seat_snapshot)}` },
              { label: t("tickets.attendee"), value: ticket.recipient_name },
              { label: t("tickets.id"), value: <code>{ticket.id}</code> },
              { label: t("common.status"), value: t("tickets.issued_meta", { p0: statusLabel(ticket.status), p1: dateLabel(ticket.issued_at) }) },
            ]}
          />
          <p className="ticket-footnote">{t("tickets.qr_instructions")}{" "}</p>
        </div>
      </div>
    </Panel>
  );
}
