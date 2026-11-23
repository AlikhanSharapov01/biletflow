import { t, useLocale } from "../../../../i18n";
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
  // Another checklist step is running; this one waits.
  waiting?: boolean;
  onStart: () => void;
  onChanged: () => void;
}

// Last checklist step. While a simulated payment is open, development builds
// of the API let the organizer act as the payment provider.
export function ActivationFeeStep({ checklist, busy, waiting = false, onStart, onChanged }: ActivationFeeStepProps) {
  useLocale();
  const { notify } = useToast();
  const [simulating, setSimulating] = useState<SimulatedOutcome | null>(null);
  const active = checklist.status === "active";
  const payment = checklist.payment;

  const simulate = async (outcome: SimulatedOutcome) => {
    if (!payment) return;
    setSimulating(outcome);
    try {
      await simulatePayment(payment.id, outcome);
      notify(outcome === "succeeded" ? t("org.payment_succeeded") : t("org.payment_failed"));
      onChanged();
    } catch (failure) {
      notify(t("org.demo_environment_only", { p0: describeError(failure) }));
    } finally {
      setSimulating(null);
    }
  };

  return (
    <ListRow
      icon="₸"
      title={t("org.activation_fee_title", { p0: priceLabel(checklist.activation_fee_minor) })}
      meta={payment ? t("org.simulated_payment", { p0: statusLabel(payment.status), p1: payment.charged_minor ? (" " + t("org.captured_suffix", { p0: priceLabel(payment.charged_minor) })) : "" }) : t("org.pay_after_steps")}
      actions={
        active ? (
          <StatusPill>{t("common.paid")}</StatusPill>
        ) : paymentOpen(checklist) ? (
          <StatusPill tone="pending">{t("checkout.payment_pending")}</StatusPill>
        ) : (
          <Button variant="primary" size="sm" busy={busy} aria-disabled={waiting} disabled={!canStartActivation(checklist)} onClick={onStart}>
            {checklist.status === "failed" ? t("org.retry_payment") : t("org.pay_demo_fee")}
          </Button>
        )
      }
    >
      {paymentOpen(checklist) ? (
        <div className="simulator-actions">
          <span className="form-intro">{t("org.demo_payment_provider")}</span>
          <Button size="sm" busy={simulating === "succeeded"} aria-disabled={simulating === "failed"} onClick={() => void simulate("succeeded")}>{t("org.simulate_success")}</Button>
          <Button size="sm" variant="danger" busy={simulating === "failed"} aria-disabled={simulating === "succeeded"} onClick={() => void simulate("failed")}>{t("org.simulate_failure")}</Button>
          <Button size="sm" variant="text" onClick={onChanged}>{t("org.refresh_status")}</Button>
        </div>
      ) : null}
    </ListRow>
  );
}
