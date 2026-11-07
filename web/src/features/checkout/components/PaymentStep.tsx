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
        <h3>Payment</h3>
        <StatusPill tone={paymentTone(order)}>{paymentLabel(order)}</StatusPill>
      </div>
      <div className="simulation-banner" role="note">
        <strong>Demonstration payment — no real money moves.</strong>
        <span>BiletFlow is an academic project. Choose the result the payment provider would report.</span>
      </div>
      <PriceSummary order={order} />
      {stage === "awaiting" && order.quote_expires_at ? (
        <small className="form-intro" role="timer">
          Price held for {formatCountdown(quoteSeconds)}
        </small>
      ) : null}
      {stage === "processing" ? (
        polls < POLL_LIMIT ? (
          <Loading label="Confirming your payment…" />
        ) : (
          <p className="form-intro">Still waiting for the payment result. Check again in a moment.</p>
        )
      ) : null}
      {stage === "failed" ? <p className="payment-failed">The demonstration payment failed. You can try again while the price is held.</p> : null}
      {stage === "closed" ? <p className="payment-failed">This order is {order.status}. Choose your tickets again to get a new price.</p> : null}
      <FormMessage message={message} />
      <div className="form-actions">
        {stage === "awaiting" ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => void simulate("succeeded")}>
              {busy ? "Sending…" : "Simulate successful payment"}
            </Button>
            <Button disabled={busy} onClick={() => void simulate("failed")}>
              Simulate failed payment
            </Button>
          </>
        ) : null}
        {stage === "failed" ? (
          <Button variant="primary" disabled={busy} onClick={() => void run(() => retryPayment(order.id))}>
            {busy ? "Starting…" : "Try payment again"}
          </Button>
        ) : null}
        {stage === "processing" && polls >= POLL_LIMIT ? (
          <Button onClick={() => setPolls(0)}>Check again</Button>
        ) : null}
        {stage === "closed" && onClosed ? <Button onClick={onClosed}>Choose tickets again</Button> : null}
        {onCancel && (stage === "awaiting" || stage === "failed") ? (
          <Button variant="text" disabled={busy} onClick={onCancel}>
            Cancel and choose again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
