import { describe, expect, it } from "vitest";
import type { EventSeat } from "../../../api/types/checkout";
import { groupSeats, seatHoldLines, seatLook, selectedOfType } from "./seats";

function seat(overrides: Partial<EventSeat>): EventSeat {
  return {
    id: "s1",
    created_at: "2026-10-01T00:00:00Z",
    event_id: "e1",
    layout_id: "l1",
    venue_seat_id: "v1",
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
    ...overrides,
  };
}

describe("groupSeats", () => {
  it("orders sections and rows naturally and seats by x", () => {
    const sections = groupSeats([
      seat({ id: "b", section_label: "B" }),
      seat({ id: "a10", row_label: "10" }),
      seat({ id: "a2-right", row_label: "2", x: 5, seat_label: "2" }),
      seat({ id: "a2-left", row_label: "2", x: 1, seat_label: "1" }),
    ]);
    expect(sections.map((section) => section.label)).toEqual(["A", "B"]);
    expect(sections[0]!.rows.map((row) => row.label)).toEqual(["2", "10"]);
    expect(sections[0]!.rows[0]!.seats.map((item) => item.id)).toEqual(["a2-left", "a2-right"]);
  });
});

describe("seat selection", () => {
  const seats = [seat({ id: "s1" }), seat({ id: "s2" }), seat({ id: "s3", ticket_type_id: "t2" }), seat({ id: "s4", status: "sold" })];

  it("builds one hold line per ticket type with matching quantities", () => {
    expect(seatHoldLines(seats, new Set(["s1", "s3", "s2"]))).toEqual([
      { ticket_type_id: "t1", quantity: 2, seat_ids: ["s1", "s2"] },
      { ticket_type_id: "t2", quantity: 1, seat_ids: ["s3"] },
    ]);
  });

  it("reports the look and per-type counts", () => {
    const selected = new Set(["s1"]);
    expect(seatLook(seats[0]!, selected)).toBe("selected");
    expect(seatLook(seats[3]!, selected)).toBe("sold");
    expect(selectedOfType(seats, selected, "t1")).toBe(1);
    expect(selectedOfType(seats, selected, "t2")).toBe(0);
  });
});
