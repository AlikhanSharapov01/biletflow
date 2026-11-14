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
import { t, useLocale } from "@/i18n";

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
  useLocale();
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
          {t("checkout.payment")}
        </Text>
        <StatusPill tone={paymentTone(order)} label={paymentLabel(order)} />
      </View>
      <View style={styles.banner} accessibilityRole="summary">
        <Text style={[styles.bannerText, styles.bannerTitle]}>{t("checkout.demo_payment")}</Text>
        <Text style={styles.bannerText}>{t("checkout.demo_provider")}</Text>
      </View>
      <PriceSummary order={order} />
      {stage === "awaiting" && order.quote_expires_at ? (
        <Text style={checkoutStyles.intro} accessibilityRole="timer">
          {t("checkout.price_held_for")} {formatCountdown(quoteSeconds)}
        </Text>
      ) : null}
      {stage === "processing" ? (
        polls < POLL_LIMIT ? (
          <LoadingState message={t("checkout.confirming_payment")} />
        ) : (
          <Text style={checkoutStyles.intro}>{t("checkout.payment_waiting_hint")}</Text>
        )
      ) : null}
      {stage === "failed" ? <Text style={styles.failed}>{t("checkout.payment_failed_hint")}</Text> : null}
      {stage === "closed" ? <Text style={styles.failed}>{t("orders.this_order_is")} {order.status}{t("checkout.requote_hint")}</Text> : null}
      <FormMessage message={message} />
      <View style={checkoutStyles.actions}>
        {stage === "awaiting" ? (
          <>
            <PrimaryButton label={busy ? t("common.sending") : t("checkout.simulate_success")} disabled={busy} onPress={() => void simulate("succeeded")} />
            <SubtleButton label={t("checkout.simulate_failure")} disabled={busy} onPress={() => void simulate("failed")} />
          </>
        ) : null}
        {stage === "failed" ? (
          <PrimaryButton label={busy ? t("checkout.starting") : t("checkout.retry_payment")} disabled={busy} onPress={() => void run(() => retryPayment(order.id))} />
        ) : null}
        {stage === "processing" && polls >= POLL_LIMIT ? <SubtleButton label={t("checkout.check_again")} onPress={() => setPolls(0)} /> : null}
        {stage === "closed" && onClosed ? <SubtleButton label={t("checkout.choose_tickets_again")} onPress={onClosed} /> : null}
        {onCancel && (stage === "awaiting" || stage === "failed") ? (
          <TextButton label={t("checkout.cancel_choose_again")} disabled={busy} onPress={onCancel} style={styles.cancel} />
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
