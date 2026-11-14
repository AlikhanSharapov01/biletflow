import { StyleSheet, Text, View } from "react-native";

import type { IssuedTicket } from "@/api/types/checkout";
import { Eyebrow, FactList, Panel, QrCode, SerifText } from "@/components/ui";
import { colors, fonts, radii } from "@/theme";
import { dateLabel, seatLabel, statusLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

// The ticket QR and its facts (web PrintableTicket). The signed payload is the
// credential, so it is only present for the ticket's own recipient.
export function TicketPass({ ticket }: { ticket: IssuedTicket }) {
  useLocale();
  return (
    <Panel style={styles.panel}>
      <View style={styles.qrBox}>
        {ticket.qr_payload ? (
          <QrCode value={ticket.qr_payload} size={232} label={t("tickets.admission_qr")} />
        ) : (
          <View style={styles.missing} accessible accessibilityRole="image" accessibilityLabel={t("tickets.qr_unavailable")}>
            <Text style={styles.missingText}>{t("tickets.qr_holder_only")}</Text>
          </View>
        )}
      </View>
      <Eyebrow>BiletFlow</Eyebrow>
      <SerifText style={styles.title}>{ticket.event_title}</SerifText>
      <FactList
        items={[
          { label: t("tickets.when"), value: dateLabel(ticket.event_starts_at) },
          { label: t("tickets.where"), value: ticket.venue_name },
          { label: t("common.ticket"), value: `${ticket.ticket_type_name} · ${seatLabel(ticket.seat_snapshot)}` },
          { label: t("tickets.attendee"), value: ticket.recipient_name },
          { label: t("tickets.id"), value: <Text style={styles.code} selectable>{ticket.id}</Text> },
          { label: t("common.status"), value: `${statusLabel(ticket.status)} · issued ${dateLabel(ticket.issued_at)}` },
        ]}
      />
      <Text style={styles.footnote}>
        {t("tickets.qr_instructions")}
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  qrBox: { alignItems: "center", paddingVertical: 8 },
  missing: {
    width: 232,
    height: 232,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.sidebar,
  },
  missingText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, textAlign: "center" },
  title: { fontSize: 24, lineHeight: 28 },
  code: { color: colors.ink, fontFamily: "Courier", fontSize: 12, textAlign: "right" },
  footnote: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
});
