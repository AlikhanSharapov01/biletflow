import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { getDelivery, resendDelivery } from "@/api/tickets";
import type { TicketDelivery } from "@/api/types/checkout";
import { ErrorPanel, FactList, LoadingState, Panel, PanelHeading, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { colors, fonts } from "@/theme";
import { dateLabel } from "@/utils/format";

import { deliveryLook, resendHint } from "../utils/ticketStatus";
import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";

// Email delivery of this ticket, with a rate-limited "Resend email".
export function DeliveryPanel({ ticketId }: { ticketId: string }) {
  useLocale();
  const loaded = useRequest(() => getDelivery(ticketId), [ticketId]);
  const [override, setOverride] = useState<TicketDelivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });
  const delivery = override ?? loaded.data;

  const resend = async () => {
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      setOverride(await resendDelivery(ticketId));
      setMessage({ text: t("tickets.resend_sent"), success: true });
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  const look = delivery ? deliveryLook(delivery.status) : null;
  const hint = delivery ? resendHint(delivery) : "";

  return (
    <Panel>
      <PanelHeading title={t("tickets.delivery")} trailing={look ? <StatusPill tone={look.tone} label={look.label} /> : null} />
      {loaded.loading && !delivery ? <LoadingState message={t("tickets.checking_delivery")} /> : null}
      {loaded.error && !delivery ? (
        <ErrorPanel title={t("tickets.delivery_error")} message={loaded.error} onRetry={loaded.reload} />
      ) : null}
      {delivery ? (
        <View style={styles.body}>
          <FactList
            items={[
              { label: t("tickets.sent_to"), value: delivery.recipient_email },
              { label: t("tickets.last_delivered"), value: delivery.last_delivered_at ? dateLabel(delivery.last_delivered_at) : t("account.not_yet") },
              { label: t("tickets.resent"), value: `${delivery.resend_count} of 5 times` },
            ]}
          />
          {delivery.status === "failed" ? (
            <Text style={styles.copy}>{t("tickets.email_failed_hint")}</Text>
          ) : null}
          <FormMessage message={message.text} success={message.success} />
          <View style={styles.actions}>
            <SubtleButton
              label={busy ? t("common.sending") : t("tickets.resend")}
              disabled={busy || !delivery.can_resend}
              onPress={() => void resend()}
            />
            <TextButton
              label={t("common.refresh")}
              onPress={() => {
                setOverride(null);
                loaded.reload();
              }}
            />
          </View>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  copy: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16 },
  hint: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
});
