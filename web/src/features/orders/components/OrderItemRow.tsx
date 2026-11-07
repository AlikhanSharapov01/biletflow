import type { OrderItem, Profile } from "../../../api/types";
import { ButtonLink } from "../../../components/ui/Button";
import { ListRow } from "../../../components/ui/ListRow";
import { StatusPill } from "../../../components/ui/StatusPill";
import { seatLabel, statusLabel } from "../../../utils/format";
import { ticketTone } from "../../../utils/status";

// One ticket in an order. Only the recipient's own tickets link to the QR.
export function OrderItemRow({ item, profile }: { item: OrderItem; profile: Profile | null }) {
  const mine = item.ticket?.qr_payload || (profile && item.recipient_email.toLowerCase() === profile.email.toLowerCase());
  return (
    <ListRow
      icon={item.unit_number}
      title={`${item.recipient_name} · ${item.ticket_type_name}`}
      meta={`${item.recipient_email} · ${seatLabel(item.seat_snapshot)}`}
      actions={
        <>
          <StatusPill tone={ticketTone(item.ticket?.status)}>{item.ticket ? statusLabel(item.ticket.status) : "pending"}</StatusPill>
          {item.ticket && mine ? (
            <ButtonLink size="sm" to={`/tickets/${encodeURIComponent(item.ticket.id)}`}>
              View ticket
            </ButtonLink>
          ) : (
            <small className="order-note">Emailed to the recipient</small>
          )}
        </>
      }
    />
  );
}
