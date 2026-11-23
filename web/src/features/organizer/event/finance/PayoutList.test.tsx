import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listPayouts, simulatePayout } from "../../../../api/finance";
import { makePayout } from "../../../../../tests/helpers/fixtures";
import { PayoutList } from "./PayoutList";

vi.mock("../../../../api/finance", () => ({ listPayouts: vi.fn(), simulatePayout: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("PayoutList busy rule", () => {
  it("marks only the running button busy and locks every other simulation button", async () => {
    vi.mocked(listPayouts).mockResolvedValue([
      makePayout({ id: "p1", transfer_status: "pending" }),
      makePayout({ id: "p2", transfer_status: "pending" }),
    ]);
    vi.mocked(simulatePayout).mockReturnValue(new Promise(() => {}) as ReturnType<typeof simulatePayout>);
    render(<PayoutList eventId="e1" version={0} onChanged={vi.fn()} />);
    const eligible = await screen.findAllByRole("button", { name: /Mark eligible/ });
    fireEvent.click(eligible[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Mark eligible/ })[0]!.getAttribute("aria-busy")).toBe("true"));
    const buttons = screen.getAllByRole("button").filter((b) => /^Mark /.test(b.textContent ?? ""));
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((b) => b.getAttribute("aria-busy") === "true")).toHaveLength(1);
    const locked = buttons.filter((b) => b.getAttribute("aria-busy") !== "true");
    expect(locked.every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
    fireEvent.click(locked[0]!);
    fireEvent.click(locked[2]!);
    expect(simulatePayout).toHaveBeenCalledTimes(1);
  });
});
