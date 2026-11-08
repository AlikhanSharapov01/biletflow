import { fireEvent, render, screen } from "@testing-library/react-native";

import { getEvent, listCategories, listTicketTypes, listVenues } from "@/api/catalog";
import { listHistory, publishEvent } from "@/api/eventAdmin";
import { ApiError } from "@/api/errors";
import { getEventFinance } from "@/api/finance";
import type { HistoryEntry } from "@/api/types";
import { OrganizerEventScreen } from "@/features/organizer/event/OrganizerEventScreen";

import { category, makeEvent, venue } from "../testFixtures";

const mockNotify = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ eventId: "event-1" }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/catalog");
jest.mock("@/api/eventAdmin");
jest.mock("@/api/finance");
jest.mock("@/api/seating");

const entry: HistoryEntry = {
  id: "h1",
  created_at: "2026-10-02T10:00:00Z",
  event_id: "event-1",
  organization_id: "org-1",
  actor_user_id: "u1234567890",
  service_actor: null,
  action: "event.published",
  entity_type: "event",
  entity_id: "event-1",
  description: "Event published",
  safe_change: {},
  correlation_id: "c1",
};

describe("OrganizerEventScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listCategories).mockResolvedValue([category]);
    jest.mocked(listVenues).mockResolvedValue([venue]);
    jest.mocked(listTicketTypes).mockResolvedValue([]);
  });

  it("loads the event, publishes it and reloads", async () => {
    jest.mocked(getEvent).mockResolvedValueOnce(makeEvent()).mockResolvedValue(makeEvent({ publication_state: "published" }));
    jest.mocked(publishEvent).mockResolvedValue(makeEvent({ publication_state: "published" }));
    await render(<OrganizerEventScreen />);
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
    expect(screen.getByText("draft")).toBeTruthy();
    expect(screen.getByText("Event details")).toBeTruthy();

    await fireEvent.press(screen.getByText("Publish"));
    expect(publishEvent).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText("Unpublish")).toBeTruthy();
    expect(mockNotify).toHaveBeenCalledWith("Event published.");
    expect(getEvent).toHaveBeenCalledTimes(2);
  });

  it("switches tabs and loads each section", async () => {
    jest.mocked(getEvent).mockResolvedValue(makeEvent());
    jest.mocked(listHistory).mockResolvedValue([entry]);
    jest.mocked(getEventFinance).mockRejectedValue(new ApiError("Not Found", 404));
    await render(<OrganizerEventScreen />);
    await screen.findByText("Almaty Jazz Night");

    await fireEvent.press(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText("Activity history")).toBeTruthy();
    expect(await screen.findByText("Event published")).toBeTruthy();
    expect(listHistory).toHaveBeenCalledWith("event-1");

    await fireEvent.press(screen.getByRole("tab", { name: "Finance" }));
    expect(await screen.findByText("Event finance is coming soon.")).toBeTruthy();

    await fireEvent.press(screen.getByRole("tab", { name: "Seating" }));
    expect(await screen.findByText(/This event uses general admission/)).toBeTruthy();
  });

  it("shows an error when the event cannot load", async () => {
    jest.mocked(getEvent).mockRejectedValue(new Error("Event not found."));
    await render(<OrganizerEventScreen />);
    expect(await screen.findByText("We couldn’t load this event.")).toBeTruthy();
    expect(screen.getByText("Event not found.")).toBeTruthy();
  });
});
