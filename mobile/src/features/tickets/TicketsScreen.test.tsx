import { fireEvent, render, screen } from "@testing-library/react-native";

import { claimTickets, listTickets } from "@/api/tickets";
import type { IssuedTicket } from "@/api/types/checkout";
import { TicketsScreen } from "@/features/tickets/TicketsScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", email: "aida@example.com", display_name: "Aida Nur" } }),
}));
jest.mock("@/api/tickets");

const ticket: IssuedTicket = {
  id: "ticket-1",
  order_item_id: "item-1",
  event_id: "event-1",
  event_title: "Almaty Jazz Night",
  event_starts_at: "2026-12-01T14:00:00Z",
  venue_name: "Kazakhconcert Hall",
  ticket_type_name: "Standard",
  recipient_name: "Aida Nur",
  seat_snapshot: null,
  status: "valid",
  recipient_user_id: "u1",
  claimed_at: "2026-11-01T10:00:00Z",
  issued_at: "2026-11-01T10:00:00Z",
  qr_payload: "bf1.ticket.payload",
};

describe("TicketsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(claimTickets).mockResolvedValue({ claimed: 0 });
  });

  it("claims, then lists tickets and opens one", async () => {
    jest.mocked(listTickets).mockResolvedValue([ticket]);
    await render(<TicketsScreen />);
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
    expect(screen.getByText("Standard · General admission")).toBeTruthy();
    expect(screen.getByText("valid")).toBeTruthy();
    expect(claimTickets).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText("Show QR for Almaty Jazz Night"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/tickets/[ticketId]", params: { ticketId: "ticket-1" } });
  });

  it("still lists tickets when claiming fails", async () => {
    jest.mocked(claimTickets).mockRejectedValue(new Error("offline"));
    jest.mocked(listTickets).mockResolvedValue([ticket]);
    await render(<TicketsScreen />);
    expect(await screen.findByText("Almaty Jazz Night")).toBeTruthy();
  });

  it("shows the empty state", async () => {
    jest.mocked(listTickets).mockResolvedValue([]);
    await render(<TicketsScreen />);
    expect(
      await screen.findByText("No tickets yet. Find an event to register, or sign in with the email a ticket was sent to."),
    ).toBeTruthy();
  });

  it("shows an error when tickets cannot load", async () => {
    jest.mocked(listTickets).mockRejectedValue(new Error("Can’t reach BiletFlow right now."));
    await render(<TicketsScreen />);
    expect(await screen.findByText("We couldn’t load your tickets.")).toBeTruthy();
    expect(screen.getByText("Can’t reach BiletFlow right now.")).toBeTruthy();
  });
});
