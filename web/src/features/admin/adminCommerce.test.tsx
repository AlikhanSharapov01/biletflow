import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api/admin";
import type { AdminPaymentRow, AdminRefundRow } from "../../api/types/admin";
import type { PaidSalesChecklist } from "../../api/types/paidSales";
import { toCommerceFilters } from "./components/CommerceFilterForm";
import { PaidSalesModeration } from "./components/PaidSalesModeration";
import { AdminPaymentsPage } from "./pages/AdminPaymentsPage";

vi.mock("../../api/admin", () => ({
  getEventPaidSales: vi.fn(), moderatePaidSales: vi.fn(),
  searchPayments: vi.fn(), searchFailedPayments: vi.fn(), searchRefunds: vi.fn(), downloadExport: vi.fn(),
}));

const checklist: PaidSalesChecklist = {
  event_id: "e1", status: "active", simulated: true, missing: [], paid_ticket_type: true, payout_profile_verified: true,
  identity_verified: true, terms: { version: "1", text: "Terms", accepted: true }, activation_fee_minor: 500_000, currency: "KZT",
  activated_at: "2026-11-01T10:00:00Z", suspension_reason: null, payment: null,
} as PaidSalesChecklist;

const payment: AdminPaymentRow = {
  id: "pa1", event_id: "e1", status: "failed", created_at: "2026-11-09T10:00:00Z", intent_id: "i1", order_id: "o1",
  activation_id: null, payer_user_id: "u1", purpose: "ticket_order", expected_minor: 400_000, currency: "KZT",
  environment: "simulation", simulated: true, provider: "simulator", provider_payment_id: null, organization_id: "org1",
  charged_minor: null, processing_fee_minor: null, confirmed_at: null, next_reconcile_at: null,
};
const refund: AdminRefundRow = {
  id: "r1", event_id: "e1", status: "succeeded", created_at: "2026-11-09T10:00:00Z", intent_id: "i1", order_id: "o1",
  activation_id: null, payer_user_id: "u1", purpose: "ticket_order", expected_minor: 400_000, currency: "KZT",
  environment: "simulation", simulated: true, provider: "simulator", provider_payment_id: null, organization_id: "org1",
  payment_attempt_id: "pa1", reason: "Event moved", amount_minor: 400_000, succeeded_at: "2026-11-09T11:00:00Z", latest_attempt_status: "succeeded",
};
const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 25, offset: 0 });

beforeEach(() => {
  vi.mocked(api.getEventPaidSales).mockResolvedValue(checklist);
  vi.mocked(api.searchPayments).mockResolvedValue(page([payment]));
  vi.mocked(api.searchFailedPayments).mockResolvedValue(page([payment]));
  vi.mocked(api.searchRefunds).mockResolvedValue(page([refund]));
});
afterEach(() => vi.clearAllMocks());

describe("admin paid-sales suspension", () => {
  it("suspends with a reason and a stable idempotency key", async () => {
    vi.mocked(api.moderatePaidSales).mockResolvedValue({ ...checklist, status: "suspended", suspension_reason: "Fraud" });
    render(<PaidSalesModeration eventId="e1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend paid sales" }));
    fireEvent.change(screen.getByLabelText(/paid sales being suspended/), { target: { value: "Fraud" } });
    const buttons = screen.getAllByRole("button", { name: "Suspend paid sales" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(api.moderatePaidSales).toHaveBeenCalledWith("e1", "suspend", "Fraud", expect.any(String)));
    await waitFor(() => expect(api.getEventPaidSales).toHaveBeenCalledTimes(2));
  });

  it("offers no decision for an event whose paid sales never started", async () => {
    vi.mocked(api.getEventPaidSales).mockResolvedValue({ ...checklist, status: "incomplete", missing: ["terms"] });
    render(<PaidSalesModeration eventId="e1" />);
    expect(await screen.findByText(/nothing to suspend/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspend paid sales" })).toBeNull();
  });
});

describe("admin payment monitoring", () => {
  it("lists payments, switches to refunds and labels simulated records", async () => {
    render(<AdminPaymentsPage />);
    expect(await screen.findByText("₸4,000.00")).toBeTruthy();
    expect(screen.getAllByText("Simulation").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Refunds" }));
    expect(await screen.findByText("Event moved")).toBeTruthy();
    expect(api.searchRefunds).toHaveBeenCalledWith({}, 25, 0);
  });

  it("sends exact filters and exports the current list", async () => {
    render(<AdminPaymentsPage />);
    await screen.findByText("₸4,000.00");
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "activation" } });
    fireEvent.change(screen.getByLabelText("Event ID"), { target: { value: " e1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(api.searchPayments).toHaveBeenLastCalledWith({ purpose: "activation", event_id: "e1" }, 25, 0));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(api.downloadExport).toHaveBeenCalledWith("payments", { purpose: "activation", event_id: "e1" }));
  });

  it("drops empty fields from the filters", () => {
    expect(toCommerceFilters({ status: "", purpose: "", environment: "sandbox", event_id: " ", order_id: "", from: "", to: "" })).toEqual({ environment: "sandbox" });
  });
});
