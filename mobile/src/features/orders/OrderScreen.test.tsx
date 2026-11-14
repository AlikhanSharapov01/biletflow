import { fireEvent, render, screen } from "@testing-library/react-native";

import { ApiError } from "@/api/errors";
import { cancelRegistration, getOrder, requestRefund } from "@/api/orders";
import { retryPayment } from "@/api/paidCheckout";
import type { Order } from "@/api/types/checkout";
import { confirmAction } from "@/components/ui/dialogs";
import { OrderScreen } from "@/features/orders/OrderScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "order-1" }),
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", email: "aida@example.com", display_name: "Aida Nur" } }),
}));
jest.mock("@/components/ui/dialogs", () => ({ confirmAction: jest.fn() }));
jest.mock("@/api/orders");
jest.mock("@/api/paidCheckout");

const freeOrder: Order = {
  id: "order-1",
  event_id: "event-1",
  buyer_user_id: "u1",
  hold_id: "hold-1",
  status: "confirmed",
  currency: "KZT",
  gross_minor: 0,
  discount_minor: 0,
  payable_minor: 0,
  processing_fee_minor: 0,
  quote_expires_at: "2099-11-01T10:15:00Z",
  refunds: [],
  promo: null,
  confirmed_at: "2026-11-01T10:00:00Z",
  created_at: "2026-11-01T09:58:00Z",
  payment: null,
  items: [
    {
      id: "item-1",
      unit_number: 1,
      ticket_type_id: "tt-1",
      ticket_type_name: "Standard",
      recipient_name: "Aida Nur",
      recipient_email: "aida@example.com",
      face_value_minor: 0,
      discount_minor: 0,
      paid_minor: 0,
      seat_snapshot: null,
      ticket: {
        id: "ticket-1",
        order_item_id: "item-1",
        event_id: "event-1",
        event_title: "Almaty Jazz Night",
        event_starts_at: "2026-12-01T14:00:00Z",
        venue_name: "Kazakhconcert Hall",
        ticket_type_name: "Standard",
        recipient_name: "Aida Nur",
        seat_snapshot: null,
        status: "valid",
        recipient_user_id: "u1",
        claimed_at: null,
        issued_at: "2026-11-01T10:00:00Z",
        qr_payload: "bf1.ticket.payload",
      },
    },
  ],
};

const failedPaidOrder: Order = {
  ...freeOrder,
  status: "pending",
  gross_minor: 500000,
  payable_minor: 500000,
  confirmed_at: null,
  quote_expires_at: new Date(Date.now() + 600_000).toISOString(),
  payment: { id: "pay-1", status: "failed", charged_minor: 500000, environment: "test", provider_payment_id: null, simulated: true },
};

describe("OrderScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the order and opens its ticket", async () => {
    jest.mocked(getOrder).mockResolvedValue(freeOrder);
    await render(<OrderScreen />);
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
    expect(screen.getByText("No payment needed")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("View ticket for Aida Nur"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/tickets/[ticketId]", params: { ticketId: "ticket-1" } });
  });

  it("asks for confirmation before cancelling a free registration", async () => {
    jest.mocked(getOrder).mockResolvedValue(freeOrder);
    jest.mocked(cancelRegistration).mockResolvedValue({ ...freeOrder, status: "cancelled" });
    jest.mocked(confirmAction).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render(<OrderScreen />);
    await fireEvent.press(await screen.findByText("Cancel registration ›"));
    await fireEvent.changeText(screen.getByLabelText("Reason"), "Can’t make it");
    await fireEvent.press(screen.getByText("Cancel registration"));
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(cancelRegistration).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Cancel registration"));
    expect(cancelRegistration).toHaveBeenCalledWith("order-1", { reason: "Can’t make it" });
    expect(await screen.findByText("Registration cancelled.")).toBeTruthy();
  });

  it("links to the support case a refund request opens and shows the promo used", async () => {
    const paidOrder: Order = {
      ...freeOrder,
      payable_minor: 500000,
      payment: { ...failedPaidOrder.payment!, status: "succeeded" },
      promo: { code: "SPRING", campaign_id: "c1" },
    };
    jest.mocked(getOrder).mockResolvedValue(paidOrder);
    jest.mocked(requestRefund).mockResolvedValue({ order_id: "order-1", status: "requested", case_id: "case-9" });
    await render(<OrderScreen />);
    await fireEvent.press(await screen.findByText("Request a refund ›"));
    await fireEvent.press(screen.getByText("Request refund"));
    expect(confirmAction).not.toHaveBeenCalled();
    expect(requestRefund).toHaveBeenCalledWith("order-1", { reason: "" });
    expect(await screen.findByText("Refund requested. The organizer’s refund policy applies.")).toBeTruthy();
    expect(screen.getByText("SPRING")).toBeTruthy();
    await fireEvent.press(screen.getByText("View refund request"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/support/cases/[caseId]", params: { caseId: "case-9" } });
  });

  it("shows why a refund was refused", async () => {
    jest.mocked(getOrder).mockResolvedValue({ ...freeOrder, payable_minor: 500000, payment: { ...failedPaidOrder.payment!, status: "succeeded" } });
    jest.mocked(requestRefund).mockRejectedValue(new ApiError("The refund deadline for this order has passed.", 409, "refund_cutoff_passed"));
    await render(<OrderScreen />);
    await fireEvent.press(await screen.findByText("Request a refund ›"));
    await fireEvent.press(screen.getByText("Request refund"));
    expect(await screen.findByText("The refund deadline for this order has passed.")).toBeTruthy();
    expect(screen.queryByText("View refund request")).toBeNull();
  });

  it("retries a failed payment", async () => {
    jest.mocked(getOrder).mockResolvedValue(failedPaidOrder);
    jest.mocked(retryPayment).mockResolvedValue({ ...failedPaidOrder, payment: { ...failedPaidOrder.payment!, id: "pay-2", status: "created" } });
    await render(<OrderScreen />);
    await fireEvent.press(await screen.findByText("Try payment again"));
    expect(retryPayment).toHaveBeenCalledWith("order-1");
    expect(await screen.findByText("Simulate successful payment")).toBeTruthy();
  });

  it("shows an error when the order cannot load", async () => {
    jest.mocked(getOrder).mockRejectedValue(new Error("That order isn’t one of yours."));
    await render(<OrderScreen />);
    expect(await screen.findByText("We couldn’t load this order.")).toBeTruthy();
    expect(screen.getByText("That order isn’t one of yours.")).toBeTruthy();
  });
});
