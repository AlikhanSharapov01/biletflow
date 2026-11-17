import { render, screen } from "@testing-library/react-native";

import { listSeats } from "@/api/checkout";
import { ApiError } from "@/api/errors";
import { getPublicSettings } from "@/api/settings";
import type { EventSeat } from "@/api/types/checkout";
import type { PublicSettings } from "@/api/types/settings";
import { SeatPicker } from "@/features/checkout/components/SeatPicker";
import { TicketSelector } from "@/features/checkout/components/TicketSelector";
import { resetHoldMinutes } from "@/features/checkout/hooks/useHoldMinutes";
import { sampleEvent, sampleTicket } from "@/features/checkout/testing/fixtures";
import { setLocale } from "@/i18n";

jest.mock("@/api/settings");
jest.mock("@/api/checkout");

const settings = (hold_minutes: number): PublicSettings => ({
  hold_minutes,
  processing_rate_bps: 300,
  activation_fee_minor: 500000,
  upload_max_bytes: 5242880,
  currency: "KZT",
});

const ticket = sampleTicket({ id: "t1" });
const seat = {
  id: "s1",
  created_at: "",
  event_id: "e1",
  layout_id: "l1",
  venue_seat_id: "vs1",
  ticket_type_id: "t1",
  section_label: "A",
  row_label: "1",
  seat_label: "1",
  is_blocked: false,
  x: 0,
  y: 0,
  is_accessible: false,
  status: "available",
  paid_activation_required: false,
} as EventSeat;

const selector = () => (
  <TicketSelector event={sampleEvent} tickets={[ticket]} quantities={{}} setQuantities={jest.fn()} busy={false} message="" promo={null} onReserve={jest.fn()} />
);

// The reserve button's hold time comes from the platform settings, which an
// admin can change, so the app must not say "10 minutes" on its own.
describe("hold hint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHoldMinutes();
    jest.mocked(listSeats).mockResolvedValue([seat]);
  });
  afterEach(() => setLocale("en"));

  it("shows the hold time the server gives, not a fixed 10 minutes", async () => {
    jest.mocked(getPublicSettings).mockResolvedValue(settings(15));
    await render(selector());
    expect(await screen.findByText("Tickets are held for 15 minutes while you add recipients.")).toBeTruthy();
    expect(screen.queryByText(/10 minutes/)).toBeNull();
  });

  it("does not name a number until the settings arrive, or if they cannot be read", async () => {
    jest.mocked(getPublicSettings).mockRejectedValue(new ApiError("Not reachable", 0, "network"));
    await render(selector());
    expect(await screen.findByText("Tickets are held for a short time while you add recipients.")).toBeTruthy();
    expect(screen.queryByText(/minutes/)).toBeNull();
  });

  it("ignores a setting that is not a whole number of minutes", async () => {
    jest.mocked(getPublicSettings).mockResolvedValue(settings(0));
    await render(selector());
    expect(await screen.findByText("Tickets are held for a short time while you add recipients.")).toBeTruthy();
  });

  it("uses the same hold time for seats, in the language of the profile", async () => {
    jest.mocked(getPublicSettings).mockResolvedValue(settings(5));
    setLocale("ru");
    await render(<SeatPicker event={{ ...sampleEvent, seating_mode: "assigned" }} tickets={[ticket]} busy={false} message="" onReserve={jest.fn()} />);
    expect(await screen.findByText("Места бронируются на 5 минут, пока вы указываете получателей.")).toBeTruthy();
  });

  it("remembers the last value, so a second visit shows it at once", async () => {
    jest.mocked(getPublicSettings).mockResolvedValue(settings(20));
    const first = await render(selector());
    await screen.findByText("Tickets are held for 20 minutes while you add recipients.");
    first.unmount();
    jest.mocked(getPublicSettings).mockReturnValue(new Promise(() => undefined));
    await render(selector());
    expect(screen.getByText("Tickets are held for 20 minutes while you add recipients.")).toBeTruthy();
  });
});
