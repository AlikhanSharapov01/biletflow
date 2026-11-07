import { useState } from "react";
import { describeError } from "../../../../api/errors";
import { simulatePayment } from "../../../../api/paidSales";
import type { PaidSalesChecklist, SimulatedOutcome } from "../../../../api/types/paidSales";
import { Button, ListRow, StatusPill, useToast } from "../../../../components/ui";
import { priceLabel, statusLabel } from "../../../../utils/format";
import { canStartActivation, paymentOpen } from "../../utils/paidSales";

interface ActivationFeeStepProps {
  checklist: PaidSalesChecklist;
  busy: boolean;
  onStart: () => void;
  onChanged: () => void;
}

// Last checklist step. While a simulated payment is open, development builds
// of the API let the organizer act as the payment provider.
export function ActivationFeeStep({ checklist, busy, onStart, onChanged }: ActivationFeeStepProps) {
  const { notify } = useToast();
  const [simulating, setSimulating] = useState(false);
  const active = checklist.status === "active";
  const payment = checklist.payment;

  const simulate = async (outcome: SimulatedOutcome) => {
    if (!payment) return;
    setSimulating(true);
    try {
      await simulatePayment(payment.id, outcome);
      notify(outcome === "succeeded" ? "Simulated payment succeeded." : "Simulated payment failed.");
      onChanged();
    } catch (failure) {
      notify(`${describeError(failure)} The payment simulator only runs in development and test environments.`);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <ListRow
      icon="₸"
      title={`Activation fee · ${priceLabel(checklist.activation_fee_minor)}`}
      meta={payment ? `Simulated payment ${statusLabel(payment.status)}${payment.charged_minor ? ` · ${priceLabel(payment.charged_minor)} captured` : ""}` : "Pay once the other steps are done."}
      actions={
        active ? (
          <StatusPill>Paid</StatusPill>
        ) : paymentOpen(checklist) ? (
          <StatusPill tone="pending">Payment pending</StatusPill>
        ) : (
          <Button variant="primary" size="sm" disabled={busy || !canStartActivation(checklist)} onClick={onStart}>
            {checklist.status === "failed" ? "Retry payment" : "Pay fee (simulated)"}
          </Button>
        )
      }
    >
      {paymentOpen(checklist) ? (
        <div className="simulator-actions">
          <span className="form-intro">Demo payment provider:</span>
          <Button size="sm" disabled={simulating} onClick={() => void simulate("succeeded")}>
            Simulate success
          </Button>
          <Button size="sm" variant="danger" disabled={simulating} onClick={() => void simulate("failed")}>
            Simulate failure
          </Button>
          <Button size="sm" variant="text" onClick={onChanged}>
            Refresh status
          </Button>
        </div>
      ) : null}
    </ListRow>
  );
}
