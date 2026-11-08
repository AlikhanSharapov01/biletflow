import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError, isNotImplemented } from "@/api/errors";
import { cancelRegistration, requestRefund } from "@/api/orders";
import type { Order } from "@/api/types/checkout";
import { NotAvailableYet, SubtleButton, TextButton, TextField } from "@/components/ui";
import { confirmAction } from "@/components/ui/dialogs";

import { FormMessage } from "@/components/ui/FormMessage";

interface OrderActionsProps {
  order: Order;
  onChanged: () => void;
}

// "Request refund" (paid) or "Cancel registration" (free) on the planned B4
// contract. Until the backend serves it, a "not available yet" note is shown.
export function OrderActions({ order, onChanged }: OrderActionsProps) {
  const paid = order.payable_minor > 0;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });
  const title = paid ? "Request a refund" : "Cancel registration";

  if (order.status !== "confirmed") return null;
  if (planned) return <NotAvailableYet feature={paid ? "Refund requests" : "Cancelling a registration"} />;

  const submit = async () => {
    if (!paid) {
      const confirmed = await confirmAction({
        title: "Cancel this registration?",
        message: "Its tickets will stop working.",
        confirmLabel: "Cancel registration",
        cancelLabel: "Keep it",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      if (paid) await requestRefund(order.id, { reason: reason.trim() });
      else await cancelRegistration(order.id, { reason: reason.trim() });
      setMessage({ text: paid ? "Refund requested. The organizer’s refund policy applies." : "Registration cancelled.", success: true });
      onChanged();
    } catch (failure) {
      if (isNotImplemented(failure)) setPlanned(true);
      else setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <TextButton label={`${title} ›`} onPress={() => setOpen(true)} style={styles.toggle} />;
  }

  return (
    <View style={styles.form}>
      <TextField label="Reason" hint="Optional" accessibilityLabel="Reason" value={reason} maxLength={500} multiline onChangeText={setReason} />
      <FormMessage message={message.text} success={message.success} />
      <View style={styles.actions}>
        <SubtleButton
          danger
          label={busy ? "Sending…" : paid ? "Request refund" : "Cancel registration"}
          disabled={busy}
          onPress={() => void submit()}
        />
        <TextButton label="Close" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { alignSelf: "flex-start", marginTop: 4 },
  form: { gap: 10, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16 },
});
