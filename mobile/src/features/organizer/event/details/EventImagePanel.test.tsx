import { fireEvent, render, screen } from "@testing-library/react-native";
import { getDocumentAsync } from "expo-document-picker";

import { deleteEventImage, fetchEventImage, setCoverImage, uploadEventImage } from "@/api/eventAdmin";
import type { EventImage } from "@/api/types";
import { confirmAction } from "@/components/ui/dialogs";
import { EventImagePanel } from "@/features/organizer/event/details/EventImagePanel";

import { makeEvent } from "../../testFixtures";

const mockNotify = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/components/ui/dialogs", () => ({ confirmAction: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/api/eventAdmin");

function image(id: string, index: number): EventImage {
  return {
    id,
    url: `/api/v1/events/event-1/images/${id}/content`,
    alt_text: `Image ${id}`,
    sort_order: index,
    is_cover: index === 0,
    mime_type: "image/jpeg",
    size_bytes: 204800,
  };
}

const gallery = [image("img-1", 0), image("img-2", 1)];

describe("EventImagePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchEventImage).mockResolvedValue({ uri: "file:///cache/img.jpg", filename: "img.jpg", mimeType: "image/jpeg" });
  });

  it("shows the gallery with its cover loaded through the session", async () => {
    await render(<EventImagePanel event={makeEvent({ images: gallery })} />);
    expect(screen.getByText("2 of 10")).toBeTruthy();
    expect(screen.getByText("Cover image")).toBeTruthy();
    expect(screen.getByText("Image 2")).toBeTruthy();
    expect(screen.getAllByText("JPEG · 200 KB")).toHaveLength(2);
    expect(await screen.findByLabelText("Image img-1")).toBeTruthy();
    expect(fetchEventImage).toHaveBeenCalledWith(gallery[0]);
  });

  it("makes another image the cover", async () => {
    jest.mocked(setCoverImage).mockResolvedValue([
      { ...gallery[1]!, sort_order: 0, is_cover: true },
      { ...gallery[0]!, sort_order: 1, is_cover: false },
    ]);
    await render(<EventImagePanel event={makeEvent({ images: gallery })} />);
    await fireEvent.press(screen.getByText("Make cover"));
    expect(setCoverImage).toHaveBeenCalledWith("event-1", "img-2");
    expect(mockNotify).toHaveBeenCalledWith("Cover image changed.");
  });

  it("deletes the cover only after confirmation and promotes the next image", async () => {
    jest.mocked(confirmAction).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    jest.mocked(deleteEventImage).mockResolvedValue(undefined);
    await render(<EventImagePanel event={makeEvent({ images: gallery })} />);
    await fireEvent.press(screen.getAllByText("Delete")[0]!);
    expect(deleteEventImage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText("Delete")[0]!);
    expect(deleteEventImage).toHaveBeenCalledWith("event-1", "img-1");
    expect(await screen.findByText("1 of 10")).toBeTruthy();
    expect(screen.getByText("Cover image")).toBeTruthy();
    expect(screen.queryByText("Make cover")).toBeNull();
  });

  it("uploads a JPEG and rejects other formats before sending", async () => {
    jest.mocked(getDocumentAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///a.webp", name: "a.webp", mimeType: "image/webp", size: 1000, lastModified: 0 }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///b.jpg", name: "b.jpg", mimeType: "image/jpeg", size: 1000, lastModified: 0 }] });
    jest.mocked(uploadEventImage).mockResolvedValue(image("img-3", 0));
    await render(<EventImagePanel event={makeEvent({ images: [] })} />);
    expect(screen.getByText("No images yet.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Add an image"));
    expect(await screen.findByText("Choose a PNG or JPEG image.")).toBeTruthy();
    expect(uploadEventImage).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Add an image"));
    expect(uploadEventImage).toHaveBeenCalledWith(
      "event-1",
      { uri: "file:///b.jpg", name: "b.jpg", mimeType: "image/jpeg" },
      "Image for Almaty Jazz Night",
    );
    expect(await screen.findByText("1 of 10")).toBeTruthy();
    expect(mockNotify).toHaveBeenCalledWith("Event image uploaded.");
  });
});
