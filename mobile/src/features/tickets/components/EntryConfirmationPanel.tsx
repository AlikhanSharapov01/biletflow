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

// At the gate the scanner needs the ticket QR plus proof that its holder is
// signed in right now: a two-minute token (QR) or its 8-digit code.
export function EntryConfirmationPanel({ ticket }: { ticket: IssuedTicket }) {
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
  const label = busy ? "Requesting…" : confirmation ? "Refresh confirmation" : "Confirm entry";
  const Action = active ? SubtleButton : PrimaryButton;

  return (
    <Panel style={styles.panel}>
      <PanelHeading
        title="Entry confirmation"
        trailing={confirmation ? <StatusPill tone={expired ? "neutral" : "positive"} label={expired ? "Expired" : "Active"} /> : null}
      />
      <Text style={styles.copy}>
        Needed at the gate together with your ticket QR. It lasts about two minutes, so open it when you reach the entrance.
      </Text>
      {active && confirmation ? (
        <View style={styles.grid}>
          <EntryQr token={confirmation.token} />
          <Text style={styles.label}>Entry code</Text>
          <Text style={styles.code} accessibilityLabel={`Entry code ${confirmation.code.split("").join(" ")}`}>
            {confirmation.code.slice(0, 4)} {confirmation.code.slice(4)}
          </Text>
          <Text style={styles.countdown} accessibilityRole="timer">
            Expires in {formatCountdown(secondsLeft)}
          </Text>
          <Text style={styles.hint}>For a printed ticket, read this code out to the staff member.</Text>
        </View>
      ) : null}
      {expired ? <Text style={styles.copy}>This confirmation expired. Get a new one when you are at the gate.</Text> : null}
      {!usable ? <Text style={styles.copy}>Entry confirmations are only available for valid tickets.</Text> : null}
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
