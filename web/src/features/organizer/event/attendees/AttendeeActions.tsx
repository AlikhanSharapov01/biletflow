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
  const [busy, setBusy] = useState(false);
  if (row.status !== "valid") return null;

  const run = async (question: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = (await requestReason(question))?.trim();
    if (!reason) return;
    setBusy(true);
    try {
      await action(reason);
      notify(done);
      onDone();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-actions">
      <Button
        size="sm"
        variant="danger"
        disabled={busy}
        onClick={() => void run(t("org.registration_cancel_confirm", { p0: row.recipient_name }), (reason) => cancelTicket(eventId, row.ticket_id, reason), t("checkout.cancelled"))}
      >{t("checkout.cancel_registration")}</Button>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => void run(t("org.refund_order_confirm"), (reason) => refundOrder(row.order_id, reason), t("checkout.refund_requested"))}
      >{t("checkout.refund")}</Button>
    </div>
  );
}
