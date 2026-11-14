import { fireEvent, render, screen } from "@testing-library/react-native";

import { ApiError } from "@/api/errors";
import { getEventFinance, listPayouts, requestPayout, simulatePayout } from "@/api/finance";
import type { EventFinance, Payout } from "@/api/types/finance";
import { FinanceTab } from "@/features/organizer/event/FinanceTab";

import { makeEvent } from "../testFixtures";

const mockNotify = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/finance");

const finance: EventFinance = {
  event_id: "event-1",
  currency: "KZT",
  simulated: true,
  simulation_only: true,
  environments: ["simulation"],
  gross_minor: 1200000,
  discount_minor: 0,
  collected_minor: 1200000,
  fulfilled_collected_minor: 1200000,
  charged_fees_minor: 36000,
  fee_reversals_minor: 0,
  fees_minor: 36000,
  refunds_minor: 0,
  pending_refunds_minor: 0,
  activation_charges_minor: 500000,
  activation_refunds_minor: 0,
  pending_activation_refunds_minor: 0,
  net_minor: 664000,
  balance_minor: 664000,
  reserved_minor: 0,
  sent_minor: 0,
  estimated_payout_minor: 664000,
  payout_eligible_at: "2026-12-01T21:00:00Z",
  generated_at: "2026-11-14T10:00:00Z",
};

const pending: Payout = {
  id: "pay-1",
  event_id: "event-1",
  organization_id: "org-1",
  payout_profile_id: "profile-1",
  requested_by_user_id: "u1",
  amount_minor: 100000,
  currency: "KZT",
  environment: "simulation",
  simulated: true,
  status: "pending",
  transfer_status: "pending",
  adjustment_minor: 0,
  sent_at: null,
  created_at: "2026-11-14T10:00:00Z",
};

describe("FinanceTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getEventFinance).mockResolvedValue(finance);
  });

  it("shows the summary with zero amounts as money, and the payouts", async () => {
    jest.mocked(listPayouts).mockResolvedValue([pending]);
    await render(<FinanceTab event={makeEvent()} />);
    expect(await screen.findByText("Available to pay out")).toBeTruthy();
    expect(screen.getAllByText("₸6640.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("− ₸0.00").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Free/)).toBeNull();
    expect(await screen.findByText("₸1000.00")).toBeTruthy();
    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("requests a payout within the available balance", async () => {
    jest.mocked(listPayouts).mockResolvedValue([]);
    jest.mocked(requestPayout).mockResolvedValue(pending);
    await render(<FinanceTab event={makeEvent()} />);
    expect(await screen.findByText("No payouts yet.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Amount (KZT)"), "10000");
    await fireEvent.press(screen.getByText("Request payout"));
    expect(requestPayout).not.toHaveBeenCalled();
    expect(screen.getByText("At most ₸6640.00 can be paid out now.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Amount (KZT)"), "1000");
    await fireEvent.press(screen.getByText("Request payout"));
    expect(requestPayout).toHaveBeenCalledWith("event-1", 100000);
    expect(mockNotify).toHaveBeenCalledWith("Payout requested.");
  });

  it("moves a payout through the simulator and explains a refusal", async () => {
    jest.mocked(listPayouts).mockResolvedValue([pending]);
    jest.mocked(simulatePayout).mockResolvedValueOnce({ ...pending, status: "eligible", transfer_status: "eligible" });
    await render(<FinanceTab event={makeEvent()} />);
    await fireEvent.press(await screen.findByText("Mark eligible"));
    expect(simulatePayout).toHaveBeenCalledWith("event-1", "pay-1", "eligible");
    expect(mockNotify).toHaveBeenCalledWith("Payout eligible.");

    jest.mocked(simulatePayout).mockRejectedValueOnce(new ApiError("The event has not ended yet.", 409, "payout_not_eligible"));
    await fireEvent.press(screen.getByText("Fail"));
    expect(mockNotify).toHaveBeenLastCalledWith(
      "The event has not ended yet. The payout simulator only runs in development and test environments.",
    );
  });
});
