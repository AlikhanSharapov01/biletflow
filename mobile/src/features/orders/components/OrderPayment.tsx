import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { getOrder } from "@/api/orders";
import { retryPayment, simulatePayment } from "@/api/paidCheckout";
import type { Order } from "@/api/types/checkout";
import type { SimulatedOutcome } from "@/api/types/payments";
import { LoadingState, Panel, PanelHeading, PrimaryButton, StatusPill, SubtleButton } from "@/components/ui";
import { useCountdown } from "@/hooks/useCountdown";
import { colors, fonts, radii, statusTones } from "@/theme";
import { formatCountdown } from "@/utils/format";

import { useAppActive } from "@/hooks/useAppActive";
import { FormMessage } from "@/components/ui/FormMessage";
import { POLL_INTERVAL_MS, POLL_LIMIT, paymentLabel, paymentStage, paymentTone } from "../utils/payment";
import { PriceSummary } from "./PriceSummary";

// Simulated payment for a pending paid order (web PaymentStep): the buyer plays
// the payment provider, then the order is reloaded until it settles.
export function OrderPayment({ order: initial, onSettled }: { order: Order; onSettled: () => void }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [polls, setPolls] = useState(0);
  const stage = paymentStage(order);
  const quoteSeconds = useCountdown(order.quote_expires_at ?? null);
  const appActive = useAppActive();

  useEffect(() => setOrder(initial), [initial]);

  const announced = useRef(false);
  useEffect(() => {
    if ((stage === "confirmed" || stage === "free") && !announced.current) {
      announced.current = true;
      onSettled();
    }
  }, [stage, onSettled]);

  // Polls only while the app is in the foreground; it resumes on return.
  useEffect(() => {
    if (!appActive || stage !== "processing" || polls >= POLL_LIMIT) return;
    const timer = setTimeout(() => {
      getOrder(order.id)
        .then(setOrder)
        .catch((failure: unknown) => setMessage(describeError(failure)))
        .finally(() => setPolls((count) => count + 1));
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [appActive, stage, polls, order.id]);

  const run = async (action: () => Promise<Order>) => {
    setBusy(true);
    setMessage("");
    try {
      setOrder(await action());
      setPolls(0);
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const simulate = (outcome: SimulatedOutcome) =>
    run(async () => {
      if (order.payment) await simulatePayment(order.payment.id, outcome);
      return getOrder(order.id);
    });

  return (
    <Panel style={styles.panel}>
      <PanelHeading title="Payment" trailing={<StatusPill tone={paymentTone(order)} label={paymentLabel(order)} />} />
      <View style={styles.banner} accessibilityRole="summary">
        <Text style={styles.bannerTitle}>Demonstration payment — no real money moves.</Text>
        <Text style={styles.bannerCopy}>BiletFlow is an academic project. Choose the result the payment provider would report.</Text>
      </View>
      <PriceSummary order={order} />
      {stage === "awaiting" && order.quote_expires_at ? (
        <Text style={styles.copy} accessibilityRole="timer">
          Price held for {formatCountdown(quoteSeconds)}
        </Text>
      ) : null}
      {stage === "processing" ? (
        polls < POLL_LIMIT ? (
          <LoadingState message="Confirming your payment…" />
        ) : (
          <Text style={styles.copy}>Still waiting for the payment result. Check again in a moment.</Text>
        )
      ) : null}
      {stage === "failed" ? (
        <Text style={styles.failed}>The demonstration payment failed. You can try again while the price is held.</Text>
      ) : null}
      {stage === "closed" ? (
        <Text style={styles.failed}>This order is {order.status}. Choose your tickets again to get a new price.</Text>
      ) : null}
      <FormMessage message={message} />
      {stage === "awaiting" ? (
        <>
          <PrimaryButton
            label={busy ? "Sending…" : "Simulate successful payment"}
            disabled={busy}
            onPress={() => void simulate("succeeded")}
          />
          <SubtleButton label="Simulate failed payment" disabled={busy} onPress={() => void simulate("failed")} />
        </>
      ) : null}
      {stage === "failed" ? (
        <PrimaryButton
          label={busy ? "Starting…" : "Try payment again"}
          disabled={busy}
          onPress={() => void run(() => retryPayment(order.id))}
        />
      ) : null}
      {stage === "processing" && polls >= POLL_LIMIT ? <SubtleButton label="Check again" onPress={() => setPolls(0)} /> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  banner: { gap: 4, padding: 12, borderRadius: radii.input, backgroundColor: statusTones.pending.background },
  bannerTitle: { color: statusTones.pending.color, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
  bannerCopy: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  copy: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  failed: { color: colors.error, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
});
