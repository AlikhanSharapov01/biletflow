import { fireEvent, render, screen } from "@testing-library/react-native";

import { getOrder } from "@/api/orders";
import { retryPayment, simulatePayment } from "@/api/paidCheckout";
import type { PaymentSummary } from "@/api/types/payments";
import { PaymentStep } from "@/features/checkout/components/PaymentStep";
import { sampleOrder } from "@/features/checkout/testing/fixtures";
import { t } from "@/i18n";

jest.mock("@/api/orders");
jest.mock("@/api/paidCheckout");

const attempt = (status: string, id = "pay-1"): PaymentSummary => ({
  id,
  status,
  charged_minor: 0,
  environment: "simulation",
  provider_payment_id: null,
  simulated: true,
});
const pending = sampleOrder({ status: "pending", gross_minor: 500000, payable_minor: 500000, confirmed_at: null, payment: attempt("created") });

// One panel for both places a buyer pays: checkout and the order screen.
describe("PaymentStep", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reports the confirmed order once the simulated payment succeeds", async () => {
    const confirmed = { ...pending, status: "confirmed", payment: attempt("succeeded") };
    jest.mocked(getOrder).mockResolvedValue(confirmed);
    const onConfirmed = jest.fn();
    await render(<PaymentStep order={pending} onConfirmed={onConfirmed} />);

    await fireEvent.press(screen.getByText(t("checkout.simulate_success")));
    expect(simulatePayment).toHaveBeenCalledWith("pay-1", "succeeded");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledWith(confirmed);
  });

  it("retries a failed payment", async () => {
    jest.mocked(retryPayment).mockResolvedValue({ ...pending, payment: attempt("created", "pay-2") });
    await render(<PaymentStep order={{ ...pending, payment: attempt("failed") }} onConfirmed={jest.fn()} />);

    expect(screen.getByText(t("checkout.payment_failed_hint"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("checkout.retry_payment")));
    expect(retryPayment).toHaveBeenCalledWith(pending.id);
    expect(await screen.findByText(t("checkout.simulate_success"))).toBeTruthy();
  });

  it("offers a new start when the quote lapsed, and cancelling only where the caller allows it", async () => {
    const onClosed = jest.fn();
    const view = await render(<PaymentStep order={{ ...pending, status: "expired" }} onConfirmed={jest.fn()} onClosed={onClosed} />);
    expect(screen.queryByText(t("checkout.simulate_success"))).toBeNull();
    await fireEvent.press(screen.getByText(t("checkout.choose_tickets_again")));
    expect(onClosed).toHaveBeenCalledTimes(1);
    await view.unmount();

    // The order screen passes no onCancel; checkout does.
    const second = await render(<PaymentStep order={pending} onConfirmed={jest.fn()} />);
    expect(screen.queryByText(t("checkout.cancel_choose_again"))).toBeNull();
    await second.unmount();
    const onCancel = jest.fn();
    await render(<PaymentStep order={pending} onConfirmed={jest.fn()} onCancel={onCancel} />);
    await fireEvent.press(screen.getByText(t("checkout.cancel_choose_again")));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
