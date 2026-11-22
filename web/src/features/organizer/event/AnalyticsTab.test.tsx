import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/analytics";
import { listCampaigns } from "../../../api/campaigns";
import { listTicketTypes } from "../../../api/catalog";
import { ApiError } from "../../../api/errors";
import { makeAnalytics, makeEvent, makeTicketType } from "../../../../tests/helpers/fixtures";
import { AnalyticsTab } from "./AnalyticsTab";

vi.mock("../../../api/analytics", () => ({ getAnalytics: vi.fn(), getSalesSeries: vi.fn(), getTraffic: vi.fn(), downloadAnalyticsCsv: vi.fn() }));
vi.mock("../../../api/campaigns", () => ({ listCampaigns: vi.fn() }));
vi.mock("../../../api/catalog", () => ({ listTicketTypes: vi.fn() }));

const series = {
  event_id: "e1", timezone: "Asia/Almaty", generated_at: "2026-11-09T10:00:00Z",
  filters: { from: null, to: null, ticket_type_id: null, campaign_id: null }, definitions: {},
  bucket: "day" as const,
  points: [{ bucket_start: "2026-11-01T00:00:00+05:00", tickets: 25, revenue_minor: 873_000 }],
};

beforeEach(() => {
  vi.mocked(api.getAnalytics).mockResolvedValue(makeAnalytics());
  vi.mocked(api.getSalesSeries).mockResolvedValue(series);
  vi.mocked(listTicketTypes).mockResolvedValue([makeTicketType()]);
  vi.mocked(listCampaigns).mockResolvedValue([]);
  vi.mocked(api.getTraffic).mockResolvedValue({
    event_id: "e1", source: "ga4", state: "disabled", error: null, timezone: "Asia/Almaty",
    range: { from: "2026-10-23", to: "2026-11-20" }, fetched_at: null, expires_at: null, metrics: null, definitions: {},
  });
});
afterEach(() => vi.clearAllMocks());

describe("analytics tab", () => {
  it("shows the server's figures and percentages without a planned placeholder", async () => {
    render(<AnalyticsTab event={makeEvent()} />);
    await screen.findByText("Tickets sold");
    expect(screen.queryByText("Not available yet")).toBeNull();
    expect(screen.getByText("25% of 100 capacity")).toBeTruthy();
    expect(screen.getByText("40% of 25 issued")).toBeTruthy();
    expect(screen.getByText("Not yet checked in")).toBeTruthy();
    expect(screen.getByText("Demonstration figures")).toBeTruthy();
    expect(screen.getByRole("img", { name: /tickets sold per day/i })).toBeTruthy();
  });

  it("names unattributed campaign sales and labels absentees after the event", async () => {
    vi.mocked(api.getAnalytics).mockResolvedValue(makeAnalytics({
      attendance: { issued: 25, checked_in: 10, not_checked_in: 15, not_checked_in_label: "absent", percentage: 40 },
      by_campaign: [
        { campaign_id: "c1", name: "Spring", redemptions: 2, original_tickets: 3, refunded_tickets: 1, retained_tickets: 2, discount_minor: 10_000, revenue_minor: 50_000, collected_minor: 60_000, refunds_minor: 10_000, pending_refunds_minor: 0, fees_minor: 0 },
        { campaign_id: null, name: "Unattributed", redemptions: 0, original_tickets: 22, refunded_tickets: 0, retained_tickets: 22, discount_minor: 0, revenue_minor: 823_000, collected_minor: 823_000, refunds_minor: 0, pending_refunds_minor: 0, fees_minor: 0 },
      ],
    }));
    vi.mocked(listCampaigns).mockResolvedValue([{ id: "c1", name: "Spring" } as never]);
    render(<AnalyticsTab event={makeEvent()} />);
    expect(await screen.findByText("No campaign")).toBeTruthy();
    expect(screen.getByText("Absent")).toBeTruthy();
    expect(screen.getByText("2 / 1")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Spring" })).toBeTruthy();
  });

  it("hides the campaign filter from staff without campaign access and sends filters", async () => {
    vi.mocked(listCampaigns).mockRejectedValue(new ApiError("No", 403, "permission_denied"));
    render(<AnalyticsTab event={makeEvent()} />);
    await screen.findByText("Tickets sold");
    expect(screen.queryByLabelText("Campaign")).toBeNull();
    fireEvent.change(screen.getByLabelText("Ticket type"), { target: { value: "t1" } });
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "hour" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(api.getSalesSeries).toHaveBeenLastCalledWith("e1", { ticket_type_id: "t1" }, "hour"));
  });

  it("downloads the CSV with the same applied filters and grouping as the report", async () => {
    vi.mocked(api.downloadAnalyticsCsv).mockResolvedValue();
    render(<AnalyticsTab event={makeEvent()} />);
    await screen.findByText("Tickets sold");
    fireEvent.change(screen.getByLabelText("Ticket type"), { target: { value: "t1" } });
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "hour" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(api.getSalesSeries).toHaveBeenLastCalledWith("e1", { ticket_type_id: "t1" }, "hour"));
    fireEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(api.downloadAnalyticsCsv).toHaveBeenCalledWith("e1", { ticket_type_id: "t1" }, "hour"));
    expect(api.getAnalytics).toHaveBeenLastCalledWith("e1", { ticket_type_id: "t1" });
  });

  it("marks the export busy without disabling it and ignores a second click", async () => {
    vi.mocked(api.downloadAnalyticsCsv).mockReturnValue(new Promise(() => undefined));
    render(<AnalyticsTab event={makeEvent()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    const busy = await screen.findByRole("button", { name: "Preparing CSV…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.hasAttribute("disabled")).toBe(false);
    fireEvent.click(busy);
    expect(api.downloadAnalyticsCsv).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message when the export fails", async () => {
    vi.mocked(api.downloadAnalyticsCsv).mockRejectedValue(new ApiError("You don't have permission to do that.", 403, "permission_denied"));
    render(<AnalyticsTab event={makeEvent()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    expect(await screen.findByText("You don't have permission to do that.")).toBeTruthy();
  });

  it("shows the server's message for a range that is too large", async () => {
    vi.mocked(api.getSalesSeries).mockRejectedValue(new ApiError("That range has too many points. Choose a shorter range or group by day.", 422, "analytics_range_too_large"));
    render(<AnalyticsTab event={makeEvent()} />);
    expect(await screen.findByText(/too many points/)).toBeTruthy();
  });
});
