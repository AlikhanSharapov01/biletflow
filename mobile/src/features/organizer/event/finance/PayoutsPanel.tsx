import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/api/errors";
import { listPayouts, requestPayout, simulatePayout } from "@/api/finance";
import type { Payout, PayoutSimulation, PayoutStatus } from "@/api/types/finance";
import { EmptyState, ErrorPanel, ListRow, LoadingState, Panel, PrimaryButton, StatusPill, SubtleButton, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";
import { amountLabel, dateLabel, statusLabel, tengeToMinor } from "@/utils/format";
import type { StatusTone } from "@/utils/status";

import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";
import { SectionHeading } from "../../components/SectionHeading";
import { t, useLocale } from "@/i18n";

const TONE: Record<PayoutStatus, StatusTone> = {
  pending: "pending",
  eligible: "pending",
  sent: "positive",
  failed: "blocked",
  adjusted: "neutral",
};

// The steps a simulated bank can take from each status.
const NEXT: Partial<Record<PayoutStatus, Array<{ status: PayoutSimulation; label: string }>>> = {
  pending: [
    { status: "eligible", get label() { return t("mobile.org.mark_eligible"); } },
    { status: "failed", get label() { return t("mobile.org.fail"); } },
  ],
  eligible: [
    { status: "sent", get label() { return t("support.send"); } },
    { status: "failed", get label() { return t("mobile.org.fail"); } },
  ],
};

interface PayoutsPanelProps {
  eventId: string;
  available: number;
  // Reloads the finance summary, whose balances every payout changes.
  onChanged: () => void;
}

export function PayoutsPanel({ eventId, available, onChanged }: PayoutsPanelProps) {
  useLocale();
  const { notify } = useToast();
  const payouts = useRequest(() => listPayouts(eventId), [eventId]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const changed = () => {
    payouts.reload();
    onChanged();
  };

  const submit = async () => {
    const minor = tengeToMinor(amount);
    if (minor <= 0) {
      setMessage(t("mobile.org.amount_above_zero"));
      return;
    }
    if (minor > available) {
      setMessage(t("mobile.org.at_most", { p0: amountLabel(available) }));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await requestPayout(eventId, minor);
      notify(t("mobile.org.payout_requested"));
      setAmount("");
      changed();
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (payout: Payout, status: PayoutSimulation) => {
    setBusy(true);
    try {
      await simulatePayout(eventId, payout.id, status);
      notify(t("mobile.org.payout_status", { p0: statusLabel(status) }));
      changed();
    } catch (failure) {
      notify(t("mobile.org.payout_simulator_only", { p0: describeError(failure) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <SectionHeading
        title={t("mobile.org.payouts")}
        subtitle={t("mobile.org.payouts_hint")}
      />
      <View style={formStyles.stack}>
        {payouts.loading && !payouts.data ? <LoadingState message={t("mobile.org.loading_payouts")} /> : null}
        {payouts.error ? <ErrorPanel title={t("mobile.org.payouts_error")} message={payouts.error} onRetry={payouts.reload} /> : null}
        {payouts.data?.length === 0 ? <EmptyState message={t("mobile.org.no_payouts")} /> : null}
        {payouts.data?.map((payout) => (
          <ListRow
            key={payout.id}
            icon="₸"
            title={amountLabel(payout.amount_minor)}
            meta={t("mobile.org.payout_requested_at", { p0: dateLabel(payout.created_at), p1: payout.sent_at ? ` ${t("mobile.org.payout_sent_suffix", { p0: dateLabel(payout.sent_at) })}` : "" })}
            note={payout.adjustment_minor ? t("mobile.org.payout_adjusted", { p0: amountLabel(payout.adjustment_minor) }) : undefined}
            trailing={<StatusPill tone={TONE[payout.status]} label={statusLabel(payout.status)} />}
          >
            {NEXT[payout.status] ? (
              <View style={formStyles.actions}>
                {NEXT[payout.status]!.map((step) => (
                  <SubtleButton
                    key={step.status}
                    danger={step.status === "failed"}
                    label={step.label}
                    disabled={busy}
                    onPress={() => void simulate(payout, step.status)}
                  />
                ))}
              </View>
            ) : null}
          </ListRow>
        ))}
        <TextField
          label={t("org.amount_kzt")}
          accessibilityLabel={t("org.amount_kzt")}
          hint={t("org.up_to", { p0: amountLabel(available) })}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy}
        />
        <FormMessage message={message} />
        <PrimaryButton label={t("mobile.org.request_payout")} onPress={() => void submit()} disabled={busy || available <= 0} loading={busy} />
        {available <= 0 ? <Intro>{t("mobile.org.nothing_to_pay")}</Intro> : null}
      </View>
    </Panel>
  );
}
