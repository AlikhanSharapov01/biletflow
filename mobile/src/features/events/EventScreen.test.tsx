import { fireEvent, render, screen } from "@testing-library/react-native";

import { getEvent, listCategories, listTicketTypes, listVenues } from "@/api/catalog";
import { ApiError } from "@/api/errors";
import { sampleCategory, sampleEvent, sampleProfile, sampleTicket, sampleVenue } from "@/features/checkout/testing/fixtures";
import { EventScreen } from "@/features/events/EventScreen";

const mockPush = jest.fn();
const mockProfile = sampleProfile;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ eventId: "e1" }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: mockProfile, login: jest.fn(), logout: jest.fn() }),
}));
jest.mock("@/api/catalog");
jest.mock("@/api/checkout");
jest.mock("@/api/promo");
jest.mock("@/api/reports");
jest.mock("@/api/calendar", () => ({
  getCalendarLinks: jest.fn(async () => ({
    google: "https://calendar.google.com/x",
    outlook: "https://outlook.live.com/x",
    office365: "https://outlook.office.com/x",
    ics_path: "/api/v1/events/e1/calendar.ics",
    ics_requires_sign_in: false,
    calendar_sequence: 0,
  })),
  downloadIcs: jest.fn(),
}));
jest.mock("@/api/files", () => ({ saveFile: jest.fn() }));

describe("EventScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listCategories).mockResolvedValue([sampleCategory]);
    jest.mocked(listVenues).mockResolvedValue([sampleVenue]);
  });

  it("loads the event with its visible ticket types", async () => {
    jest.mocked(getEvent).mockResolvedValue(sampleEvent);
    jest.mocked(listTicketTypes).mockResolvedValue([
      sampleTicket({ id: "t1", name: "General" }),
      sampleTicket({ id: "t2", name: "Backstage", is_hidden: true }),
    ]);
    await render(<EventScreen />);

    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
    expect(getEvent).toHaveBeenCalledWith("e1");
    expect(listTicketTypes).toHaveBeenCalledWith("e1");
    expect(screen.getByText("Music")).toBeTruthy();
    expect(screen.getByText("An evening of live jazz.")).toBeTruthy();
    expect(screen.getByText("Jazz Club, Abay 1, Almaty")).toBeTruthy();
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.queryByText("Backstage")).toBeNull();
    expect(await screen.findByText("Add to calendar")).toBeTruthy();
  });

  it("opens a support case about this event", async () => {
    jest.mocked(getEvent).mockResolvedValue(sampleEvent);
    jest.mocked(listTicketTypes).mockResolvedValue([sampleTicket()]);
    await render(<EventScreen />);
    await fireEvent.press(await screen.findByText("Get help"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/support/new", params: { event_id: "e1" } });
  });

  it("shows an error with a retry when the event cannot be loaded", async () => {
    jest.mocked(getEvent).mockRejectedValueOnce(new ApiError("That event is no longer available.", 404, "event_not_found"));
    jest.mocked(listTicketTypes).mockResolvedValue([]);
    await render(<EventScreen />);
    expect(await screen.findByText("We couldn’t load this event.")).toBeTruthy();
    expect(screen.getByText("That event is no longer available.")).toBeTruthy();

    jest.mocked(getEvent).mockResolvedValue(sampleEvent);
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
  });
});
