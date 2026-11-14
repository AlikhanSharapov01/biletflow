import type { Order } from "@/api/types/checkout";

import { orderStatusTone, orderTitle, paymentLabel, paymentStage, paymentTone } from "./payment";

function order(overrides: Partial<Order>): Order {
  return {
    id: "o1",
    event_id: "e1",
    buyer_user_id: "u1",
    hold_id: "h1",
    status: "pending",
    currency: "KZT",
    gross_minor: 500000,
    discount_minor: 0,
    payable_minor: 500000,
    processing_fee_minor: 0,
    quote_expires_at: "2099-11-01T10:15:00Z",
    refunds: [],
    promo: null,
    confirmed_at: null,
    created_at: "2026-11-01T10:00:00Z",
    items: [],
    payment: null,
    ...overrides,
  };
}

const attempt = (status: string) => ({
  id: "p1",
  status,
  charged_minor: 500000,
  environment: "test",
  provider_payment_id: null,
  simulated: true,
});

describe("paymentStage", () => {
  it("follows the order status and the latest attempt", () => {
    expect(paymentStage(order({ status: "confirmed", payment: null }))).toBe("free");
    expect(paymentStage(order({ status: "confirmed", payment: attempt("succeeded") }))).toBe("confirmed");
    expect(paymentStage(order({ status: "expired" }))).toBe("closed");
    expect(paymentStage(order({ payment: attempt("created") }))).toBe("awaiting");
    expect(paymentStage(order({ payment: attempt("failed") }))).toBe("failed");
    expect(paymentStage(order({ payment: attempt("succeeded") }))).toBe("processing");
  });
});

describe("labels", () => {
  it("describes payments and order states", () => {
    expect(paymentLabel(order({ payable_minor: 0 }))).toBe("No payment needed");
    expect(paymentLabel(order({}))).toBe("No payment yet");
    expect(paymentLabel(order({ payment: attempt("failed") }))).toBe("Payment failed");
    expect(paymentTone(order({ payment: attempt("succeeded") }))).toBe("positive");
    expect(orderStatusTone("cancelled")).toBe("neutral");
    expect(orderTitle(order({}))).toBe("Event");
  });
});
