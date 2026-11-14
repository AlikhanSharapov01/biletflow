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
import { t, useLocale } from "@/i18n";

// Simulated payment for a pending paid order (web PaymentStep): the buyer plays
// the payment provider, then the order is reloaded until it settles.
export function OrderPayment({ order: initial, onSettled }: { order: Order; onSettled: () => void }) {
  useLocale();
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
      <PanelHeading title={t("checkout.payment")} trailing={<StatusPill tone={paymentTone(order)} label={paymentLabel(order)} />} />
      <View style={styles.banner} accessibilityRole="summary">
        <Text style={styles.bannerTitle}>{t("checkout.demo_payment")}</Text>
        <Text style={styles.bannerCopy}>{t("checkout.demo_provider")}</Text>
      </View>
      <PriceSummary order={order} />
      {stage === "awaiting" && order.quote_expires_at ? (
        <Text style={styles.copy} accessibilityRole="timer">
          {t("checkout.price_held_for")} {formatCountdown(quoteSeconds)}
        </Text>
      ) : null}
      {stage === "processing" ? (
        polls < POLL_LIMIT ? (
          <LoadingState message={t("checkout.confirming_payment")} />
        ) : (
          <Text style={styles.copy}>{t("checkout.payment_waiting_hint")}</Text>
        )
      ) : null}
      {stage === "failed" ? (
        <Text style={styles.failed}>{t("checkout.payment_failed_hint")}</Text>
      ) : null}
      {stage === "closed" ? (
        <Text style={styles.failed}>{t("orders.this_order_is")} {order.status}{t("checkout.requote_hint")}</Text>
      ) : null}
      <FormMessage message={message} />
      {stage === "awaiting" ? (
        <>
          <PrimaryButton
            label={busy ? t("common.sending") : t("checkout.simulate_success")}
            disabled={busy}
            onPress={() => void simulate("succeeded")}
          />
          <SubtleButton label={t("checkout.simulate_failure")} disabled={busy} onPress={() => void simulate("failed")} />
        </>
      ) : null}
      {stage === "failed" ? (
        <PrimaryButton
          label={busy ? t("checkout.starting") : t("checkout.retry_payment")}
          disabled={busy}
          onPress={() => void run(() => retryPayment(order.id))}
        />
      ) : null}
      {stage === "processing" && polls >= POLL_LIMIT ? <SubtleButton label={t("checkout.check_again")} onPress={() => setPolls(0)} /> : null}
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
