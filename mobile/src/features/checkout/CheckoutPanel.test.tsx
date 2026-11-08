import { fireEvent, render, screen } from "@testing-library/react-native";

import { confirmHold, createHold, startCheckout } from "@/api/checkout";
import { ApiError } from "@/api/errors";
import { previewPromo } from "@/api/promo";
import { CheckoutPanel } from "@/features/checkout/CheckoutPanel";
import { sampleEvent, sampleHold, sampleOrder, sampleProfile, sampleTicket } from "@/features/checkout/testing/fixtures";

const mockPush = jest.fn();
const mockNotify = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: mockProfileRef.current, login: jest.fn(), logout: jest.fn() }),
}));
jest.mock("@/api/checkout");
jest.mock("@/api/promo");
jest.mock("@/api/orders");
jest.mock("@/api/paidCheckout");

const mockProfileRef: { current: typeof sampleProfile | (Omit<typeof sampleProfile, "email_verified_at"> & { email_verified_at: null }) } = {
  current: sampleProfile,
};

const general = sampleTicket({ id: "t1", name: "General" });
const vip = sampleTicket({ id: "t2", name: "VIP", kind: "paid", price_minor: 500000 });

describe("CheckoutPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileRef.current = sampleProfile;
  });

  it("reserves the chosen quantities, then confirms a free registration", async () => {
    jest.mocked(createHold).mockResolvedValue(sampleHold(["al1", "al2"]));
    jest.mocked(confirmHold).mockResolvedValue(sampleOrder({ id: "ord9" }));
    await render(<CheckoutPanel event={sampleEvent} tickets={[general, vip]} />);

    await fireEvent.press(screen.getByLabelText("More General"));
    await fireEvent.press(screen.getByLabelText("More General"));
    await fireEvent.press(screen.getByText("Reserve 2 tickets"));
    expect(createHold).toHaveBeenCalledWith("e1", [{ ticket_type_id: "t1", quantity: 2 }], undefined);

    expect(await screen.findByText("Who is coming?")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Ticket 2 · General, name"), "Timur");
    await fireEvent.changeText(screen.getByLabelText("Ticket 2 · General, email"), " Timur@Example.com ");
    await fireEvent.press(screen.getByText("Confirm registration"));

    expect(confirmHold).toHaveBeenCalledWith("h1", [
      { allocation_id: "al1", name: "Aru Nurlan", email: "aru@example.com" },
      { allocation_id: "al2", name: "Timur", email: "timur@example.com" },
    ]);
    expect(startCheckout).not.toHaveBeenCalled();
    expect(await screen.findByText("Registration confirmed")).toBeTruthy();
    expect(mockNotify).toHaveBeenCalledWith("Registration confirmed. Your tickets are ready.");

    await fireEvent.press(screen.getByText("View order"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/orders/[orderId]", params: { orderId: "ord9" } });
    await fireEvent.press(screen.getByText("Go to my tickets"));
    expect(mockPush).toHaveBeenCalledWith("/tickets");
  });

  it("asks for every recipient before confirming", async () => {
    jest.mocked(createHold).mockResolvedValue(sampleHold(["al1", "al2"]));
    await render(<CheckoutPanel event={sampleEvent} tickets={[general]} />);
    await fireEvent.press(screen.getByLabelText("More General"));
    await fireEvent.press(screen.getByLabelText("More General"));
    await fireEvent.press(screen.getByText("Reserve 2 tickets"));
    await fireEvent.press(await screen.findByText("Confirm registration"));
    expect(screen.getByText("Enter a name and a valid email for every ticket.")).toBeTruthy();
    expect(confirmHold).not.toHaveBeenCalled();
  });

  it("sends a paid basket to the simulated payment step", async () => {
    jest.mocked(createHold).mockResolvedValue(sampleHold(["al1"], "t2"));
    jest.mocked(startCheckout).mockResolvedValue(
      sampleOrder({
        status: "pending",
        gross_minor: 500000,
        payable_minor: 500000,
        confirmed_at: null,
        payment: { id: "p1", status: "created", charged_minor: 0, environment: "simulation", provider_payment_id: null, simulated: true },
      }),
    );
    await render(<CheckoutPanel event={sampleEvent} tickets={[vip]} />);
    await fireEvent.press(screen.getByLabelText("More VIP"));
    await fireEvent.press(screen.getByText("Reserve 1 ticket"));
    await fireEvent.press(await screen.findByText("Continue to payment"));
    expect(startCheckout).toHaveBeenCalledWith("h1", [{ allocation_id: "al1", name: "Aru Nurlan", email: "aru@example.com" }]);
    expect(await screen.findByText("Simulate successful payment")).toBeTruthy();
    expect(screen.getByText("Demonstration payment — no real money moves.")).toBeTruthy();
  });

  it("explains that promo codes are not available yet and sends none", async () => {
    jest.mocked(previewPromo).mockRejectedValue(new ApiError("Not Found", 404));
    jest.mocked(createHold).mockResolvedValue(sampleHold(["al1"]));
    await render(<CheckoutPanel event={sampleEvent} tickets={[general]} promoFromRoute="spring" />);
    expect(await screen.findByText("Promo codes are coming soon. Your code was not applied.")).toBeTruthy();
    expect(previewPromo).toHaveBeenCalledWith("e1", "SPRING");
    expect(screen.getByText("Not available yet")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("More General"));
    await fireEvent.press(screen.getByText("Reserve 1 ticket"));
    expect(createHold).toHaveBeenCalledWith("e1", [{ ticket_type_id: "t1", quantity: 1 }], undefined);
  });

  it("shows the server's refusal when the hold fails", async () => {
    jest.mocked(createHold).mockRejectedValue(new ApiError("Not enough places are left for that selection.", 409, "event_capacity_exceeded"));
    await render(<CheckoutPanel event={sampleEvent} tickets={[general]} />);
    await fireEvent.press(screen.getByLabelText("More General"));
    await fireEvent.press(screen.getByText("Reserve 1 ticket"));
    expect(await screen.findByText("Not enough places are left for that selection.")).toBeTruthy();
  });

  it("asks for a verified email before reserving", async () => {
    mockProfileRef.current = { ...sampleProfile, email_verified_at: null };
    await render(<CheckoutPanel event={sampleEvent} tickets={[general]} />);
    expect(screen.getByText(/Verify your email address before reserving tickets/)).toBeTruthy();
    expect(screen.queryByText("Reserve tickets")).toBeNull();
  });
});
