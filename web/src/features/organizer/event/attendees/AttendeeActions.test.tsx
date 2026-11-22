import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelTicket, refundOrder } from "../../../../api/eventAdmin";
import type { Attendee } from "../../../../api/types";
import { requestReason } from "../../../../components/ui/ActionDialog";
import { deferred } from "../../../../../tests/helpers/fixtures";
import { AttendeeActions } from "./AttendeeActions";

vi.mock("../../../../api/eventAdmin", () => ({ cancelTicket: vi.fn(), refundOrder: vi.fn() }));
vi.mock("../../../../components/ui/ActionDialog", () => ({ requestReason: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const row: Attendee = {
  ticket_id: "t1", order_id: "o1", ticket_type_id: "tt1", ticket_type_name: "Standard", recipient_name: "Aida",
  recipient_email: "aida@example.com", seat_snapshot: null, status: "valid", claimed: true, issued_at: "2026-11-01T10:00:00Z",
};

describe("AttendeeActions busy rule", () => {
  it("marks only Cancel busy while it runs and locks Refund", async () => {
    vi.mocked(requestReason).mockResolvedValue("duplicate");
    const pending = deferred<unknown>();
    vi.mocked(cancelTicket).mockReturnValue(pending.promise as ReturnType<typeof cancelTicket>);
    render(<AttendeeActions eventId="e1" row={row} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel registration" }));
    const cancel = screen.getByRole("button", { name: "Cancel registration" });
    await waitFor(() => expect(cancel.getAttribute("aria-busy")).toBe("true"));
    const refund = screen.getByRole("button", { name: "Refund" });
    expect(refund.hasAttribute("aria-busy")).toBe(false);
    expect(refund.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(refund);
    expect(requestReason).toHaveBeenCalledTimes(1);
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it("marks only Refund busy while it runs and locks Cancel", async () => {
    vi.mocked(requestReason).mockResolvedValue("duplicate");
    vi.mocked(refundOrder).mockReturnValue(new Promise(() => {}) as ReturnType<typeof refundOrder>);
    render(<AttendeeActions eventId="e1" row={row} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refund" }).getAttribute("aria-busy")).toBe("true"));
    const cancel = screen.getByRole("button", { name: "Cancel registration" });
    expect(cancel.hasAttribute("aria-busy")).toBe(false);
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(cancel);
    expect(requestReason).toHaveBeenCalledTimes(1);
    expect(cancelTicket).not.toHaveBeenCalled();
  });
});
