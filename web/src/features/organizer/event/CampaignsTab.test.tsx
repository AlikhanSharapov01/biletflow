import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/campaigns";
import { listTicketTypes } from "../../../api/catalog";
import { saveBlob } from "../../../api/files";
import { ApiError } from "../../../api/errors";
import type { Campaign } from "../../../api/types/campaigns";
import { makeEvent, makeTicketType } from "../../../../tests/helpers/fixtures";
import { ActionDialogHost } from "../../../components/ui/ActionDialog";
import { CampaignsTab } from "./CampaignsTab";

vi.mock("../../../api/campaigns", () => ({ listCampaigns: vi.fn(), createCampaign: vi.fn(), updateCampaign: vi.fn(), disableCampaign: vi.fn(), fetchCampaignQr: vi.fn(), getCampaignReport: vi.fn() }));
vi.mock("../../../api/catalog", () => ({ listTicketTypes: vi.fn() }));
vi.mock("../../../api/files", () => ({ saveBlob: vi.fn() }));

const campaign: Campaign = {
  id: "c1", event_id: "e1", name: "Spring", code: "SPRING10", discount_kind: "percent", value: 10,
  starts_at: "2026-01-01T00:00:00Z", ends_at: "2099-12-31T00:00:00Z", max_redemptions: 100,
  eligible_ticket_type_ids: [], created_at: "2026-01-01T00:00:00Z", status: "active", redemptions_used: 1,
  link_url: "https://example.com/c/opaque-token",
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => {
  vi.mocked(api.listCampaigns).mockResolvedValue([campaign]);
  vi.mocked(listTicketTypes).mockResolvedValue([makeTicketType()]);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:promo-preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

function mount() { render(<><CampaignsTab event={makeEvent()} /><ActionDialogHost /></>); }

describe("campaign workspace", () => {
  it("lists live campaigns, previews and downloads QR, and reconciles the report", async () => {
    const qr = new Blob(["<svg/>"], { type: "image/svg+xml" });
    vi.mocked(api.fetchCampaignQr).mockResolvedValue(qr);
    vi.mocked(api.getCampaignReport).mockResolvedValue({
      campaign_id: "c1", redemptions: 1, orders: 1, tickets: 2, tickets_refunded: 1, tickets_kept: 1,
      gross_minor: 200_000, discount_minor: 20_000, collected_minor: 180_000,
      refunds_minor: 90_000, fees_minor: 5_400, net_minor: 84_600, generated_at: "2026-11-09T10:00:00Z",
    });
    mount();
    await screen.findByText("Spring");
    expect(screen.queryByText("Not available yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    expect((await screen.findByRole("img")).getAttribute("src")).toBe("blob:promo-preview");
    fireEvent.click(screen.getByRole("button", { name: "Download SVG" }));
    expect(saveBlob).toHaveBeenCalledWith(qr, "promo-SPRING10.svg");
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    await screen.findByText("Tickets refunded · kept");
    expect(screen.getByText("Net").parentElement?.textContent).toBe("Net₸846.00");
    expect(screen.getByText("Collected").parentElement?.textContent).toBe("Collected₸1,800.00");
    expect(screen.getByText("Processing fees retained").parentElement?.textContent).toBe("Processing fees retained₸54.00");
  });

  it("requires confirmation before disabling a campaign", async () => {
    vi.mocked(api.disableCampaign).mockResolvedValue({ ...campaign, status: "disabled" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Disable" }));
    expect(api.disableCampaign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.disableCampaign).toHaveBeenCalledWith("e1", "c1"));
    await waitFor(() => expect(api.listCampaigns).toHaveBeenCalledTimes(2));
  });

  it("keeps form values after a rejected creation and resets them after success", async () => {
    vi.mocked(api.listCampaigns).mockResolvedValue([]);
    vi.mocked(api.createCampaign).mockRejectedValueOnce(new ApiError("That promo code is already used in this event.", 409, "promo_code_taken"))
      .mockResolvedValueOnce(campaign);
    mount();
    const name = await screen.findByRole("textbox", { name: "Campaign name" });
    fireEvent.change(name, { target: { value: "Spring" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-11-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-11-20T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
    await screen.findByText("That promo code is already used in this event.");
    expect((name as HTMLInputElement).value).toBe("Spring");
    fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Campaign name" }) as HTMLInputElement).value).toBe(""));
    expect(api.createCampaign).toHaveBeenLastCalledWith("e1", expect.objectContaining({ name: "Spring", value: 10, discount_kind: "percent", code: null }));
  });
});
