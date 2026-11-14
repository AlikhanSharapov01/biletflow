import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/api/errors";
import { cancelRegistration, requestRefund } from "@/api/orders";
import type { Order } from "@/api/types/checkout";
import { SubtleButton, TextButton, TextField } from "@/components/ui";
import { confirmAction } from "@/components/ui/dialogs";

import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";

interface OrderActionsProps {
  order: Order;
  onChanged: () => void;
}

// Refund requests open a support case; only an organizer can approve a refund.
export function OrderActions({ order, onChanged }: OrderActionsProps) {
  useLocale();
  const router = useRouter();
  const paid = order.payable_minor > 0;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [message, setMessage] = useState({ text: "", success: false });
  const title = paid ? t("checkout.request_a_refund") : t("checkout.cancel_registration");

  if (order.status !== "confirmed") return null;

  const submit = async () => {
    if (!paid) {
      const confirmed = await confirmAction({
        title: t("mobile.orders.cancel_title"),
        message: t("mobile.orders.cancel_message"),
        confirmLabel: t("checkout.cancel_registration"),
        cancelLabel: t("mobile.orders.keep_it"),
        destructive: true,
      });
      if (!confirmed) return;
    }
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      if (paid) {
        const requested = await requestRefund(order.id, { reason: reason.trim() });
        setCaseId(requested.case_id);
      } else await cancelRegistration(order.id, { reason: reason.trim() });
      setMessage({ text: paid ? t("checkout.refund_request_saved") : t("checkout.cancelled"), success: true });
      // A refund request creates a case without changing the order. Reloading
      // here could unmount this form and discard the returned case link.
      if (!paid) onChanged();
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <TextButton label={`${title} ›`} onPress={() => setOpen(true)} style={styles.toggle} />;
  }

  return (
    <View style={styles.form}>
      <TextField label={t("common.reason")} hint={t("common.optional")} accessibilityLabel={t("common.reason")} value={reason} maxLength={500} multiline onChangeText={setReason} />
      <FormMessage message={message.text} success={message.success} />
      {caseId ? (
        <SubtleButton label={t("checkout.view_refund_request")} onPress={() => router.push({ pathname: "/support/cases/[caseId]", params: { caseId } })} />
      ) : null}
      <View style={styles.actions}>
        <SubtleButton
          danger
          label={busy ? t("common.sending") : paid ? t("checkout.request_refund") : t("checkout.cancel_registration")}
          disabled={busy || Boolean(caseId)}
          onPress={() => void submit()}
        />
        <TextButton label={t("common.close")} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { alignSelf: "flex-start", marginTop: 4 },
  form: { gap: 10, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16 },
});
