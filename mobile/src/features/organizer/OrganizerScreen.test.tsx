import { fireEvent, render, screen } from "@testing-library/react-native";

import { listCategories, listVenues } from "@/api/catalog";
import { listOrganizationEvents, publishEvent } from "@/api/eventAdmin";
import { listInvitations, listMembers, listOrganizations } from "@/api/organizations";
import { OrganizerScreen } from "@/features/organizer/OrganizerScreen";

import { category, makeEvent, organization, venue } from "./testFixtures";

const mockPush = jest.fn();
const mockNotify = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", email: "aida@example.com", display_name: "Aida Nur" } }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/catalog");
jest.mock("@/api/eventAdmin");
jest.mock("@/api/organizations");

describe("OrganizerScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listCategories).mockResolvedValue([category]);
    jest.mocked(listVenues).mockResolvedValue([venue]);
    jest.mocked(listMembers).mockResolvedValue([]);
    jest.mocked(listInvitations).mockResolvedValue([]);
  });

  it("lists the workspace's events and publishes a draft", async () => {
    jest.mocked(listOrganizations).mockResolvedValue([organization]);
    jest.mocked(listOrganizationEvents).mockResolvedValue([makeEvent()]);
    jest.mocked(publishEvent).mockResolvedValue(makeEvent({ publication_state: "published" }));

    await render(<OrganizerScreen />);
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
    expect(screen.getByText("Northline Collective")).toBeTruthy();
    expect(screen.getByText("Upcoming · 1")).toBeTruthy();
    expect(listOrganizationEvents).toHaveBeenCalledWith("org-1");

    await fireEvent.press(screen.getByText("Publish"));
    expect(publishEvent).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText("1 total")).toBeTruthy();
    expect(mockNotify).toHaveBeenCalledWith("Event published.");
  });

  it("opens the new-event screen for the chosen workspace", async () => {
    jest.mocked(listOrganizations).mockResolvedValue([organization]);
    jest.mocked(listOrganizationEvents).mockResolvedValue([]);
    await render(<OrganizerScreen />);
    expect(await screen.findByText("No events in this workspace yet. Create a draft to get started.")).toBeTruthy();
    await fireEvent.press(screen.getByText("New event"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/organizer/new-event", params: { organizationId: "org-1" } });
  });

  it("offers to create a workspace when there is none", async () => {
    jest.mocked(listOrganizations).mockResolvedValue([]);
    await render(<OrganizerScreen />);
    expect(await screen.findByText("Create your organizer workspace")).toBeTruthy();
  });

  it("shows an error with a retry when the workspace cannot load", async () => {
    jest.mocked(listOrganizations).mockRejectedValue(new Error("Server unavailable."));
    await render(<OrganizerScreen />);
    expect(await screen.findByText("We couldn’t load the organizer workspace.")).toBeTruthy();
    expect(screen.getByText("Server unavailable.")).toBeTruthy();
  });
});
