import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { getOrder } from "@/api/orders";
import { retryPayment, simulatePayment } from "@/api/paidCheckout";
import type { Order } from "@/api/types/checkout";
import type { SimulatedOutcome } from "@/api/types/payments";
import { LoadingState, PrimaryButton, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { useCountdown } from "@/hooks/useCountdown";
import { colors, fonts, radii, statusTones } from "@/theme";
import { formatCountdown } from "@/utils/format";
import { useAppActive } from "@/hooks/useAppActive";
import { POLL_INTERVAL_MS, POLL_LIMIT, paymentLabel, paymentStage, paymentTone } from "../utils/payment";
import { checkoutStyles } from "./checkoutStyles";
import { FormMessage } from "@/components/ui/FormMessage";
import { PriceSummary } from "./PriceSummary";

interface PaymentStepProps {
  order: Order;
  onConfirmed: (order: Order) => void;
  // Shown when the quote lapsed or the order was cancelled.
  onClosed?: () => void;
  onCancel?: () => void;
}

// Simulated payment for a pending paid order: the buyer plays the payment
// provider (success or failure), then the order is reloaded until it settles.
export function PaymentStep({ order: initial, onConfirmed, onClosed, onCancel }: PaymentStepProps) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [polls, setPolls] = useState(0);
  const appActive = useAppActive();
  const stage = paymentStage(order);
  const quoteSeconds = useCountdown(order.quote_expires_at ?? null);

  useEffect(() => setOrder(initial), [initial]);

  const announced = useRef(false);
  useEffect(() => {
    if ((stage === "confirmed" || stage === "free") && !announced.current) {
      announced.current = true;
      onConfirmed(order);
    }
  }, [stage, order, onConfirmed]);

  useEffect(() => {
    if (stage !== "processing" || polls >= POLL_LIMIT || !appActive) return;
    const timer = setTimeout(() => {
      getOrder(order.id)
        .then(setOrder)
        .catch((failure: unknown) => setMessage(describeError(failure)))
        .finally(() => setPolls((count) => count + 1));
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [stage, polls, order.id, appActive]);

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
    <View style={checkoutStyles.stack}>
      <View style={checkoutStyles.head}>
        <Text style={checkoutStyles.heading} accessibilityRole="header">
          Payment
        </Text>
        <StatusPill tone={paymentTone(order)} label={paymentLabel(order)} />
      </View>
      <View style={styles.banner} accessibilityRole="summary">
        <Text style={[styles.bannerText, styles.bannerTitle]}>Demonstration payment — no real money moves.</Text>
        <Text style={styles.bannerText}>BiletFlow is an academic project. Choose the result the payment provider would report.</Text>
      </View>
      <PriceSummary order={order} />
      {stage === "awaiting" && order.quote_expires_at ? (
        <Text style={checkoutStyles.intro} accessibilityRole="timer">
          Price held for {formatCountdown(quoteSeconds)}
        </Text>
      ) : null}
      {stage === "processing" ? (
        polls < POLL_LIMIT ? (
          <LoadingState message="Confirming your payment…" />
        ) : (
          <Text style={checkoutStyles.intro}>Still waiting for the payment result. Check again in a moment.</Text>
        )
      ) : null}
      {stage === "failed" ? <Text style={styles.failed}>The demonstration payment failed. You can try again while the price is held.</Text> : null}
      {stage === "closed" ? <Text style={styles.failed}>This order is {order.status}. Choose your tickets again to get a new price.</Text> : null}
      <FormMessage message={message} />
      <View style={checkoutStyles.actions}>
        {stage === "awaiting" ? (
          <>
            <PrimaryButton label={busy ? "Sending…" : "Simulate successful payment"} disabled={busy} onPress={() => void simulate("succeeded")} />
            <SubtleButton label="Simulate failed payment" disabled={busy} onPress={() => void simulate("failed")} />
          </>
        ) : null}
        {stage === "failed" ? (
          <PrimaryButton label={busy ? "Starting…" : "Try payment again"} disabled={busy} onPress={() => void run(() => retryPayment(order.id))} />
        ) : null}
        {stage === "processing" && polls >= POLL_LIMIT ? <SubtleButton label="Check again" onPress={() => setPolls(0)} /> : null}
        {stage === "closed" && onClosed ? <SubtleButton label="Choose tickets again" onPress={onClosed} /> : null}
        {onCancel && (stage === "awaiting" || stage === "failed") ? (
          <TextButton label="Cancel and choose again" disabled={busy} onPress={onCancel} style={styles.cancel} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: statusTones.pending.color,
    borderRadius: radii.input,
    backgroundColor: statusTones.pending.background,
  },
  bannerText: { color: statusTones.pending.color, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  failed: { color: colors.error, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  cancel: { alignSelf: "center", paddingVertical: 6 },
});
