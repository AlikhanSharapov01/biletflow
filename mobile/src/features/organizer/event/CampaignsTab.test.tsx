import { fireEvent, render, screen } from "@testing-library/react-native";

import { createCampaign, listCampaigns } from "@/api/campaigns";
import { listTicketTypes } from "@/api/catalog";
import { ApiError } from "@/api/errors";
import type { EventView } from "@/api/types";
import type { Campaign } from "@/api/types/campaigns";
import { CampaignsTab } from "@/features/organizer/event/CampaignsTab";

const mockNotify = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/campaigns");
jest.mock("@/api/catalog");

const event = { id: "e1" } as EventView;
const campaign: Campaign = {
  id: "c1",
  event_id: "e1",
  created_at: "2026-11-01T00:00:00Z",
  name: "Spring sale",
  discount_kind: "percent",
  value: 10,
  starts_at: "2026-11-01T00:00:00Z",
  ends_at: "2099-11-20T00:00:00Z",
  max_redemptions: 100,
  eligible_ticket_type_ids: [],
  code: "SPRING10",
  status: "active",
  redemptions_used: 3,
  link_url: "http://localhost:8080/c/token",
};

describe("CampaignsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listTicketTypes).mockResolvedValue([]);
  });

  it("lists campaigns from the server", async () => {
    jest.mocked(listCampaigns).mockResolvedValue([campaign]);
    await render(<CampaignsTab event={event} />);
    expect(await screen.findByText("Spring sale")).toBeTruthy();
    expect(screen.getByText("1 campaigns")).toBeTruthy();
    expect(screen.queryByText("Not available yet")).toBeNull();
  });

  it("keeps the form and shows why when creating fails", async () => {
    jest.mocked(listCampaigns).mockResolvedValue([]);
    jest.mocked(createCampaign).mockRejectedValue(new ApiError("That promo code is already used in this event.", 409, "promo_code_taken"));
    await render(<CampaignsTab event={event} />);
    expect(await screen.findByText("No campaigns yet. Create one below.")).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Early bird"), "Spring sale");
    await fireEvent.changeText(screen.getByPlaceholderText("EARLYBIRD"), "SPRING10");
    await fireEvent.changeText(screen.getByLabelText("Starts, format YYYY-MM-DD HH:mm"), "2099-11-01 10:00");
    await fireEvent.changeText(screen.getByLabelText("Ends, format YYYY-MM-DD HH:mm"), "2099-11-20 10:00");
    await fireEvent.press(screen.getByText("Create campaign"));
    expect(createCampaign).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("That promo code is already used in this event.")).toBeTruthy();
    expect(screen.getByDisplayValue("Spring sale")).toBeTruthy();
    expect(screen.getByDisplayValue("SPRING10")).toBeTruthy();
  });
});
