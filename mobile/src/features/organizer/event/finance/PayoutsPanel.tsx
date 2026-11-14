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
    { status: "eligible", label: "Mark eligible" },
    { status: "failed", label: "Fail" },
  ],
  eligible: [
    { status: "sent", label: "Send" },
    { status: "failed", label: "Fail" },
  ],
};

interface PayoutsPanelProps {
  eventId: string;
  available: number;
  // Reloads the finance summary, whose balances every payout changes.
  onChanged: () => void;
}

export function PayoutsPanel({ eventId, available, onChanged }: PayoutsPanelProps) {
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
      setMessage("Enter an amount above ₸0.");
      return;
    }
    if (minor > available) {
      setMessage(`At most ${amountLabel(available)} can be paid out now.`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await requestPayout(eventId, minor);
      notify("Payout requested.");
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
      notify(`Payout ${statusLabel(status)}.`);
      changed();
    } catch (failure) {
      notify(`${describeError(failure)} The payout simulator only runs in development and test environments.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <SectionHeading
        title="Payouts"
        subtitle="Reserve part of the available balance, then play the bank sending it. Sending opens when the event has ended."
      />
      <View style={formStyles.stack}>
        {payouts.loading && !payouts.data ? <LoadingState message="Loading payouts…" /> : null}
        {payouts.error ? <ErrorPanel title="We couldn’t load payouts." message={payouts.error} onRetry={payouts.reload} /> : null}
        {payouts.data?.length === 0 ? <EmptyState message="No payouts yet." /> : null}
        {payouts.data?.map((payout) => (
          <ListRow
            key={payout.id}
            icon="₸"
            title={amountLabel(payout.amount_minor)}
            meta={`Requested ${dateLabel(payout.created_at)}${payout.sent_at ? ` · sent ${dateLabel(payout.sent_at)}` : ""}`}
            note={payout.adjustment_minor ? `Adjusted by ${amountLabel(payout.adjustment_minor)} after refunds` : undefined}
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
          label="Amount (KZT)"
          accessibilityLabel="Amount (KZT)"
          hint={`Up to ${amountLabel(available)}`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy}
        />
        <FormMessage message={message} />
        <PrimaryButton label="Request payout" onPress={() => void submit()} disabled={busy || available <= 0} loading={busy} />
        {available <= 0 ? <Intro>Nothing is available to pay out right now.</Intro> : null}
      </View>
    </Panel>
  );
}
