import type { IssuedTicket } from "@/api/types/checkout";
import { DateTile, ListRow, StatusPill } from "@/components/ui";
import { browserTimeZone, dateLabel, seatLabel, statusLabel } from "@/utils/format";
import { ticketTone } from "@/utils/status";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// One ticket in the Tickets tab; pressing it opens the QR.
export function TicketRow({ ticket, onOpen }: { ticket: IssuedTicket; onOpen: (ticketId: string) => void }) {
  useLocale();
  return (
    <ListRow
      icon={<DateTile at={ticket.event_starts_at} timeZone={browserTimeZone()} />}
      title={ticket.event_title}
      meta={`${dateLabel(ticket.event_starts_at)} · ${ticket.venue_name}`}
      note={`${ticket.ticket_type_name} · ${seatLabel(ticket.seat_snapshot)}`}
      trailing={<StatusPill tone={ticketTone(ticket.status)} label={statusLabel(ticket.status)} />}
      onPress={() => onOpen(ticket.id)}
      accessibilityLabel={t("mobile.tickets.show_qr_for", { p0: ticket.event_title })}
    />
  );
}
