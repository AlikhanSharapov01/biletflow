import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDelivery, resendDelivery } from "../../../api/tickets";
import type { TicketDelivery } from "../../../api/types/checkout";
import { DeliveryPanel } from "./DeliveryPanel";

vi.mock("../../../api/tickets", () => ({ getDelivery: vi.fn(), resendDelivery: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const delivery: TicketDelivery = {
  ticket_id: "t1", ticket_status: "valid", recipient_email: "aida@example.com", status: "sent", attempt_count: 1, last_error: null,
  last_delivered_at: "2026-01-01T10:00:00Z", resend_count: 0, can_resend: true, next_resend_at: null,
};

describe("DeliveryPanel", () => {
  it("keeps focus on Resend once it can no longer be used and says why", async () => {
    vi.mocked(getDelivery).mockResolvedValue(delivery);
    vi.mocked(resendDelivery).mockResolvedValue({ ...delivery, resend_count: 1, can_resend: false, next_resend_at: "2026-01-01T10:05:00Z" });
    render(<DeliveryPanel ticketId="t1" />);
    const resend = await screen.findByRole("button", { name: "Resend email" });
    resend.focus();
    fireEvent.click(resend);
    await screen.findByText("You can re-send again shortly.");
    await waitFor(() => expect(resend.getAttribute("aria-busy")).toBeNull());
    expect(document.activeElement).toBe(resend);
    expect(resend.getAttribute("aria-disabled")).toBe("true");
    expect((resend as HTMLButtonElement).disabled).toBe(false);
    expect(resend.getAttribute("aria-describedby")).toBe(screen.getByText("You can re-send again shortly.").id);
    fireEvent.click(resend);
    expect(resendDelivery).toHaveBeenCalledTimes(1);
  });
});
