import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/finance";
import { ApiError } from "../../../api/errors";
import { makeEvent, makeFinance, makePayout } from "../../../../tests/helpers/fixtures";
import { FinanceTab } from "./FinanceTab";

vi.mock("../../../api/finance", () => ({ getEventFinance: vi.fn(), listPayouts: vi.fn(), requestPayout: vi.fn(), simulatePayout: vi.fn() }));

beforeEach(() => {
  vi.mocked(api.getEventFinance).mockResolvedValue(makeFinance());
  vi.mocked(api.listPayouts).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

function value(label: string): string | null | undefined {
  return screen.getByText(label).parentElement?.textContent?.replace(label, "");
}

describe("finance tab", () => {
  it("shows the server's figures, including the activation charge and payable estimate", async () => {
    render(<FinanceTab event={makeEvent()} />);
    await screen.findByText("Ticket sales");
    expect(screen.queryByText("Not available yet")).toBeNull();
    expect(value("Gross sales")).toBe("₸12,000.00");
    expect(value("Activation fee")).toBe("− ₸5,000.00");
    expect(value("Net revenue")).toBe("₸6,640.00");
    expect(value("Estimated payout")).toBe("₸6,640.00");
    expect(await screen.findByText("No payouts requested yet.")).toBeTruthy();
  });

  it("validates the amount, then reserves a payout with a stable idempotency key", async () => {
    vi.mocked(api.requestPayout).mockRejectedValueOnce(new ApiError("Network", 0, "network")).mockResolvedValue(makePayout());
    render(<FinanceTab event={makeEvent()} />);
    const amount = await screen.findByLabelText(/Amount \(KZT\)/);
    fireEvent.change(amount, { target: { value: "7000" } });
    fireEvent.click(screen.getByRole("button", { name: "Request payout" }));
    expect(await screen.findByText("The most you can request now is ₸6,640.00.")).toBeTruthy();
    expect(api.requestPayout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use the maximum" }));
    fireEvent.click(screen.getByRole("button", { name: "Request payout" }));
    await screen.findByText("Network");
    fireEvent.click(screen.getByRole("button", { name: "Request payout" }));
    await waitFor(() => expect(api.requestPayout).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(api.requestPayout).mock.calls;
    expect(first?.slice(0, 2)).toEqual(["e1", 664_000]);
    expect(second?.[2]).toBe(first?.[2]);
    await waitFor(() => expect(api.getEventFinance).toHaveBeenCalledTimes(2));
  });

  it("offers only the simulator's next steps and withdraws them when it is off", async () => {
    vi.mocked(api.listPayouts).mockResolvedValue([makePayout()]);
    vi.mocked(api.simulatePayout).mockRejectedValue(new ApiError("Not found", 404, "not_found"));
    render(<FinanceTab event={makeEvent()} />);
    await screen.findByRole("button", { name: "Mark eligible (demo)" });
    expect(screen.queryByRole("button", { name: "Mark sent (demo)" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mark eligible (demo)" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark eligible (demo)" })).toBeNull());
    expect(api.simulatePayout).toHaveBeenCalledWith("e1", "p1", "eligible");
  });

  it("explains why payouts are unavailable for sandbox records", async () => {
    vi.mocked(api.getEventFinance).mockResolvedValue(makeFinance({ simulation_only: false, environments: ["simulation", "sandbox"] }));
    render(<FinanceTab event={makeEvent()} />);
    expect(await screen.findByText(/sandbox payment records/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request payout" })).toBeNull();
    expect(screen.getByText("Simulation and sandbox")).toBeTruthy();
  });
});
