import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/api/errors";
import { simulatePayment } from "@/api/paidSales";
import type { PaidSalesChecklist, SimulatedOutcome } from "@/api/types/paidSales";
import { ListRow, PrimaryButton, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { priceLabel, statusLabel } from "@/utils/format";

import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";
import { canStartActivation, paymentOpen } from "../../utils/paidSales";
import { t, useLocale } from "@/i18n";

interface ActivationFeeStepProps {
  checklist: PaidSalesChecklist;
  busy: boolean;
  onStart: () => void;
  onChanged: () => void;
}

// Last checklist step. While a simulated payment is open, development builds
// of the API let the organizer act as the payment provider.
export function ActivationFeeStep({ checklist, busy, onStart, onChanged }: ActivationFeeStepProps) {
  useLocale();
  const { notify } = useToast();
  const [simulating, setSimulating] = useState(false);
  const active = checklist.status === "active";
  const payment = checklist.payment;
  const open = paymentOpen(checklist);

  const simulate = async (outcome: SimulatedOutcome) => {
    if (!payment) return;
    setSimulating(true);
    try {
      await simulatePayment(payment.id, outcome);
      notify(outcome === "succeeded" ? t("org.payment_succeeded") : t("org.payment_failed"));
      onChanged();
    } catch (failure) {
      notify(t("org.demo_environment_only", { p0: describeError(failure) }));
    } finally {
      setSimulating(false);
    }
  };

  return (
    <ListRow
      icon="₸"
      title={t("org.activation_fee_title", { p0: priceLabel(checklist.activation_fee_minor) })}
      meta={payment ? t("org.simulated_payment", { p0: statusLabel(payment.status), p1: payment.charged_minor ? t("org.captured_suffix", { p0: priceLabel(payment.charged_minor) }) : "" }) : t("org.pay_after_steps")}
      trailing={active ? <StatusPill label={t("common.paid")} /> : open ? <StatusPill tone="pending" label={t("checkout.payment_pending")} /> : null}
    >
      {!active && !open ? (
        <PrimaryButton
          label={checklist.status === "failed" ? t("org.retry_payment") : t("org.pay_demo_fee")}
          disabled={busy || !canStartActivation(checklist)}
          onPress={onStart}
        />
      ) : null}
      {open ? (
        <View style={formStyles.stack}>
          <Intro>{t("org.demo_payment_provider")}</Intro>
          <View style={formStyles.actions}>
            <SubtleButton label={t("org.simulate_success")} disabled={simulating} onPress={() => void simulate("succeeded")} />
            <SubtleButton danger label={t("org.simulate_failure")} disabled={simulating} onPress={() => void simulate("failed")} />
            <TextButton label={t("org.refresh_status")} onPress={onChanged} />
          </View>
        </View>
      ) : null}
    </ListRow>
  );
}
