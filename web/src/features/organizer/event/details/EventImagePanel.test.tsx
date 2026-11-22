import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../api/eventAdmin";
import { fetchBlob } from "../../../../api/files";
import { getPublicSettings } from "../../../../api/settings";
import { makeEvent, makeImage } from "../../../../../tests/helpers/fixtures";
import { ActionDialogHost } from "../../../../components/ui/ActionDialog";
import { EventImagePanel } from "./EventImagePanel";

vi.mock("../../../../api/eventAdmin", () => ({ uploadEventImage: vi.fn(), reorderEventImages: vi.fn(), setEventCover: vi.fn(), deleteEventImage: vi.fn() }));
vi.mock("../../../../api/files", () => ({ fetchBlob: vi.fn() }));
vi.mock("../../../../api/settings", () => ({ getPublicSettings: vi.fn() }));

const cover = makeImage();
const second = makeImage({ id: "img2", url: "/api/v1/events/e1/images/img2/content", alt_text: "Crowd", sort_order: 1, is_cover: false });

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => {
  vi.mocked(getPublicSettings).mockResolvedValue({ hold_minutes: 10, processing_rate_bps: 300, activation_fee_minor: 0, upload_max_bytes: 4096, currency: "KZT" });
  vi.mocked(fetchBlob).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:image"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

function mount(images = [cover, second]) {
  render(<><EventImagePanel event={makeEvent({ images, cover_image_url: images[0]?.url ?? null })} /><ActionDialogHost /></>);
}

function pick(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("event image gallery", () => {
  it("shows the platform limit, loads images with the session and marks the cover", async () => {
    mount();
    expect(await screen.findByText(/up to 4 KB each/)).toBeTruthy();
    await waitFor(() => expect(fetchBlob).toHaveBeenCalledWith(cover.url));
    expect(screen.getByText("Cover")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make cover" })).toBeTruthy();
  });

  it("checks type and size before uploading and sends the description", async () => {
    vi.mocked(api.uploadEventImage).mockResolvedValue(makeImage({ id: "img3", alt_text: "Stage", sort_order: 2, is_cover: false }));
    mount();
    await screen.findByText(/up to 4 KB each/);
    pick(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(await screen.findByText("Choose a PNG or JPEG image.")).toBeTruthy();
    pick(new File([new Uint8Array(5000)], "big.png", { type: "image/png" }));
    expect(await screen.findByText("The image must be 4 KB or smaller.")).toBeTruthy();
    expect(api.uploadEventImage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Image description/), { target: { value: "Stage" } });
    const file = new File(["png"], "stage.png", { type: "image/png" });
    pick(file);
    await screen.findByText("Stage");
    expect(api.uploadEventImage).toHaveBeenCalledWith("e1", file, "Stage");
  });

  it("marks only the running reorder busy and ignores every other action meanwhile", async () => {
    vi.mocked(api.reorderEventImages).mockReturnValue(new Promise(() => undefined));
    mount();
    const move = await screen.findByRole("button", { name: "Move “Crowd” earlier" });
    move.focus();
    fireEvent.click(move);
    expect(api.reorderEventImages).toHaveBeenCalledTimes(1);
    const busy = document.querySelectorAll('button[aria-busy="true"]');
    expect(busy.length).toBe(1);
    expect(busy[0]).toBe(move);
    expect(document.activeElement).toBe(move);
    const makeCover = screen.getByRole("button", { name: "Make cover" });
    expect(makeCover.getAttribute("aria-disabled")).toBe("true");
    expect(makeCover.hasAttribute("aria-busy")).toBe(false);
    for (const other of screen.getAllByRole("button", { name: /Remove|Make cover/ })) {
      expect(other.getAttribute("aria-disabled")).toBe("true");
    }
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
    fireEvent.click(makeCover);
    fireEvent.click(move);
    expect(api.setEventCover).not.toHaveBeenCalled();
    expect(api.reorderEventImages).toHaveBeenCalledTimes(1);
  });

  it("uses the server's order after moving, choosing a cover and deleting", async () => {
    vi.mocked(api.reorderEventImages).mockResolvedValue([{ ...second, sort_order: 0, is_cover: true }, { ...cover, sort_order: 1, is_cover: false }]);
    vi.mocked(api.deleteEventImage).mockResolvedValue({});
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Move “Crowd” earlier" }));
    await waitFor(() => expect(api.reorderEventImages).toHaveBeenCalledWith("e1", ["img2", "img1"]));
    await waitFor(() => expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("Crowd"));

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.deleteEventImage).toHaveBeenCalledWith("e1", "img1"));
    await waitFor(() => expect(screen.queryByText("Main stage")).toBeNull());
  });

  it("asks the server to set a new cover", async () => {
    vi.mocked(api.setEventCover).mockResolvedValue([{ ...second, sort_order: 0, is_cover: true }, { ...cover, sort_order: 1, is_cover: false }]);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Make cover" }));
    await waitFor(() => expect(api.setEventCover).toHaveBeenCalledWith("e1", "img2"));
  });
});
