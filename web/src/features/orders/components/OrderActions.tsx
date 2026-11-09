import { t, useLocale } from "../../../i18n";
import { confirmAction } from "../../../components/ui/ActionDialog";
import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { cancelRegistration, requestRefund } from "../../../api/orders";
import type { Order } from "../../../api/types/checkout";
import { Button, ButtonLink, FormMessage, TextAreaField } from "../../../components/ui";

interface OrderActionsProps {
  order: Order;
  onChanged: () => void;
}

// Refund requests open a support case; only an organizer can approve a refund.
export function OrderActions({ order, onChanged }: OrderActionsProps) {
  useLocale();
  const paid = order.payable_minor > 0;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [message, setMessage] = useState({ text: "", success: false });

  if (order.status !== "confirmed") return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!paid && !await confirmAction(t("checkout.cancel_confirm"))) return;
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      if (paid) {
        const requested = await requestRefund(order.id, { reason: reason.trim() });
        setCaseId(requested.case_id);
      }
      else await cancelRegistration(order.id, { reason: reason.trim() });
      setMessage({ text: paid ? t("checkout.refund_request_saved") : t("checkout.cancelled"), success: true });
      // A refund request creates a case without changing the order. Reloading
      // here can unmount this form and discard the returned case link.
      if (!paid) onChanged();
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="form-details">
      <summary>{paid ? t("checkout.request_a_refund") : t("checkout.cancel_registration")}</summary>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <TextAreaField label={t("common.reason")} hint={t("common.optional")} value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
        <FormMessage message={message.text} success={message.success} />
        {caseId ? <ButtonLink to={`/support/cases/${encodeURIComponent(caseId)}`}>{t("checkout.view_refund_request")}</ButtonLink> : null}
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={busy || Boolean(caseId)}>
            {busy ? t("common.sending") : paid ? t("checkout.request_refund") : t("checkout.cancel_registration")}
          </Button>
        </div>
      </form>
    </details>
  );
}
