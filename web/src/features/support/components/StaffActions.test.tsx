import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeStatus } from "../../../api/support";
import type { SupportCase, SupportChange } from "../../../api/types/support";
import { StaffActions } from "./StaffActions";

vi.mock("../../../api/support", () => ({ assignCase: vi.fn(), changeStatus: vi.fn(), escalateCase: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const supportCase: SupportCase = {
  id: "c1", kind: "attendee", category: "delivery", subject: "No ticket", status: "open",
  requester: { id: "u1", display_name: "Aida" }, organization_id: null, event_id: null, order_id: null, ticket_id: null,
  assigned_to: null, escalated_at: null, resolved_at: null, last_seq: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  viewer_roles: ["support"],
};
const change: SupportChange = {
  seq: 2, type: "change", id: "ch1", case_id: "c1", actor: { id: "s1", display_name: "Staff" }, change_kind: "status",
  before_value: "open", after_value: "in_progress", reason: null, created_at: "2026-01-01T00:00:00Z",
};

describe("StaffActions", () => {
  it("keeps focus on the update button after success and ignores it while nothing changed", async () => {
    vi.mocked(changeStatus).mockResolvedValue(change);
    const view = render(<StaffActions supportCase={supportCase} viewerId="s1" onUpdated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "in_progress" } });
    const update = screen.getByRole("button", { name: "Update status" });
    update.focus();
    fireEvent.click(update);
    await waitFor(() => expect(changeStatus).toHaveBeenCalledTimes(1));
    view.rerender(<StaffActions supportCase={{ ...supportCase, status: "in_progress" }} viewerId="s1" onUpdated={vi.fn()} />);
    await waitFor(() => expect(update.getAttribute("aria-busy")).toBeNull());
    expect(document.activeElement).toBe(update);
    expect(update.getAttribute("aria-disabled")).toBe("true");
    expect(update.matches(":disabled")).toBe(false);
    fireEvent.click(update);
    fireEvent.submit(update.closest("form")!);
    expect(changeStatus).toHaveBeenCalledTimes(1);
  });
});
