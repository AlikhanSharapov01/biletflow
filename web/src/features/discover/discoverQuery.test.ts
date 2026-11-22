import { describe, expect, it } from "vitest";
import {
  DISCOVER_PAGE_SIZE,
  dateRange,
  discoverSearchParams,
  eventFilters,
  hasActiveFilters,
  parseDiscoverQuery,
  priceRangeError,
  type DiscoverQuery,
} from "./discoverQuery";

const empty: DiscoverQuery = { q: "", category: "", city: "", when: "", free: false, minPrice: "", maxPrice: "" };
const q = (patch: Partial<DiscoverQuery>): DiscoverQuery => ({ ...empty, ...patch });

describe("parse and serialise", () => {
  it("round-trips a full query with stable key order", () => {
    const full = q({ q: "jazz", category: "c1", city: "Almaty", when: "weekend", free: false, minPrice: "500", maxPrice: "9000" });
    const params = discoverSearchParams(full);
    expect(params.toString()).toBe("q=jazz&category=c1&city=Almaty&when=weekend&min_price=500&max_price=9000");
    expect(parseDiscoverQuery(params)).toEqual(full);
    const free = q({ free: true });
    expect(discoverSearchParams(free).toString()).toBe("free=1");
    expect(parseDiscoverQuery(discoverSearchParams(free))).toEqual(free);
  });

  it("omits empty values", () => {
    expect(discoverSearchParams(empty).toString()).toBe("");
    expect(parseDiscoverQuery(new URLSearchParams())).toEqual(empty);
  });

  it("drops invalid values", () => {
    const parsed = parseDiscoverQuery(new URLSearchParams("when=yesterday&min_price=-5&max_price=1.5&free=yes"));
    expect(parsed).toEqual(empty);
    expect(parseDiscoverQuery(new URLSearchParams("min_price=abc&max_price=")).minPrice).toBe("");
  });
});

describe("dateRange", () => {
  const start = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0).toISOString();
  const end = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59, 59, 999).toISOString();

  it("returns nothing for no selection", () => {
    expect(dateRange("", new Date(2026, 5, 10))).toEqual({});
  });

  it("today covers the local day", () => {
    const now = new Date(2026, 5, 10, 15, 30);
    expect(dateRange("today", now)).toEqual({ date_from: start(2026, 5, 10), date_to: end(2026, 5, 10) });
  });

  it("weekend from a Wednesday is the coming Saturday and Sunday", () => {
    const now = new Date(2026, 5, 10, 9); // Wednesday
    expect(now.getDay()).toBe(3);
    expect(dateRange("weekend", now)).toEqual({ date_from: start(2026, 5, 13), date_to: end(2026, 5, 14) });
  });

  it("weekend on Saturday starts today", () => {
    const now = new Date(2026, 5, 13, 20);
    expect(now.getDay()).toBe(6);
    expect(dateRange("weekend", now)).toEqual({ date_from: start(2026, 5, 13), date_to: end(2026, 5, 14) });
  });

  it("weekend on Sunday is just today", () => {
    const now = new Date(2026, 5, 14, 8);
    expect(now.getDay()).toBe(0);
    expect(dateRange("weekend", now)).toEqual({ date_from: start(2026, 5, 14), date_to: end(2026, 5, 14) });
  });

  it("weekend crosses a month boundary", () => {
    const now = new Date(2026, 5, 29, 8); // Monday
    expect(dateRange("weekend", now)).toEqual({ date_from: start(2026, 6, 4), date_to: end(2026, 6, 5) });
  });

  it("month ends on the last day of the month", () => {
    expect(dateRange("month", new Date(2026, 1, 28, 12))).toEqual({ date_from: start(2026, 1, 28), date_to: end(2026, 1, 28) });
    expect(dateRange("month", new Date(2026, 5, 10))).toEqual({ date_from: start(2026, 5, 10), date_to: end(2026, 5, 30) });
  });

  it("month on 31 December stays in the year", () => {
    expect(dateRange("month", new Date(2026, 11, 31, 22))).toEqual({ date_from: start(2026, 11, 31), date_to: end(2026, 11, 31) });
  });
});

describe("eventFilters", () => {
  const now = new Date(2026, 5, 10, 9);
  const page = { limit: DISCOVER_PAGE_SIZE, offset: 24 };

  it("uses a page size of 24", () => {
    expect(DISCOVER_PAGE_SIZE).toBe(24);
  });

  it("maps text, category, city, paging and prices to minor units", () => {
    expect(eventFilters(q({ q: "  jazz ", category: "c1", city: "Almaty", minPrice: "500", maxPrice: "9000" }), now, page)).toEqual({
      q: "jazz",
      category_id: "c1",
      city: "Almaty",
      min_price: 50000,
      max_price: 900000,
      limit: 24,
      offset: 24,
    });
  });

  it("free replaces price fields", () => {
    expect(eventFilters(q({ free: true, minPrice: "500", maxPrice: "900" }), now, page)).toEqual({ free: true, limit: 24, offset: 24 });
  });

  it("omits empty fields and includes the date range", () => {
    const f = eventFilters(q({ when: "today", q: "  " }), now, { limit: 24, offset: 0 });
    expect(f).toEqual({ ...dateRange("today", now), limit: 24, offset: 0 });
    expect(f).not.toHaveProperty("q");
    expect(f).not.toHaveProperty("free");
  });
});

describe("priceRangeError", () => {
  it("flags min above max only", () => {
    expect(priceRangeError(q({ minPrice: "900", maxPrice: "500" }))).toBe("discover.price_range_error");
    expect(priceRangeError(q({ minPrice: "500", maxPrice: "500" }))).toBeNull();
    expect(priceRangeError(q({ minPrice: "500" }))).toBeNull();
    expect(priceRangeError(q({ maxPrice: "500" }))).toBeNull();
  });
});

describe("hasActiveFilters", () => {
  it("is false for an empty query and true for any filter", () => {
    expect(hasActiveFilters(empty)).toBe(false);
    for (const patch of [{ q: "a" }, { category: "c" }, { city: "x" }, { when: "today" as const }, { free: true }, { minPrice: "1" }, { maxPrice: "1" }]) {
      expect(hasActiveFilters(q(patch))).toBe(true);
    }
  });
});
