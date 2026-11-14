import { StyleSheet, Text } from "react-native";

import type { Profile } from "@/api/types/auth";
import type { OrderItem } from "@/api/types/checkout";
import { ListRow, StatusPill } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { seatLabel, statusLabel } from "@/utils/format";
import { ticketTone } from "@/utils/status";
import { t, useLocale } from "@/i18n";

interface OrderItemRowProps {
  item: OrderItem;
  profile: Profile | null;
  onOpenTicket: (ticketId: string) => void;
}

// One ticket in an order. Only the recipient's own tickets link to the QR.
export function OrderItemRow({ item, profile, onOpenTicket }: OrderItemRowProps) {
  useLocale();
  const mine = Boolean(
    item.ticket?.qr_payload || (profile && item.recipient_email.toLowerCase() === profile.email.toLowerCase()),
  );
  const ticket = item.ticket;
  const openable = ticket !== null && mine;
  return (
    <ListRow
      icon={String(item.unit_number)}
      title={`${item.recipient_name} · ${item.ticket_type_name}`}
      meta={`${item.recipient_email} · ${seatLabel(item.seat_snapshot)}`}
      note={openable ? undefined : <Text style={styles.note}>{t("tickets.emailed_recipient")}</Text>}
      trailing={<StatusPill tone={ticketTone(ticket?.status)} label={ticket ? statusLabel(ticket.status) : "pending"} />}
      onPress={openable && ticket ? () => onOpenTicket(ticket.id) : undefined}
      accessibilityLabel={openable ? t("mobile.orders.view_ticket_for", { p0: item.recipient_name }) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12 },
});
