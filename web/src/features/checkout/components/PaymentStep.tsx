import { t, useLocale } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import { getOrder } from "../../../api/orders";
import { retryPayment, simulatePayment } from "../../../api/paidCheckout";
import { describeError } from "../../../api/errors";
import type { Order } from "../../../api/types/checkout";
import type { SimulatedOutcome } from "../../../api/types/payments";
import { Button, FormMessage, Loading, StatusPill } from "../../../components/ui";
import { useCountdown } from "../../../hooks/useCountdown";
import { formatCountdown } from "../../../utils/format";
import { POLL_INTERVAL_MS, POLL_LIMIT, paymentLabel, paymentStage, paymentTone } from "../utils/payment";
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
  useLocale();
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [polls, setPolls] = useState(0);
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
    if (stage !== "processing" || polls >= POLL_LIMIT) return;
    const timer = setTimeout(() => {
      getOrder(order.id)
        .then(setOrder)
        .catch((failure: unknown) => setMessage(describeError(failure)))
        .finally(() => setPolls((count) => count + 1));
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [stage, polls, order.id]);

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
    <div className="checkout payment-step">
      <div className="checkout-head">
        <h3>{t("checkout.payment")}</h3>
        <StatusPill tone={paymentTone(order)}>{paymentLabel(order)}</StatusPill>
      </div>
      <div className="simulation-banner" role="note">
        <strong>{t("checkout.demo_payment")}</strong>
        <span>{t("checkout.demo_provider")}</span>
      </div>
      <PriceSummary order={order} />
      {stage === "awaiting" && order.quote_expires_at ? (
        <small className="form-intro" role="timer">{t("checkout.price_held_for")}{" "}{formatCountdown(quoteSeconds)}
        </small>
      ) : null}
      {stage === "processing" ? (
        polls < POLL_LIMIT ? (
          <Loading label={t("checkout.confirming_payment")} />
        ) : (
          <p className="form-intro">{t("checkout.payment_waiting_hint")}</p>
        )
      ) : null}
      {stage === "failed" ? <p className="payment-failed">{t("checkout.payment_failed_hint")}</p> : null}
      {stage === "closed" ? <p className="payment-failed">{t("orders.this_order_is")}{" "}{order.status}{t("checkout.requote_hint")}</p> : null}
      <FormMessage message={message} />
      <div className="form-actions">
        {stage === "awaiting" ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => void simulate("succeeded")}>
              {busy ? t("common.sending") : t("checkout.simulate_success")}
            </Button>
            <Button disabled={busy} onClick={() => void simulate("failed")}>{t("checkout.simulate_failure")}{" "}</Button>
          </>
        ) : null}
        {stage === "failed" ? (
          <Button variant="primary" disabled={busy} onClick={() => void run(() => retryPayment(order.id))}>
            {busy ? t("checkout.starting") : t("checkout.retry_payment")}
          </Button>
        ) : null}
        {stage === "processing" && polls >= POLL_LIMIT ? (
          <Button onClick={() => setPolls(0)}>{t("checkout.check_again")}</Button>
        ) : null}
        {stage === "closed" && onClosed ? <Button onClick={onClosed}>{t("checkout.choose_tickets_again")}</Button> : null}
        {onCancel && (stage === "awaiting" || stage === "failed") ? (
          <Button variant="text" disabled={busy} onClick={onCancel}>{t("checkout.cancel_choose_again")}{" "}</Button>
        ) : null}
      </div>
    </div>
  );
}
