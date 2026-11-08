import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/errors";
import { getOrder } from "../../../api/orders";
import { retryPayment, simulatePayment } from "../../../api/paidCheckout";
import type { Order } from "../../../api/types/checkout";
import { makeOrder, makePayment } from "../../../../tests/helpers/fixtures";
import { POLL_INTERVAL_MS, POLL_LIMIT } from "../utils/payment";
import { PaymentStep } from "./PaymentStep";

vi.mock("../../../api/orders", () => ({ getOrder: vi.fn() }));
vi.mock("../../../api/paidCheckout", () => ({ simulatePayment: vi.fn(), retryPayment: vi.fn() }));

const getOrderMock = vi.mocked(getOrder);
const simulateMock = vi.mocked(simulatePayment);
const retryMock = vi.mocked(retryPayment);

function pendingOrder(paymentStatus: string, overrides: Partial<Order> = {}): Order {
  return makeOrder({
    id: "o1",
    status: "pending",
    gross_minor: 500_000,
    payable_minor: 500_000,
    confirmed_at: null,
    payment: makePayment({ id: "pay1", status: paymentStatus }),
    ...overrides,
  });
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

afterEach(() => {
  vi.useRealTimers();
  getOrderMock.mockReset();
  simulateMock.mockReset();
  retryMock.mockReset();
});

describe("PaymentStep", () => {
  it("labels the payment as a simulation and offers both outcomes", () => {
    render(<PaymentStep order={pendingOrder("created")} onConfirmed={vi.fn()} />);
    expect(screen.getByRole("note").textContent).toContain("Demonstration payment — no real money moves.");
    expect(screen.getByText("Awaiting payment")).toBeTruthy();
    expect(button("Simulate successful payment")).toBeTruthy();
    expect(button("Simulate failed payment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel and choose again" })).toBeNull();
  });

  it("shows how long the quoted price is held", () => {
    render(<PaymentStep order={pendingOrder("created", { quote_expires_at: new Date(Date.now() + 125_000).toISOString() })} onConfirmed={vi.fn()} />);
    expect(screen.getByRole("timer").textContent).toMatch(/^Price held for 2:0[45]$/);
  });

  it("simulates a successful payment and announces the confirmed order once", async () => {
    const confirmed = makeOrder({ id: "o1", status: "confirmed", payment: makePayment({ id: "pay1", status: "succeeded" }) });
    simulateMock.mockResolvedValue({ provider_event_id: "pe", external_event_id: "ee", attempt: makePayment({ status: "succeeded" }) });
    getOrderMock.mockResolvedValue(confirmed);
    const onConfirmed = vi.fn();
    const { rerender } = render(<PaymentStep order={pendingOrder("created")} onConfirmed={onConfirmed} />);

    await act(async () => fireEvent.click(button("Simulate successful payment")));

    expect(simulateMock).toHaveBeenCalledWith("pay1", "succeeded");
    expect(getOrderMock).toHaveBeenCalledWith("o1");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledWith(confirmed);
    rerender(<PaymentStep order={pendingOrder("created")} onConfirmed={onConfirmed} />);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("shows a failed payment and retries it", async () => {
    simulateMock.mockResolvedValue({ provider_event_id: "pe", external_event_id: "ee", attempt: makePayment({ status: "failed" }) });
    getOrderMock.mockResolvedValue(pendingOrder("failed"));
    retryMock.mockResolvedValue(pendingOrder("created", { payment: makePayment({ id: "pay2", status: "created" }) }));
    const onCancel = vi.fn();
    render(<PaymentStep order={pendingOrder("created")} onConfirmed={vi.fn()} onCancel={onCancel} />);

    await act(async () => fireEvent.click(button("Simulate failed payment")));
    expect(simulateMock).toHaveBeenCalledWith("pay1", "failed");
    expect(screen.getByText(/The demonstration payment failed/)).toBeTruthy();
    expect(screen.getByText("Payment failed")).toBeTruthy();
    expect(button("Cancel and choose again")).toBeTruthy();

    await act(async () => fireEvent.click(button("Try payment again")));
    expect(retryMock).toHaveBeenCalledWith("o1");
    expect(button("Simulate successful payment")).toBeTruthy();
  });

  it("shows the API error when the simulation is refused", async () => {
    simulateMock.mockRejectedValue(new ApiError("Your price quote expired. Choose your tickets again.", 409, "quote_expired"));
    const onConfirmed = vi.fn();
    render(<PaymentStep order={pendingOrder("created")} onConfirmed={onConfirmed} />);
    await act(async () => fireEvent.click(button("Simulate successful payment")));
    expect(screen.getByText("Your price quote expired. Choose your tickets again.")).toBeTruthy();
    expect(button("Simulate successful payment").disabled).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("disables both outcomes while a simulation is in flight", async () => {
    simulateMock.mockReturnValue(new Promise(() => undefined));
    render(<PaymentStep order={pendingOrder("created")} onConfirmed={vi.fn()} />);
    await act(async () => fireEvent.click(button("Simulate successful payment")));
    expect(button("Sending…").disabled).toBe(true);
    expect(button("Simulate failed payment").disabled).toBe(true);
  });

  it("offers to choose again for an expired order", () => {
    const onClosed = vi.fn();
    const onCancel = vi.fn();
    render(<PaymentStep order={pendingOrder("created", { status: "expired" })} onConfirmed={vi.fn()} onClosed={onClosed} onCancel={onCancel} />);
    expect(screen.getByText("This order is expired. Choose your tickets again to get a new price.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Simulate successful payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel and choose again" })).toBeNull();
    fireEvent.click(button("Choose tickets again"));
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("announces a free (already confirmed) order straight away", () => {
    const onConfirmed = vi.fn();
    const free = makeOrder({ status: "confirmed", payment: null });
    render(<PaymentStep order={free} onConfirmed={onConfirmed} />);
    expect(onConfirmed).toHaveBeenCalledWith(free);
  });

  it("polls a succeeded-but-unfulfilled payment until the order confirms", async () => {
    vi.useFakeTimers();
    const confirmed = makeOrder({ id: "o1", status: "confirmed", payment: makePayment({ status: "succeeded" }) });
    getOrderMock.mockResolvedValueOnce(pendingOrder("succeeded")).mockResolvedValueOnce(confirmed);
    const onConfirmed = vi.fn();
    render(<PaymentStep order={pendingOrder("succeeded")} onConfirmed={onConfirmed} />);
    expect(screen.getByText("Confirming your payment…")).toBeTruthy();
    expect(getOrderMock).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(getOrderMock).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(getOrderMock).toHaveBeenCalledTimes(2);
    expect(onConfirmed).toHaveBeenCalledWith(confirmed);
  });

  it("stops polling after the limit and lets the buyer check again", async () => {
    vi.useFakeTimers();
    getOrderMock.mockResolvedValue(pendingOrder("unknown"));
    render(<PaymentStep order={pendingOrder("unknown")} onConfirmed={vi.fn()} />);

    // Each poll is scheduled after the previous one settles and re-renders.
    for (let tick = 0; tick < POLL_LIMIT + 3; tick += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    }
    expect(getOrderMock).toHaveBeenCalledTimes(POLL_LIMIT);
    expect(screen.getByText("Still waiting for the payment result. Check again in a moment.")).toBeTruthy();

    fireEvent.click(button("Check again"));
    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(getOrderMock).toHaveBeenCalledTimes(POLL_LIMIT + 1);
  });
});
