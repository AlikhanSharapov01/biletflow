import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "../../../tests/helpers/fixtures";
import { priceLabel } from "../../utils/format";
import { eventOffer } from "./eventOffer";

const NOW = new Date("2026-06-10T09:00:00Z");
const PAST = "2026-06-01T00:00:00Z";
const FUTURE = "2026-07-01T00:00:00Z";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const open = { registration_closes_at: FUTURE, price_from_minor: 500_000, sold_out: false } as const;

describe("eventOffer", () => {
  it("says a completed event has ended", () => {
    expect(eventOffer(makeEvent({ ...open, time_status: "completed" }))).toEqual({ kind: "ended", label: "Ended" });
  });

  it("says sales ended once registration has closed", () => {
    expect(eventOffer(makeEvent({ ...open, registration_closes_at: PAST }))).toEqual({ kind: "sales_ended", label: "Sales ended" });
  });

  it("treats the closing instant itself as closed", () => {
    expect(eventOffer(makeEvent({ ...open, registration_closes_at: NOW.toISOString() })).kind).toBe("sales_ended");
  });

  it("says sold out", () => {
    expect(eventOffer(makeEvent({ ...open, sold_out: true }))).toEqual({ kind: "sold_out", label: "Sold out" });
  });

  it("says tickets are not on sale when there is no public price", () => {
    expect(eventOffer(makeEvent({ ...open, price_from_minor: null }))).toEqual({ kind: "none", label: "Tickets not on sale yet" });
  });

  it("says free when the cheapest available type is free", () => {
    expect(eventOffer(makeEvent({ ...open, price_from_minor: 0 }))).toEqual({ kind: "free", label: "Free" });
  });

  it("shows the lowest price", () => {
    expect(eventOffer(makeEvent({ ...open, price_from_minor: 500_000 }))).toEqual({ kind: "from", label: `from ${priceLabel(500_000)}` });
  });

  it("checks ended before sales ended, sold out, none and price", () => {
    const all = { time_status: "completed", registration_closes_at: PAST, sold_out: true, price_from_minor: null } as const;
    expect(eventOffer(makeEvent(all)).kind).toBe("ended");
  });

  it("checks sales ended before sold out, none and price", () => {
    const all = { registration_closes_at: PAST, sold_out: true, price_from_minor: null } as const;
    expect(eventOffer(makeEvent(all)).kind).toBe("sales_ended");
  });

  it("checks sold out before none and price", () => {
    expect(eventOffer(makeEvent({ ...open, sold_out: true, price_from_minor: null })).kind).toBe("sold_out");
    expect(eventOffer(makeEvent({ ...open, sold_out: true, price_from_minor: 0 })).kind).toBe("sold_out");
  });

  it("checks no price before free", () => {
    expect(eventOffer(makeEvent({ ...open, price_from_minor: null })).kind).toBe("none");
  });
});
