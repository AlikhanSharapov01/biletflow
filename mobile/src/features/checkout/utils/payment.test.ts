import type { Order } from "@/api/types/checkout";
import type { PaymentSummary } from "@/api/types/payments";
import { orderStatusTone, paymentLabel, paymentStage, paymentTone } from "./payment";

const base: Order = {
  id: "o1",
  event_id: "e1",
  buyer_user_id: "u1",
  hold_id: "h1",
  status: "pending",
  currency: "KZT",
  gross_minor: 1000000,
  discount_minor: 0,
  payable_minor: 1000000,
  processing_fee_minor: 30000,
  quote_expires_at: "2099-11-01T10:15:00Z",
  payment: null,
  refunds: [],
  promo: null,
  confirmed_at: null,
  created_at: "2026-11-01T10:00:00Z",
  items: [],
};

const payment = (status: string): PaymentSummary => ({ id: "p1", status, charged_minor: 0, environment: "simulation", provider_payment_id: null, simulated: true });

describe("paymentStage", () => {
  it("follows the order and its latest attempt", () => {
    expect(paymentStage({ ...base, payment: payment("created") })).toBe("awaiting");
    expect(paymentStage({ ...base, payment: payment("pending") })).toBe("awaiting");
    expect(paymentStage({ ...base, payment: payment("failed") })).toBe("failed");
    expect(paymentStage({ ...base, payment: payment("succeeded") })).toBe("processing");
    expect(paymentStage({ ...base, status: "confirmed", payment: payment("succeeded") })).toBe("confirmed");
    expect(paymentStage({ ...base, status: "confirmed", payable_minor: 0, payment: null })).toBe("free");
    expect(paymentStage({ ...base, status: "expired", payment: payment("created") })).toBe("closed");
  });

  it("labels payments and order tones", () => {
    expect(paymentLabel({ ...base, payment: payment("failed") })).toBe("Payment failed");
    expect(paymentLabel({ ...base, payable_minor: 0, payment: null })).toBe("No payment needed");
    expect(orderStatusTone("confirmed")).toBe("positive");
    expect(orderStatusTone("expired")).toBe("neutral");
    expect(orderStatusTone("cancelled")).toBe("neutral");
    expect(paymentLabel(base)).toBe("No payment yet");
    expect(paymentTone({ ...base, payment: payment("succeeded") })).toBe("positive");
  });
});
