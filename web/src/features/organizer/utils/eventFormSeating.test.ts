import { describe, expect, it } from "vitest";
import type { EventView } from "../../../api/types";
import { eventFormValues, toEventInput } from "./eventForm";

const NOW = new Date("2026-10-26T12:00:00Z");
const values = {
  ...eventFormValues(),
  title: "Hall night",
  category_id: "c1",
  venue_id: "v1",
  starts_at: "2026-11-05T19:00",
  ends_at: "2026-11-05T22:00",
};

describe("toEventInput seating", () => {
  it("requires a layout for assigned seating and sends it", () => {
    expect(toEventInput({ ...values, seating_mode: "assigned" }, undefined, NOW)).toMatchObject({ ok: false });
    expect(toEventInput({ ...values, seating_mode: "assigned", venue_layout_id: "l1" }, undefined, NOW)).toMatchObject({
      ok: true,
      input: { seating_mode: "assigned", venue_layout_id: "l1" },
    });
  });

  it("drops the layout for general admission and after a venue change", () => {
    expect(toEventInput({ ...values, seating_mode: "general", venue_layout_id: "l1" }, undefined, NOW)).toMatchObject({ ok: true, input: { venue_layout_id: null } });
    const existing = { seating_mode: "assigned", venue_layout_id: "l1" } as EventView;
    expect(toEventInput({ ...values, seating_mode: "assigned", venue_layout_id: "" }, existing, NOW)).toMatchObject({ ok: false });
  });
});
