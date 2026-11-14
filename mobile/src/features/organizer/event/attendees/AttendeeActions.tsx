import { useState } from "react";
import { View } from "react-native";

import { cancelTicket, refundOrder } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import type { Attendee } from "@/api/types";
import { ReasonDialog, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { formStyles } from "../../components/formStyles";
import { t, useLocale } from "@/i18n";

interface AttendeeActionsProps {
  eventId: string;
  row: Attendee;
  onDone: () => void;
}

type Pending = { title: string; confirmLabel: string; action: (reason: string) => Promise<unknown>; done: string } | null;

// Paid registrations must be refunded as a whole order; the server enforces policy.
// The reason is asked in a dialog.
export function AttendeeActions({ eventId, row, onDone }: AttendeeActionsProps) {
  useLocale();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  if (row.status !== "valid") return null;

  const submit = async (reason: string) => {
    if (!pending || !reason) return;
    setBusy(true);
    try {
      await pending.action(reason);
      notify(pending.done);
      setPending(null);
      onDone();
    } catch (failure) {
      setPending(null);
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={formStyles.actions}>
      <SubtleButton
        danger
        label={t("checkout.cancel_registration")}
        disabled={busy}
        onPress={() =>
          setPending({
            title: t("org.registration_cancel_confirm", { p0: row.recipient_name }),
            confirmLabel: t("checkout.cancel_registration"),
            action: (reason) => cancelTicket(eventId, row.ticket_id, reason),
            done: t("checkout.cancelled"),
          })
        }
      />
      <SubtleButton
        label={t("checkout.refund")}
        disabled={busy}
        onPress={() =>
          setPending({
            title: t("org.refund_order_confirm"),
            confirmLabel: t("checkout.refund"),
            action: (reason) => refundOrder(row.order_id, reason),
            done: t("checkout.refund_requested"),
          })
        }
      />
      <ReasonDialog
        visible={pending !== null}
        title={pending?.title ?? ""}
        confirmLabel={pending?.confirmLabel}
        busy={busy}
        onCancel={() => setPending(null)}
        onSubmit={(reason) => void submit(reason)}
      />
    </View>
  );
}
