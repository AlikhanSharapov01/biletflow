import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { requestEntryConfirmation } from "@/api/tickets";
import type { EntryConfirmation, IssuedTicket } from "@/api/types/checkout";
import { Panel, PanelHeading, PrimaryButton, StatusPill, SubtleButton } from "@/components/ui";
import { useCountdown } from "@/hooks/useCountdown";
import { colors, fonts } from "@/theme";
import { formatCountdown } from "@/utils/format";

import { EntryQr } from "./EntryQr";
import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";

// At the gate the scanner needs the ticket QR plus proof that its holder is
// signed in right now: a two-minute token (QR) or its 8-digit code.
export function EntryConfirmationPanel({ ticket }: { ticket: IssuedTicket }) {
  useLocale();
  const [confirmation, setConfirmation] = useState<EntryConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const secondsLeft = useCountdown(confirmation?.expires_at ?? null);
  const expired = Boolean(confirmation) && secondsLeft === 0;

  if (!ticket.qr_payload) return null;

  const request = async () => {
    setBusy(true);
    setMessage("");
    try {
      setConfirmation(await requestEntryConfirmation(ticket.id));
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const usable = ticket.status === "valid";
  const active = confirmation !== null && !expired;
  const label = busy ? t("tickets.requesting") : confirmation ? t("tickets.refresh_confirmation") : t("tickets.confirm_entry");
  const Action = active ? SubtleButton : PrimaryButton;

  return (
    <Panel style={styles.panel}>
      <PanelHeading
        title={t("tickets.entry_confirmation")}
        trailing={confirmation ? <StatusPill tone={expired ? "neutral" : "positive"} label={expired ? t("tickets.expired") : t("common.active")} /> : null}
      />
      <Text style={styles.copy}>
        {t("tickets.entry_instructions")}
      </Text>
      {active && confirmation ? (
        <View style={styles.grid}>
          <EntryQr token={confirmation.token} />
          <Text style={styles.label}>{t("tickets.entry_code")}</Text>
          <Text style={styles.code} accessibilityLabel={t("tickets.entry_code_label", { p0: confirmation.code.split("").join(" ") })}>
            {confirmation.code.slice(0, 4)} {confirmation.code.slice(4)}
          </Text>
          <Text style={styles.countdown} accessibilityRole="timer">
            {t("tickets.expires_in")} {formatCountdown(secondsLeft)}
          </Text>
          <Text style={styles.hint}>{t("tickets.printed_code_hint")}</Text>
        </View>
      ) : null}
      {expired ? <Text style={styles.copy}>{t("tickets.entry_expired")}</Text> : null}
      {!usable ? <Text style={styles.copy}>{t("tickets.entry_valid_only")}</Text> : null}
      <FormMessage message={message} />
      <Action label={label} disabled={busy || !usable} onPress={() => void request()} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  copy: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  grid: { alignItems: "center", gap: 4, paddingVertical: 6 },
  label: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  code: { color: colors.ink, fontFamily: "Courier", fontSize: 30, fontWeight: "700", letterSpacing: 3 },
  countdown: { color: colors.greenDark, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" },
  hint: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, textAlign: "center" },
});
