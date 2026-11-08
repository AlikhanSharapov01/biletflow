import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { saveFile } from "@/api/files";
import { downloadTicketPdf, getAdmission, getDelivery, getTicket, requestEntryConfirmation } from "@/api/tickets";
import type { IssuedTicket } from "@/api/types/checkout";
import { TicketScreen } from "@/features/tickets/TicketScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ ticketId: "ticket-1" }),
}));
const mockNotify = jest.fn();
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/tickets");
jest.mock("@/api/files", () => ({ saveFile: jest.fn() }));

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

describe("TicketScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAdmission).mockResolvedValue({
      ticket_id: "ticket-1",
      status: "valid",
      checked_in_at: null,
      reversed_at: null,
      admission_window: { opens_at: "2026-12-01T13:00:00Z", closes_at: "2026-12-01T18:00:00Z" },
    });
    jest.mocked(getDelivery).mockResolvedValue({
      ticket_id: "ticket-1",
      ticket_status: "valid",
      recipient_email: "aida@example.com",
      status: "delivered",
      attempt_count: 1,
      last_error: null,
      last_delivered_at: "2026-11-01T10:01:00Z",
      resend_count: 0,
      can_resend: true,
      next_resend_at: null,
    });
  });

  it("shows the ticket QR and shares the PDF", async () => {
    jest.mocked(getTicket).mockResolvedValue(ticket);
    const file = { uri: "file:///cache/biletflow-ticket-ticket-1.pdf", filename: "biletflow-ticket-ticket-1.pdf", mimeType: "application/pdf" };
    jest.mocked(downloadTicketPdf).mockResolvedValue(file);
    await render(<TicketScreen />);
    expect(await screen.findByLabelText("Admission QR code")).toBeTruthy();
    expect(await screen.findByText("aida@example.com")).toBeTruthy();
    await fireEvent.press(screen.getByText("Download PDF"));
    expect(downloadTicketPdf).toHaveBeenCalledWith("ticket-1");
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(file));
  });

  it("requests an entry confirmation with an 8-digit code", async () => {
    jest.mocked(getTicket).mockResolvedValue(ticket);
    jest.mocked(requestEntryConfirmation).mockResolvedValue({
      id: "ec1",
      ticket_id: "ticket-1",
      event_id: "event-1",
      token: "bf1.entry.token",
      code: "12345678",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      expires_in_seconds: 120,
      signing_key_id: "k1",
    });
    await render(<TicketScreen />);
    await fireEvent.press(await screen.findByText("Confirm entry"));
    expect(requestEntryConfirmation).toHaveBeenCalledWith("ticket-1");
    expect(await screen.findByText("1234 5678")).toBeTruthy();
    expect(screen.getByLabelText("Entry confirmation QR code")).toBeTruthy();
  });

  it("hides the QR and PDF when the payload is not the viewer's", async () => {
    jest.mocked(getTicket).mockResolvedValue({ ...ticket, qr_payload: null });
    await render(<TicketScreen />);
    expect(await screen.findByLabelText("QR code unavailable")).toBeTruthy();
    expect(screen.queryByText("Download PDF")).toBeNull();
    expect(screen.queryByText("Confirm entry")).toBeNull();
  });

  it("shows an error when the ticket cannot load", async () => {
    jest.mocked(getTicket).mockRejectedValue(new Error("That ticket isn’t assigned to you."));
    await render(<TicketScreen />);
    expect(await screen.findByText("We couldn’t load this ticket.")).toBeTruthy();
    expect(screen.getByText("That ticket isn’t assigned to you.")).toBeTruthy();
  });
});
