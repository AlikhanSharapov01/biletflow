import { t, useLocale } from "../../../../i18n";
import { requestReason } from "../../../../components/ui/ActionDialog";
import { useState } from "react";
import { cancelTicket, refundOrder } from "../../../../api/eventAdmin";
import { describeError } from "../../../../api/errors";
import type { Attendee } from "../../../../api/types";
import { Button, useToast } from "../../../../components/ui";

interface AttendeeActionsProps {
  eventId: string;
  row: Attendee;
  onDone: () => void;
}

// Paid registrations must be refunded as a whole order; the server enforces policy.
export function AttendeeActions({ eventId, row, onDone }: AttendeeActionsProps) {
  useLocale();
  const { notify } = useToast();
  // Which action's request is running; the other one waits (aria-disabled).
  const [busy, setBusy] = useState<"cancel" | "refund" | null>(null);
  if (row.status !== "valid") return null;

  const run = async (which: "cancel" | "refund", question: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = (await requestReason(question))?.trim();
    if (!reason) return;
    setBusy(which);
    try {
      await action(reason);
      notify(done);
      onDone();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="row-actions">
      <Button
        size="sm"
        variant="danger"
        busy={busy === "cancel"}
        aria-disabled={busy === "refund" || undefined}
        onClick={() => void run("cancel", t("org.registration_cancel_confirm", { p0: row.recipient_name }), (reason) => cancelTicket(eventId, row.ticket_id, reason), t("checkout.cancelled"))}
      >{t("checkout.cancel_registration")}</Button>
      <Button
        size="sm"
        busy={busy === "refund"}
        aria-disabled={busy === "cancel" || undefined}
        onClick={() => void run("refund", t("org.refund_order_confirm"), (reason) => refundOrder(row.order_id, reason), t("checkout.refund_requested"))}
      >{t("checkout.refund")}</Button>
    </div>
  );
}
