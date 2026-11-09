import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listSeats } from "../../../api/checkout";
import { ApiError } from "../../../api/errors";
import type { EventSeat } from "../../../api/types/checkout";
import { deferred, makeEvent, makeSeat, makeTicketType } from "../../../../tests/helpers/fixtures";
import { groupSeats } from "../utils/seats";
import { SeatButton } from "./SeatButton";
import { SeatMap } from "./SeatMap";
import { SeatPicker } from "./SeatPicker";

vi.mock("../../../api/checkout", () => ({ listSeats: vi.fn() }));
const listSeatsMock = vi.mocked(listSeats);

afterEach(() => listSeatsMock.mockReset());

function pressed(element: HTMLElement): string | null {
  return element.getAttribute("aria-pressed");
}

describe("SeatButton", () => {
  it("announces location, price and state, and toggles when available", () => {
    const onToggle = vi.fn();
    const seat = makeSeat({ section_label: "B", row_label: "3", seat_label: "7" });
    render(<SeatButton seat={seat} look="available" priceText="Standard, ₸5,000.00" selectable onToggle={onToggle} />);

    const button = screen.getByRole("button", { name: "Section B, row 3, seat 7, Standard, ₸5,000.00, Available" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(pressed(button)).toBe("false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(seat);
  });

  it("mentions wheelchair access", () => {
    render(<SeatButton seat={makeSeat({ is_accessible: true })} look="available" priceText="GA" selectable onToggle={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("wheelchair accessible");
  });

  it.each(["held", "sold", "refund_pending", "blocked", "unavailable"] as const)("cannot pick a %s seat", (look) => {
    const onToggle = vi.fn();
    render(<SeatButton seat={makeSeat()} look={look} priceText="GA" selectable onToggle={onToggle} />);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(pressed(button)).toBeNull();
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("disables an available seat over the limit but always allows un-selecting", () => {
    const { rerender } = render(<SeatButton seat={makeSeat()} look="available" priceText="GA" selectable={false} onToggle={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);

    rerender(<SeatButton seat={makeSeat()} look="selected" priceText="GA" selectable={false} onToggle={vi.fn()} />);
    const selected = screen.getByRole("button") as HTMLButtonElement;
    expect(selected.disabled).toBe(false);
    expect(pressed(selected)).toBe("true");
    expect(selected.getAttribute("aria-label")).toContain("Selected");
  });
});

describe("SeatMap", () => {
  it("moves focus with arrows, Home and End, skipping unavailable seats", () => {
    const seats = [
      makeSeat({ id: "s1", row_label: "1", seat_label: "1" }),
      makeSeat({ id: "s2", row_label: "1", seat_label: "2", status: "sold" }),
      makeSeat({ id: "s3", row_label: "1", seat_label: "3" }),
      makeSeat({ id: "s4", row_label: "2", seat_label: "1" }),
    ];
    const onToggle = vi.fn();
    render(<SeatMap sections={groupSeats(seats)} selected={new Set()} priceText={() => "GA"} canSelect={() => true} onToggle={onToggle} />);
    const buttons = screen.getAllByRole("button");
    buttons[0]?.focus();
    fireEvent.keyDown(buttons[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(buttons[2]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[3]);
    fireEvent.keyDown(buttons[3]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0]!, { key: "End" });
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(buttons[2]!, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
    expect(onToggle).not.toHaveBeenCalled();
  });
  it("groups seats into labelled sections and rows", () => {
    const seats = [
      makeSeat({ id: "b1", section_label: "B", row_label: "1", seat_label: "1" }),
      makeSeat({ id: "a2", section_label: "A", row_label: "2", seat_label: "1" }),
      makeSeat({ id: "a1", section_label: "A", row_label: "1", seat_label: "1", status: "sold" }),
    ];
    render(<SeatMap sections={groupSeats(seats)} selected={new Set(["a2"])} priceText={() => "GA"} canSelect={() => true} onToggle={vi.fn()} />);

    expect(screen.getAllByRole("region").map((section) => section.getAttribute("aria-label"))).toEqual(["Section A", "Section B"]);
    const rowA1 = screen.getByRole("group", { name: "Section A, row 1" });
    expect((within(rowA1).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    const rowA2 = screen.getByRole("group", { name: "Section A, row 2" });
    expect(pressed(within(rowA2).getByRole("button"))).toBe("true");
  });
});

describe("SeatPicker", () => {
  const event = makeEvent({ id: "e1", seating_mode: "assigned" });
  const standard = makeTicketType({ id: "std", name: "Standard", price_minor: 500_000, kind: "paid", per_order_limit: 2 });
  const vip = makeTicketType({ id: "vip", name: "VIP", price_minor: 1_000_000, kind: "paid", per_order_limit: 1 });

  function layout(): EventSeat[] {
    return [
      makeSeat({ id: "s1", ticket_type_id: "std", seat_label: "1", x: 1 }),
      makeSeat({ id: "s2", ticket_type_id: "std", seat_label: "2", x: 2 }),
      makeSeat({ id: "s3", ticket_type_id: "std", seat_label: "3", x: 3 }),
      makeSeat({ id: "s4", ticket_type_id: "vip", seat_label: "4", x: 4 }),
      makeSeat({ id: "s5", ticket_type_id: "vip", seat_label: "5", x: 5, status: "held" }),
      makeSeat({ id: "s6", ticket_type_id: "hidden-type", seat_label: "6", x: 6 }),
    ];
  }

  function seatButton(label: string): HTMLButtonElement {
    return screen.getByRole("button", { name: new RegExp(`^Section A, row 1, seat ${label},`) }) as HTMLButtonElement;
  }

  async function renderPicker(props: Partial<{ busy: boolean; message: string; onReserve: () => void }> = {}) {
    const onReserve = props.onReserve ?? vi.fn();
    render(<SeatPicker event={event} tickets={[standard, vip]} busy={props.busy ?? false} message={props.message ?? ""} onReserve={onReserve} />);
    await screen.findByRole("group", { name: "Section A, row 1" });
    return onReserve;
  }

  it("shows a loading state until the seats arrive", async () => {
    const pending = deferred<EventSeat[]>();
    listSeatsMock.mockReturnValue(pending.promise);
    render(<SeatPicker event={event} tickets={[standard]} busy={false} message="" onReserve={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Loading the seat map");
    expect(listSeatsMock).toHaveBeenCalledWith("e1");
    await act(async () => pending.resolve(layout()));
    expect(screen.getByRole("group", { name: "Section A, row 1" })).toBeTruthy();
  });

  it("shows an error with a working retry", async () => {
    listSeatsMock.mockRejectedValueOnce(new ApiError("The service is temporarily unavailable. Please try again shortly.", 503)).mockResolvedValueOnce(layout());
    render(<SeatPicker event={event} tickets={[standard]} busy={false} message="" onReserve={vi.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load the seat map.");
    expect(alert.textContent).toContain("temporarily unavailable");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("group", { name: "Section A, row 1" })).toBeTruthy();
    expect(listSeatsMock).toHaveBeenCalledTimes(2);
  });

  it("explains when the organizer has no seats yet", async () => {
    listSeatsMock.mockResolvedValue([]);
    render(<SeatPicker event={event} tickets={[standard]} busy={false} message="" onReserve={vi.fn()} />);
    expect(await screen.findByText("The organizer has not set up seats for this event yet.")).toBeTruthy();
  });

  it("starts with nothing selected and the reserve button disabled", async () => {
    listSeatsMock.mockResolvedValue(layout());
    await renderPicker();
    expect((screen.getByRole("button", { name: "Reserve seats" }) as HTMLButtonElement).disabled).toBe(true);
    expect(seatButton("5").disabled).toBe(true);
    // A seat whose ticket type is not on offer cannot be picked.
    expect(seatButton("6").disabled).toBe(true);
    expect(seatButton("6").getAttribute("aria-label")).toContain("Not on sale");
  });

  it("sums the selection and reserves one hold line per ticket type", async () => {
    listSeatsMock.mockResolvedValue(layout());
    const onReserve = await renderPicker();

    fireEvent.click(seatButton("1"));
    fireEvent.click(seatButton("4"));

    expect(screen.getByText("Ticket subtotal").nextElementSibling?.textContent).toBe("₸15,000.00");
    fireEvent.click(screen.getByRole("button", { name: "Reserve 2 seats" }));
    expect(onReserve).toHaveBeenCalledWith([
      { ticket_type_id: "std", quantity: 1, seat_ids: ["s1"] },
      { ticket_type_id: "vip", quantity: 1, seat_ids: ["s4"] },
    ]);
  });

  it("enforces each ticket type's per-order limit", async () => {
    listSeatsMock.mockResolvedValue(layout());
    await renderPicker();

    fireEvent.click(seatButton("1"));
    fireEvent.click(seatButton("2"));
    // Standard allows two per order; the third standard seat locks.
    expect(seatButton("3").disabled).toBe(true);
    // Other types are unaffected.
    expect(seatButton("4").disabled).toBe(false);
    // Un-selecting frees the slot again.
    fireEvent.click(seatButton("2"));
    expect(seatButton("3").disabled).toBe(false);
  });

  it("removes a seat from the summary", async () => {
    listSeatsMock.mockResolvedValue(layout());
    await renderPicker();
    fireEvent.click(seatButton("1"));
    expect(screen.getByRole("button", { name: "Reserve 1 seat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove seat 1 in row 1" }));
    expect(screen.getByRole("button", { name: "Reserve seats" })).toBeTruthy();
    expect(pressed(seatButton("1"))).toBe("false");
  });

  it("clears the selection and reloads on refresh", async () => {
    listSeatsMock.mockResolvedValue(layout());
    await renderPicker();
    fireEvent.click(seatButton("1"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh seats" })));
    expect(listSeatsMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Reserve seats" })).toBeTruthy();
  });

  it("disables reserving while busy and shows the server message", async () => {
    listSeatsMock.mockResolvedValue(layout());
    await renderPicker({ busy: true, message: "One of the selected seats is no longer available." });
    expect((screen.getByRole("button", { name: "Reserving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("One of the selected seats is no longer available.")).toBeTruthy();
  });
});
