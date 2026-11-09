import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cancelRegistration, requestRefund } from "../../../api/orders";
import { ApiError } from "../../../api/errors";
import { makeOrder } from "../../../../tests/helpers/fixtures";
import { ActionDialogHost } from "../../../components/ui/ActionDialog";
import { OrderActions } from "./OrderActions";

vi.mock("../../../api/orders", () => ({ cancelRegistration: vi.fn(), requestRefund: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => vi.clearAllMocks());

function mount(paid = false) {
  const onChanged = vi.fn();
  render(<MemoryRouter><OrderActions order={makeOrder({ payable_minor: paid ? 100_000 : 0 })} onChanged={onChanged} /><ActionDialogHost /></MemoryRouter>);
  fireEvent.click(screen.getByText(paid ? "Request a refund" : "Cancel registration", { selector: "summary" }));
  return onChanged;
}

describe("refund requests and cancellations", () => {
  it("opens the support case returned by a refund request and prevents another submission", async () => {
    vi.mocked(requestRefund).mockResolvedValue({ order_id: "ord1", status: "requested", case_id: "case/1" });
    const changed = mount(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: " Wrong date " } });
    fireEvent.click(screen.getByRole("button", { name: "Request refund" }));
    expect((await screen.findByRole("link", { name: "View refund request" })).getAttribute("href")).toBe("/support/cases/case%2F1");
    expect(requestRefund).toHaveBeenCalledWith("ord1", { reason: "Wrong date" });
    expect((screen.getByRole("button", { name: "Request refund" }) as HTMLButtonElement).disabled).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });

  it("makes no cancellation call until the modal is confirmed", async () => {
    vi.mocked(cancelRegistration).mockResolvedValue(makeOrder({ status: "cancelled" }));
    const changed = mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel registration" }));
    expect(cancelRegistration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});
    expect(cancelRegistration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel registration" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(cancelRegistration).toHaveBeenCalledWith("ord1", { reason: "" });
  });

  it("shows policy failures and keeps the form usable", async () => {
    vi.mocked(requestRefund).mockRejectedValue(new ApiError("The refund deadline for this order has passed.", 409, "refund_cutoff_passed"));
    const changed = mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Request refund" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("deadline"));
    expect((screen.getByRole("button", { name: "Request refund" }) as HTMLButtonElement).disabled).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByText("Not available yet")).toBeNull();
  });
});
