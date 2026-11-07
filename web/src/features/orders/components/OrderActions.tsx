import { useState, type FormEvent } from "react";
import { describeError, isNotImplemented } from "../../../api/errors";
import { cancelRegistration, requestRefund } from "../../../api/orders";
import type { Order } from "../../../api/types/checkout";
import { Button, FormMessage, NotAvailableYet, TextAreaField } from "../../../components/ui";

interface OrderActionsProps {
  order: Order;
  onChanged: () => void;
}

// "Request refund" (paid) or "Cancel registration" (free) on the planned B4
// contract. Until the backend serves it, a "not available yet" note is shown.
export function OrderActions({ order, onChanged }: OrderActionsProps) {
  const paid = order.payable_minor > 0;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  if (order.status !== "confirmed") return null;
  if (planned) {
    return <NotAvailableYet feature={paid ? "Refund requests" : "Cancelling a registration"} />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!paid && !window.confirm("Cancel this registration? Its tickets will stop working.")) return;
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

  return (
    <details className="form-details">
      <summary>{paid ? "Request a refund" : "Cancel registration"}</summary>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <TextAreaField label="Reason" hint="Optional" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
        <FormMessage message={message.text} success={message.success} />
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Sending…" : paid ? "Request refund" : "Cancel registration"}
          </Button>
        </div>
      </form>
    </details>
  );
}
