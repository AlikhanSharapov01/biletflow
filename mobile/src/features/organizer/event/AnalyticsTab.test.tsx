import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { downloadAnalyticsCsv, getAnalytics, getSalesSeries } from "@/api/analytics";
import { ApiError } from "@/api/errors";
import { listTicketTypes } from "@/api/catalog";
import type { EventAnalytics, SalesSeries } from "@/api/types/analytics";
import { AnalyticsTab } from "@/features/organizer/event/AnalyticsTab";

import { makeEvent } from "../testFixtures";

jest.mock("@/api/analytics");
jest.mock("@/api/catalog");
const mockNotify = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));

const metadata = {
  event_id: "event-1",
  timezone: "Asia/Almaty",
  generated_at: "2026-11-14T10:00:00Z",
  filters: { from: null, to: null, ticket_type_id: null, campaign_id: null },
  definitions: {},
};

const campaignRow = {
  original_tickets: 1,
  refunded_tickets: 0,
  retained_tickets: 1,
  collected_minor: 0,
  refunds_minor: 0,
  pending_refunds_minor: 0,
  fees_minor: 0,
};

const summary: EventAnalytics = {
  ...metadata,
  inventory: { capacity: 50, sold: 3, held: 1, expired_held: 0, available: 46, blocked: 0, refund_pending: 0, sold_percentage: 6 },
  revenue: {
    currency: "KZT",
    environments: ["simulation"],
    simulated: true,
    gross_minor: 1200000,
    discount_minor: 100000,
    fulfilled_collected_minor: 1100000,
    collected_minor: 1100000,
    charged_fees_minor: 33000,
    fee_reversals_minor: 0,
    fees_minor: 33000,
    refunds_minor: 0,
    pending_refunds_minor: 0,
    net_minor: 1067000,
  },
  attendance: { issued: 3, checked_in: 1, not_checked_in: 2, not_checked_in_label: "not_yet_checked_in", percentage: 33.3 },
  by_ticket_type: [{ ticket_type_id: "tt-1", name: "Standard", capacity: 50, sold: 3, checked_in: 1, revenue_minor: 1067000 }],
  by_campaign: [
    { ...campaignRow, campaign_id: "c1", name: "Spring sale", redemptions: 1, discount_minor: 100000, revenue_minor: 300000 },
    { ...campaignRow, campaign_id: null, name: "Unattributed", redemptions: 0, discount_minor: 0, revenue_minor: 767000 },
  ],
};

const series: SalesSeries = { ...metadata, bucket: "day", points: [] };

describe("AnalyticsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listTicketTypes).mockResolvedValue([]);
  });

  it("shows the server's figures, including sales no campaign applies to", async () => {
    jest.mocked(getAnalytics).mockResolvedValue(summary);
    jest.mocked(getSalesSeries).mockResolvedValue(series);
    await render(<AnalyticsTab event={makeEvent()} />);
    expect(await screen.findByText("Tickets sold")).toBeTruthy();
    expect(screen.getByText("Spring sale")).toBeTruthy();
    expect(screen.getByText("Unattributed")).toBeTruthy();
    expect(screen.getByText("No sales in this range yet.")).toBeTruthy();
    expect(getAnalytics).toHaveBeenCalledWith("event-1", {});
    expect(getSalesSeries).toHaveBeenCalledWith("event-1", {}, "day");
  });

  it("shows a server refusal as an error", async () => {
    jest.mocked(getAnalytics).mockRejectedValue(new Error("You need the reports permission for this event."));
    jest.mocked(getSalesSeries).mockResolvedValue(series);
    await render(<AnalyticsTab event={makeEvent()} />);
    expect(await screen.findByText("We couldn’t load analytics.")).toBeTruthy();
    expect(screen.getByText("You need the reports permission for this event.")).toBeTruthy();
  });

  it("exports the report shown on screen as CSV through the share sheet", async () => {
    jest.mocked(getAnalytics).mockResolvedValue(summary);
    jest.mocked(getSalesSeries).mockResolvedValue(series);
    jest.mocked(downloadAnalyticsCsv).mockResolvedValue(undefined);
    await render(<AnalyticsTab event={makeEvent()} />);
    await screen.findByText("Tickets sold");

    await fireEvent.press(screen.getByText("▸ Filters"));
    await fireEvent.press(screen.getByLabelText("Group by: Day"));
    await fireEvent.press(screen.getByText("Hour"));
    await fireEvent.press(screen.getByText("Apply"));
    await waitFor(() => expect(getSalesSeries).toHaveBeenLastCalledWith("event-1", {}, "hour"));

    await fireEvent.press(screen.getByText("Download CSV"));
    expect(downloadAnalyticsCsv).toHaveBeenCalledWith("event-1", {}, "hour");
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("Analytics CSV downloaded."));
  });

  it("explains an export the server refuses", async () => {
    jest.mocked(getAnalytics).mockResolvedValue(summary);
    jest.mocked(getSalesSeries).mockResolvedValue(series);
    jest.mocked(downloadAnalyticsCsv).mockRejectedValue(new ApiError("That range has too many points. Choose a shorter range or group by day.", 422, "analytics_range_too_large"));
    await render(<AnalyticsTab event={makeEvent()} />);
    await screen.findByText("Tickets sold");
    await fireEvent.press(screen.getByText("Download CSV"));
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith("That range has too many points. Choose a shorter range or group by day."),
    );
  });
});
