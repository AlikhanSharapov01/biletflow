import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCampaignQr } from "../../../api/campaigns";
import { ApiError } from "../../../api/errors";
import { saveBlob } from "../../../api/files";
import type { Campaign } from "../../../api/types/campaigns";
import { ToastProvider } from "../../../components/ui";
import { CampaignQr } from "../../organizer/event/campaigns/CampaignQr";
import { EntryQr } from "./EntryQr";
import { TicketQr } from "./TicketQr";

vi.mock("../../../api/campaigns", () => ({ fetchCampaignQr: vi.fn() }));
vi.mock("../../../api/files", () => ({ saveBlob: vi.fn() }));
const fetchQrMock = vi.mocked(fetchCampaignQr);
const saveBlobMock = vi.mocked(saveBlob);

const campaign: Campaign = {
  id: "cmp1",
  event_id: "e1",
  created_at: "2026-10-01T00:00:00Z",
  status: "active",
  redemptions_used: 0,
  link_url: "https://biletflow.test/c/abc",
  name: "Spring push",
  discount_kind: "percent",
  value: 10,
  starts_at: "2026-10-01T00:00:00Z",
  ends_at: "2026-12-01T00:00:00Z",
  max_redemptions: null,
  eligible_ticket_type_ids: [],
  code: "SPRING",
};

describe("TicketQr", () => {
  it("encodes the signed admission payload", () => {
    const { container } = render(<TicketQr payload="BF1.ticket.signature" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("title")?.textContent).toBe("Admission QR code");
  });

  it("explains a missing payload instead of drawing a code", () => {
    const { container } = render(<TicketQr payload={null} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByRole("img", { name: "QR code unavailable" }).textContent).toContain("only shown to the ticket holder’s own account");
  });

  it("draws different codes for different payloads", () => {
    const a = render(<TicketQr payload="payload-a" />).container.innerHTML;
    const b = render(<TicketQr payload="payload-b" />).container.innerHTML;
    expect(a).not.toBe(b);
  });
});

describe("EntryQr", () => {
  it("is captioned and titled apart from the admission ticket QR", () => {
    const { container } = render(<EntryQr token="entry-token" />);
    expect(screen.getByText("Entry confirmation — show with your ticket")).toBeTruthy();
    expect(container.querySelector("svg title")?.textContent).toBe("Entry confirmation QR code");
    expect(container.querySelector(".entry-qr")).not.toBeNull();
    expect(container.querySelector(".qr-box")).toBeNull();
  });
});

describe("CampaignQr", () => {
  const createObjectURL = vi.fn(() => "blob:campaign-qr");
  const revokeObjectURL = vi.fn();
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.unstubAllGlobals();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    fetchQrMock.mockReset();
    saveBlobMock.mockReset();
  });

  function renderCampaign() {
    return render(
      <ToastProvider>
        <CampaignQr eventId="e1" campaign={campaign} />
      </ToastProvider>,
    );
  }

  it("labels the promo QR as not an entry ticket and never draws an admission code", async () => {
    const blob = new Blob(["<svg/>"], { type: "image/svg+xml" });
    fetchQrMock.mockResolvedValue(blob);
    const { container, unmount } = renderCampaign();
    expect(screen.getByText("Promo link — not an entry ticket")).toBeTruthy();
    expect(screen.getByText("Loading QR code…")).toBeTruthy();

    const image = await screen.findByRole("img", { name: /Promo QR code for Spring push/ });
    expect(image.getAttribute("alt")).toContain("does not admit anyone");
    expect(image.getAttribute("src")).toBe("blob:campaign-qr");
    expect(fetchQrMock).toHaveBeenCalledWith("e1", "cmp1");
    // The promo QR is the server's image, not a locally drawn admission QR.
    expect(container.querySelector("svg title")).toBeNull();
    expect(screen.queryByText("Admission QR code")).toBeNull();
    expect(screen.getByText("https://biletflow.test/c/abc")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Download SVG" }));
    expect(saveBlobMock).toHaveBeenCalledWith(blob, "promo-SPRING.svg");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:campaign-qr");
  });

  it("shows the load error and keeps download disabled", async () => {
    fetchQrMock.mockRejectedValue(new ApiError("This item could not be found.", 404));
    renderCampaign();
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn’t load the QR code.");
    expect((screen.getByRole("button", { name: "Download SVG" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("copies the promo link and confirms it", async () => {
    fetchQrMock.mockReturnValue(new Promise(() => undefined));
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderCampaign();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect(writeText).toHaveBeenCalledWith("https://biletflow.test/c/abc");
    expect(screen.getByText("Promo link copied.")).toBeTruthy();
  });

  it("tells the organizer when copying fails", async () => {
    fetchQrMock.mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) } });
    renderCampaign();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect(screen.getByText("Copy failed. Select the link and copy it manually.")).toBeTruthy();
  });
});
