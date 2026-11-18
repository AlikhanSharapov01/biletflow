import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import {
  downloadExport,
  getAdminMe,
  getEventPaidSales,
  moderatePaidSales,
  searchEvents,
  searchPayments,
  searchRefunds,
} from "@/api/admin";
import { ApiError } from "@/api/errors";
import type { AdminPaymentRow, AdminRefundRow } from "@/api/types/admin";
import type { PaidSalesChecklist } from "@/api/types/paidSales";
import { AdminSectionScreen } from "@/features/admin/AdminSectionScreen";
import { forgetPlatformAdminAnswers } from "@/features/admin/useIsPlatformAdmin";

let mockParams: Record<string, string> = { section: "payments" };
const mockNotify = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/admin");
jest.mock("expo-crypto", () => ({ randomUUID: () => "key-1" }));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "admin-1" }, logout: jest.fn(), login: jest.fn() }),
}));

const base = {
  event_id: "event-1",
  created_at: "2026-11-10T10:00:00Z",
  intent_id: "intent-1",
  order_id: "order-1",
  activation_id: null,
  payer_user_id: "user-1",
  purpose: "ticket_order",
  expected_minor: 400000,
  currency: "KZT",
  environment: "simulation",
  simulated: true,
  provider: "simulator",
  provider_payment_id: null,
  organization_id: "org-1",
};
const payment: AdminPaymentRow = {
  ...base,
  id: "pay-1",
  status: "succeeded",
  charged_minor: 400000,
  processing_fee_minor: 12000,
  confirmed_at: "2026-11-10T10:01:00Z",
  next_reconcile_at: null,
};
const refund: AdminRefundRow = {
  ...base,
  id: "ref-1",
  status: "pending",
  payment_attempt_id: "pay-1",
  reason: "Event cancelled",
  amount_minor: 400000,
  succeeded_at: null,
  latest_attempt_status: "pending",
};
const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 25, offset: 0 });
const checklist = (status: string, suspension_reason: string | null = null) =>
  ({
    event_id: "event-1",
    status,
    simulated: true,
    missing: [],
    paid_ticket_type: true,
    payout_profile_verified: true,
    identity_verified: true,
    terms: { version: "v1", text: "", accepted: true },
    activation_fee_minor: 500000,
    currency: "KZT",
    activated_at: "2026-11-01T10:00:00Z",
    suspension_reason,
    payment: null,
  }) as PaidSalesChecklist;

describe("admin commerce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetPlatformAdminAnswers();
    jest.mocked(getAdminMe).mockResolvedValue({ user_id: "admin-1", is_platform_admin: true });
    jest.mocked(searchPayments).mockResolvedValue(page([payment]));
    jest.mocked(searchRefunds).mockResolvedValue(page([refund]));
  });

  it("lists payments, switches to refunds, filters and exports the CSV with the same filters", async () => {
    mockParams = { section: "payments" };
    await render(<AdminSectionScreen />);
    expect(await screen.findByText("₸4000.00")).toBeTruthy();
    expect(screen.getByText("Simulation")).toBeTruthy();
    expect(searchPayments).toHaveBeenCalledWith({}, 25, 0);

    await fireEvent.press(screen.getByText("Refunds"));
    expect(await screen.findByText(/Event cancelled/)).toBeTruthy();
    expect(searchRefunds).toHaveBeenCalledWith({}, 25, 0);

    await fireEvent.press(screen.getByText("▸ Filters"));
    await fireEvent.changeText(screen.getByLabelText("Event ID"), "event-1");
    await fireEvent.press(screen.getByText("Apply"));
    await waitFor(() => expect(searchRefunds).toHaveBeenLastCalledWith({ event_id: "event-1" }, 25, 0));

    await fireEvent.press(screen.getByText("Export CSV"));
    expect(downloadExport).toHaveBeenCalledWith("refunds", { event_id: "event-1" });
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("refunds.csv downloaded."));
  });

  it("refuses a date range that ends before it starts, without asking the server", async () => {
    mockParams = { section: "payments" };
    await render(<AdminSectionScreen />);
    await screen.findByText("₸4000.00");
    await fireEvent.press(screen.getByText("▸ Filters"));
    await fireEvent.changeText(screen.getByLabelText("From, format YYYY-MM-DD HH:mm"), "2026-11-02 10:00");
    await fireEvent.changeText(screen.getByLabelText("To, format YYYY-MM-DD HH:mm"), "2026-11-01 10:00");
    await fireEvent.press(screen.getByText("Apply"));
    expect(screen.getByText("“To” must be after “From”.")).toBeTruthy();
    expect(searchPayments).toHaveBeenCalledTimes(1);
  });

  it("suspends an event's paid sales after asking for a reason", async () => {
    mockParams = { section: "events" };
    jest.mocked(searchEvents).mockResolvedValue(
      page([
        {
          id: "event-1",
          organization_id: "org-1",
          title: "Paid Night",
          publication_state: "published",
          moderation_state: "normal",
          visibility: "public",
          starts_at: "2026-12-01T18:00:00Z",
          capacity: 50,
          created_at: "2026-11-01T00:00:00Z",
        },
      ]),
    );
    jest.mocked(getEventPaidSales).mockResolvedValueOnce(checklist("active")).mockResolvedValue(checklist("suspended", "Chargeback risk"));
    jest.mocked(moderatePaidSales).mockResolvedValue(checklist("suspended", "Chargeback risk"));
    await render(<AdminSectionScreen />);
    await fireEvent.press(await screen.findByText("Paid sales"));
    expect(await screen.findByText("active")).toBeTruthy();

    await fireEvent.press(screen.getByText("Suspend paid sales"));
    const inputs = screen.getAllByDisplayValue("");
    await fireEvent.changeText(inputs[inputs.length - 1], "Chargeback risk");
    // The dialog's confirm button shares the label with the row's button; it is the last one.
    await fireEvent.press(screen.getAllByRole("button", { name: "Suspend paid sales" }).at(-1)!);
    expect(moderatePaidSales).toHaveBeenCalledWith("event-1", "suspend", "Chargeback risk", "key-1");
    expect(mockNotify).toHaveBeenCalledWith("Paid sales suspended. Existing tickets are unchanged.");
    expect(await screen.findByText("Chargeback risk")).toBeTruthy();
    expect(screen.getByText("Reinstate paid sales")).toBeTruthy();
  });

  it("explains paid sales that are not active, with no button", async () => {
    mockParams = { section: "events" };
    jest.mocked(searchEvents).mockResolvedValue(
      page([
        {
          id: "event-1",
          organization_id: "org-1",
          title: "Free Night",
          publication_state: "published",
          moderation_state: "normal",
          visibility: "public",
          starts_at: "2026-12-01T18:00:00Z",
          capacity: 50,
          created_at: "2026-11-01T00:00:00Z",
        },
      ]),
    );
    jest.mocked(getEventPaidSales).mockResolvedValue({ ...checklist("incomplete"), missing: ["terms"] } as PaidSalesChecklist);
    await render(<AdminSectionScreen />);
    await fireEvent.press(await screen.findByText("Paid sales"));
    expect(await screen.findByText(/nothing to suspend/)).toBeTruthy();
    expect(screen.queryByText("Suspend paid sales")).toBeNull();
  });

  it("shows the server's reason when the decision is refused", async () => {
    mockParams = { section: "events" };
    jest.mocked(searchEvents).mockResolvedValue(
      page([
        {
          id: "event-1",
          organization_id: "org-1",
          title: "Paid Night",
          publication_state: "published",
          moderation_state: "normal",
          visibility: "public",
          starts_at: "2026-12-01T18:00:00Z",
          capacity: 50,
          created_at: "2026-11-01T00:00:00Z",
        },
      ]),
    );
    jest.mocked(getEventPaidSales).mockResolvedValue(checklist("active"));
    jest.mocked(moderatePaidSales).mockRejectedValue(new ApiError("Paid sales are not active for this event.", 409, "paid_sales_not_active"));
    await render(<AdminSectionScreen />);
    await fireEvent.press(await screen.findByText("Paid sales"));
    await fireEvent.press(await screen.findByText("Suspend paid sales"));
    const inputs = screen.getAllByDisplayValue("");
    await fireEvent.changeText(inputs[inputs.length - 1], "Test");
    // The dialog's confirm button shares the label with the row's button; it is the last one.
    await fireEvent.press(screen.getAllByRole("button", { name: "Suspend paid sales" }).at(-1)!);
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("Paid sales are not active for this event."));
  });
});
