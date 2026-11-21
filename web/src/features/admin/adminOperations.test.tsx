import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api/admin";
import { ApiError } from "../../api/errors";
import type { AdminDelivery, AdminJob, AdminOrderRow, AdminSupportCaseRow } from "../../api/types/admin";
import { RecordView } from "./components/RecordView";
import { AdminInspectPage } from "./pages/AdminInspectPage";
import { AdminJobsPage, retryBlocker } from "./pages/AdminJobsPage";
import { AdminOrdersPage } from "./pages/AdminOrdersPage";

vi.mock("../../api/admin", () => ({
  inspect: vi.fn(), getInspection: vi.fn(), searchOrders: vi.fn(),
  listJobs: vi.fn(), listDeliveries: vi.fn(), retryJob: vi.fn(), retryDelivery: vi.fn(),
}));

const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 25, offset: 0 });

const supportCase: AdminSupportCaseRow = {
  id: "c1111111-1111-4111-8111-111111111111", kind: "attendee", category: "payment", subject: "Charged twice",
  status: "open", requester_user_id: "u1", organization_id: null, event_id: "e1", order_id: "o1", ticket_id: null,
  assigned_to_user_id: null, escalated_at: null, resolved_at: null, last_seq: 3,
  created_at: "2026-11-09T10:00:00Z", updated_at: "2026-11-09T11:00:00Z", platform_access: false,
};

const job: AdminJob = {
  id: "j1111111-1111-4111-8111-111111111111", kind: "ticket_delivery_email", status: "dead", attempt_count: 5, max_attempts: 5,
  admin_retry_count: 0, last_error: "smtp_unavailable", available_at: null, lease_until: null,
  created_at: "2026-11-09T10:00:00Z", completed_at: null, event_id: "e1", context: { ticket_id: "t1" }, retryable: true,
};

const delivery: AdminDelivery = {
  id: "d1111111-1111-4111-8111-111111111111", notification_id: "n1", kind: "purchase_confirmed", channel: "email", status: "failed",
  attempt_count: 5, max_attempts: 5, admin_retry_count: 1, last_error: "email_delivery_failed", next_attempt_at: null,
  sent_at: null, provider_message_id: null, created_at: "2026-11-09T10:00:00Z", recipient_user_id: "u1", event_id: "e1",
  target: null, retryable: true,
};

beforeEach(() => {
  vi.mocked(api.inspect).mockResolvedValue(page([supportCase]) as never);
  vi.mocked(api.listJobs).mockResolvedValue(page([job]));
  vi.mocked(api.listDeliveries).mockResolvedValue(page([delivery]));
});
afterEach(() => vi.clearAllMocks());

describe("admin inspection", () => {
  it("searches support cases by text and status and opens a read-only detail", async () => {
    vi.mocked(api.getInspection).mockResolvedValue({
      case: { id: supportCase.id, subject: "Charged twice" }, message_count: 2, viewer_roles: [],
      history: [{ seq: 1, change_kind: "status", after_value: "open" }], order: { id: "o1", status: "confirmed" },
    });
    render(<AdminInspectPage />);
    expect(await screen.findByText("Charged twice")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "twice" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(api.inspect).toHaveBeenLastCalledWith("support-cases", { q: "twice", status: "open" }, 25, 0));

    fireEvent.click(await screen.findByRole("button", { name: "View" }));
    await waitFor(() => expect(api.getInspection).toHaveBeenCalledWith("support-cases", supportCase.id));
    expect(await screen.findByText("Message count")).toBeTruthy();
    expect(screen.getByText(/never changes it/)).toBeTruthy();
  });

  it("filters activations by event id and campaigns by enabled", async () => {
    render(<AdminInspectPage />);
    await screen.findByText("Charged twice");
    vi.mocked(api.inspect).mockResolvedValue(page([]) as never);
    fireEvent.change(screen.getByLabelText("Records"), { target: { value: "activations" } });
    fireEvent.change(screen.getByLabelText("Event ID"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "suspended" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(api.inspect).toHaveBeenLastCalledWith("activations", { event_id: "e1", status: "suspended" }, 25, 0));

    fireEvent.change(screen.getByLabelText("Records"), { target: { value: "campaigns" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(api.inspect).toHaveBeenLastCalledWith("campaigns", { q: "e1", enabled: false }, 25, 0));
  });

  it("opens the order detail from the order search", async () => {
    const order = { id: "o1111111-1111-4111-8111-111111111111", event_id: "e1111111", buyer_email: "demo@example.com", status: "confirmed", payable_minor: 400_000, discount_minor: 0, processing_fee_minor: 0, created_at: "2026-11-09T10:00:00Z" } as AdminOrderRow;
    vi.mocked(api.searchOrders).mockResolvedValue(page([order]));
    vi.mocked(api.getInspection).mockResolvedValue({ order: { id: order.id, status: "confirmed" }, support_cases: [], deliveries: [], audit: [] });
    render(<AdminOrdersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "View" }));
    await waitFor(() => expect(api.getInspection).toHaveBeenCalledWith("orders", order.id));
    expect(await screen.findByText("Order details")).toBeTruthy();
    expect(screen.getByText("Support cases")).toBeTruthy();
  });
});

describe("record view", () => {
  it("renders nested records, row tables, booleans and empty values", () => {
    render(<RecordView record={{ platform_access: true, resolved_at: null, items: [{ id: "a", status: "valid" }], linked: { order_id: "o1" }, tags: [] }} />);
    expect(screen.getByText("Platform access")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("Not available")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeTruthy();
    expect(screen.getByText("Order id")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
  });
});

describe("admin jobs and deliveries", () => {
  it("retries a dead job with a reason and an idempotency key, then reloads", async () => {
    vi.mocked(api.retryJob).mockResolvedValue({ ...job, status: "pending", admin_retry_count: 1, retryable: false });
    render(<AdminJobsPage />);
    expect(await screen.findByText("0 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.change(screen.getByLabelText("Why retry this now?"), { target: { value: "SMTP is back" } });
    const buttons = screen.getAllByRole("button", { name: "Retry" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(api.retryJob).toHaveBeenCalledWith(job.id, "SMTP is back", expect.any(String)));
    await waitFor(() => expect(api.listJobs).toHaveBeenCalledTimes(2));
  });

  it("shows a clear message when the retry limit is reached", async () => {
    vi.mocked(api.retryDelivery).mockRejectedValue(
      new ApiError("Retry limit reached: an admin can retry each item at most 3 times.", 409, "retry_limit_reached"),
    );
    render(<AdminJobsPage />);
    await screen.findByText("0 / 3");
    fireEvent.click(screen.getByRole("tab", { name: "Notification deliveries" }));
    await waitFor(() => expect(api.listDeliveries).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    fireEvent.change(screen.getByLabelText("Why retry this now?"), { target: { value: "Again" } });
    const buttons = screen.getAllByRole("button", { name: "Retry" });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(await screen.findByText(/Retry limit reached/)).toBeTruthy();
  });

  it("explains why a row cannot be retried instead of offering the button", async () => {
    vi.mocked(api.listJobs).mockResolvedValue(page([{ ...job, admin_retry_count: 3, retryable: false }]));
    render(<AdminJobsPage />);
    const row = (await screen.findByText("3 / 3")).closest("tr");
    if (!row) throw new Error("no row");
    expect(within(row).getByText("Retry limit reached (3 of 3).")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows the permission message for non-admins", async () => {
    vi.mocked(api.listJobs).mockRejectedValue(new ApiError("This area is for platform administrators.", 403, "admin_required"));
    render(<AdminJobsPage />);
    expect(await screen.findByText("This area is for platform administrators.")).toBeTruthy();
  });

  it("names the blocker in the backend's check order", () => {
    expect(retryBlocker(job)).toBeNull();
    expect(retryBlocker({ ...job, status: "done", retryable: false })).toBe("Already completed.");
    expect(retryBlocker({ ...job, status: "leased", retryable: false })).toBe("The worker is still trying.");
    expect(retryBlocker({ ...job, kind: "payment_reconcile", max_attempts: null, retryable: false })).toBe("This kind can’t be retried by an admin.");
  });
});
