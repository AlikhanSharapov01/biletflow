import { fireEvent, render, screen } from "@testing-library/react-native";

import { listCategories, listEvents, listVenues } from "@/api/catalog";
import { ApiError } from "@/api/errors";
import { sampleCategory, sampleEvent, sampleProfile, sampleVenue } from "@/features/checkout/testing/fixtures";
import { DiscoverScreen } from "@/features/discover/DiscoverScreen";

const mockPush = jest.fn();
const mockProfile = sampleProfile;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: mockProfile, login: jest.fn(), logout: jest.fn() }),
}));
jest.mock("@/api/catalog");

describe("DiscoverScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listCategories).mockResolvedValue([sampleCategory]);
    jest.mocked(listVenues).mockResolvedValue([sampleVenue]);
  });

  it("lists events with their category and venue and opens one", async () => {
    jest.mocked(listEvents).mockResolvedValue([sampleEvent, { ...sampleEvent, id: "e2", title: "Past Gala", time_status: "completed", venue_id: "gone" }]);
    await render(<DiscoverScreen />);

    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
    expect(screen.getByText("Past Gala")).toBeTruthy();
    expect(screen.getByText(/Jazz Club · Almaty/)).toBeTruthy();
    expect(screen.getByText(/Venue details unavailable/)).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(listEvents).toHaveBeenCalledWith({ q: undefined, category_id: undefined });

    await fireEvent.press(screen.getAllByText("View event →")[0]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/events/[eventId]", params: { eventId: "e1" } });
  });

  it("searches by title when the form is applied", async () => {
    jest.mocked(listEvents).mockResolvedValue([]);
    await render(<DiscoverScreen />);
    expect(await screen.findByText("No events match those filters yet. Try another search or check back soon.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Search events"), "  jazz ");
    await fireEvent.press(screen.getByText("Search events"));
    expect(listEvents).toHaveBeenLastCalledWith({ q: "jazz", category_id: undefined });
  });

  it("shows an error with a retry", async () => {
    jest.mocked(listEvents).mockRejectedValueOnce(new ApiError("The service is temporarily unavailable. Please try again shortly.", 503));
    await render(<DiscoverScreen />);
    expect(await screen.findByText("We couldn’t load events.")).toBeTruthy();

    jest.mocked(listEvents).mockResolvedValue([sampleEvent]);
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
  });
});
