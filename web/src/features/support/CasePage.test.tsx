import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignCase, changeStatus, escalateCase, getCase } from "../../api/support";
import type { SupportCase, SupportChange } from "../../api/types/support";
import { makeProfile } from "../../../tests/helpers/fixtures";
import { CasePage } from "./CasePage";

vi.mock("../../api/support", () => ({ getCase: vi.fn(), assignCase: vi.fn(), changeStatus: vi.fn(), escalateCase: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ profile: makeProfile({ id: "s1" }) }) }));
vi.mock("./useCaseUpdates", () => ({ useCaseUpdates: () => ({ items: [], loading: false, error: null, add: () => undefined }) }));
vi.mock("./components/CaseThread", () => ({ CaseThread: () => null }));
vi.mock("./components/Composer", () => ({ Composer: () => null }));

const base: SupportCase = {
  id: "c1", kind: "attendee", category: "delivery", subject: "No ticket", status: "open",
  requester: { id: "u1", display_name: "Aida" }, organization_id: null, event_id: null, order_id: null, ticket_id: null,
  assigned_to: null, escalated_at: null, resolved_at: null, last_seq: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  viewer_roles: ["support"],
};
const change: SupportChange = {
  seq: 2, type: "change", id: "ch1", case_id: "c1", actor: { id: "s1", display_name: "Staff" }, change_kind: "status",
  before_value: "open", after_value: "in_progress", reason: null, created_at: "2026-01-01T00:00:00Z",
};

// The first read loads the page; the quiet re-read after an action returns `after`.
function mount(after: SupportCase) {
  vi.mocked(getCase).mockResolvedValueOnce(base).mockResolvedValue(after);
  render(
    <MemoryRouter initialEntries={["/support/cases/c1"]}>
      <Routes>
        <Route path="/support/cases/:caseId" element={<CasePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(changeStatus).mockResolvedValue(change);
  vi.mocked(assignCase).mockResolvedValue({ ...change, change_kind: "assignment" });
  vi.mocked(escalateCase).mockResolvedValue({ ...change, change_kind: "escalation" });
});
afterEach(() => vi.clearAllMocks());

describe("case page staff actions keep focus", () => {
  it("keeps focus on Update status once the case shows the new status", async () => {
    mount({ ...base, status: "in_progress" });
    fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "in_progress" } });
    const update = screen.getByRole("button", { name: "Update status" });
    update.focus();
    fireEvent.click(update);
    await waitFor(() => expect(getCase).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Update status" }).getAttribute("aria-busy")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Update status" }));
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("in_progress");
  });

  it("keeps focus on the assignment button when its label flips", async () => {
    mount({ ...base, assigned_to: { id: "s1", display_name: "Staff" } });
    const assign = await screen.findByRole("button", { name: "Assign to me" });
    assign.focus();
    fireEvent.click(assign);
    const unassign = await screen.findByRole("button", { name: "Unassign me" });
    await waitFor(() => expect(unassign.getAttribute("aria-busy")).toBeNull());
    expect(document.activeElement).toBe(unassign);
  });

  it("moves focus to the Staff actions heading once escalation removes its form", async () => {
    mount({ ...base, escalated_at: "2026-01-02T00:00:00Z" });
    fireEvent.change(await screen.findByLabelText(/Escalate to BiletFlow/), { target: { value: "Payment provider issue" } });
    const escalate = screen.getByRole("button", { name: "Escalate" });
    escalate.focus();
    fireEvent.click(escalate);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Escalate" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Staff actions" })));
  });

  it("moves focus to the Staff actions heading once the case is resolved", async () => {
    mount({ ...base, status: "resolved", resolved_at: "2026-01-02T00:00:00Z" });
    fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "resolved" } });
    const update = screen.getByRole("button", { name: "Update status" });
    update.focus();
    fireEvent.click(update);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Update status" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Staff actions" })));
  });
});
