import { render, screen, waitFor } from "@testing-library/react-native";

import { listCategories, listEvents, listVenues } from "@/api/catalog";
import { fetchEventImage } from "@/api/eventAdmin";
import type { EventImage } from "@/api/types";
import { sampleCategory, sampleEvent, sampleProfile, sampleVenue } from "@/features/checkout/testing/fixtures";
import { DiscoverScreen } from "@/features/discover/DiscoverScreen";
import { EventCover } from "@/features/events/components/EventCover";
import { forgetEventImages, loadEventImage } from "@/hooks/useEventImage";

const mockProfile = sampleProfile;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: mockProfile, login: jest.fn(), logout: jest.fn() }),
}));
jest.mock("@/api/catalog");
jest.mock("@/api/eventAdmin");

const cover: EventImage = {
  id: "img-1",
  url: "/api/v1/events/e1/images/img-1/content",
  alt_text: "Stage at night",
  sort_order: 0,
  is_cover: true,
  mime_type: "image/jpeg",
  size_bytes: 1000,
};
const downloaded = { uri: "file:///cache/event-image-img-1.jpg", filename: "event-image-img-1.jpg", mimeType: "image/jpeg" };

describe("event cover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetEventImages();
    jest.mocked(listCategories).mockResolvedValue([sampleCategory]);
    jest.mocked(listVenues).mockResolvedValue([sampleVenue]);
  });

  it("shows the gallery cover above the event page, downloaded with the session", async () => {
    jest.mocked(fetchEventImage).mockResolvedValue(downloaded);
    await render(<EventCover event={{ ...sampleEvent, images: [cover] }} />);
    const image = await screen.findByLabelText("Stage at night");
    expect(JSON.stringify(image.props.source)).toContain(downloaded.uri);
    expect(fetchEventImage).toHaveBeenCalledWith(cover);
  });

  it("shows nothing for an event without images or when the image cannot be loaded", async () => {
    await render(<EventCover event={{ ...sampleEvent, images: [] }} />);
    expect(screen.queryByTestId("event-cover")).toBeNull();
    expect(fetchEventImage).not.toHaveBeenCalled();

    jest.mocked(fetchEventImage).mockRejectedValue(new Error("offline"));
    await render(<EventCover event={{ ...sampleEvent, images: [cover] }} />);
    await waitFor(() => expect(fetchEventImage).toHaveBeenCalled());
    expect(screen.queryByTestId("event-cover")).toBeNull();
  });

  it("puts the cover on Discover cards and keeps the art for events without one", async () => {
    jest.mocked(fetchEventImage).mockResolvedValue(downloaded);
    jest.mocked(listEvents).mockResolvedValue([
      { ...sampleEvent, images: [cover], cover_image_url: cover.url },
      { ...sampleEvent, id: "e2", title: "No Pictures", images: [], cover_image_url: null },
    ]);
    await render(<DiscoverScreen />);
    expect(await screen.findByText("No Pictures")).toBeTruthy();
    // The card art is hidden from screen readers; the card itself carries the label.
    const covers = await screen.findAllByTestId("event-card-cover", { includeHiddenElements: true });
    expect(covers).toHaveLength(1);
    expect(JSON.stringify(covers[0]!.props.source)).toContain(downloaded.uri);
  });

  it("downloads each image once and tries again after a failure", async () => {
    jest.mocked(fetchEventImage).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(downloaded);
    await expect(loadEventImage(cover)).rejects.toThrow("offline");
    await expect(Promise.all([loadEventImage(cover), loadEventImage(cover)])).resolves.toEqual([downloaded.uri, downloaded.uri]);
    expect(fetchEventImage).toHaveBeenCalledTimes(2);
  });
});
