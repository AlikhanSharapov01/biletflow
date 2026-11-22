import { describe, expect, it } from "vitest";
import {
  DISCOVER_PAGE_SIZE,
  cityOptions,
  dateRange,
  discoverSearchParams,
  eventFilters,
  hasActiveFilters,
  moreFiltersCount,
  normalisePrice,
  parseDiscoverQuery,
  priceRangeError,
  type DiscoverQuery,
} from "./discoverQuery";

const empty: DiscoverQuery = { q: "", category: "", city: "", when: "", free: false, minPrice: "", maxPrice: "" };
const CAT = "0b9c1d52-4f0e-4a64-8d3a-6f1f7a5c2e11";
const q = (patch: Partial<DiscoverQuery>): DiscoverQuery => ({ ...empty, ...patch });

describe("parse and serialise", () => {
  it("treats a blank city as no filter and trims the rest", () => {
    expect(parseDiscoverQuery(new URLSearchParams("city=%20")).city).toBe("");
    expect(parseDiscoverQuery(new URLSearchParams("city=%20Almaty%20")).city).toBe("Almaty");
  });

  it("round-trips a full query with stable key order", () => {
    const full = q({ q: "jazz", category: CAT, city: "Almaty", when: "weekend", free: false, minPrice: "500", maxPrice: "9000" });
    const params = discoverSearchParams(full);
    expect(params.toString()).toBe(`q=jazz&category=${CAT}&city=Almaty&when=weekend&min_price=500&max_price=9000`);
    expect(parseDiscoverQuery(params)).toEqual(full);
    const free = q({ free: true });
    expect(discoverSearchParams(free).toString()).toBe("free=1");
    expect(parseDiscoverQuery(discoverSearchParams(free))).toEqual(free);
  });

  it("serialises every key in a fixed order", () => {
    const everything = q({ q: "jazz", category: CAT, city: "Almaty", when: "month", free: true, minPrice: "100", maxPrice: "200" });
    expect(discoverSearchParams(everything).toString()).toBe(`q=jazz&category=${CAT}&city=Almaty&when=month&free=1&min_price=100&max_price=200`);
  });

  it("omits a whitespace-only search text", () => {
    expect(discoverSearchParams(q({ q: "   " })).toString()).toBe("");
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

  it("drops values the API would reject", () => {
    expect(parseDiscoverQuery(new URLSearchParams("category=not-a-uuid")).category).toBe("");
    expect(parseDiscoverQuery(new URLSearchParams(`category=${CAT.toUpperCase()}`)).category).toBe(CAT);
    expect(parseDiscoverQuery(new URLSearchParams({ q: "a".repeat(201) })).q).toBe("");
    expect(parseDiscoverQuery(new URLSearchParams({ q: "a".repeat(200) })).q).toBe("a".repeat(200));
    expect(parseDiscoverQuery(new URLSearchParams({ city: "c".repeat(101) })).city).toBe("");
    expect(parseDiscoverQuery(new URLSearchParams({ city: "c".repeat(100) })).city).toBe("c".repeat(100));
  });

  it("keeps prices canonical and bounded", () => {
    const parsed = parseDiscoverQuery(new URLSearchParams("min_price=007&max_price=1e%2B22"));
    expect(parsed.minPrice).toBe("7");
    expect(parsed.maxPrice).toBe("");
    expect(parseDiscoverQuery(new URLSearchParams("max_price=1234567890")).maxPrice).toBe("");
  });
});

describe("normalisePrice", () => {
  it("strips spaces, including the ones ru and kk use as thousands separators", () => {
    expect(normalisePrice(" 1 500 ")).toBe("1500");
    expect(normalisePrice("1\u00a0500")).toBe("1500");
    expect(normalisePrice("1\u202f500")).toBe("1500");
  });

  it("returns canonical digits or an empty string", () => {
    expect(normalisePrice("007")).toBe("7");
    expect(normalisePrice("0")).toBe("0");
    expect(normalisePrice("999999999")).toBe("999999999");
    for (const bad of ["", "  ", "-5", "1.5", "1e+22", "1e5", "NaN", "Infinity", "abc", "1234567890", "٣"]) {
      expect(normalisePrice(bad), bad).toBe("");
    }
  });
});

describe("dateRange", () => {
  const start = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0).toISOString();
  const end = (y: number, m: number, d: number) => new Date(new Date(y, m, d + 1).getTime() - 1).toISOString();

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

  it("weekend from 31 December runs into January", () => {
    const now = new Date(2027, 11, 31, 10); // Friday
    expect(now.getDay()).toBe(5);
    expect(dateRange("weekend", now)).toEqual({ date_from: start(2028, 0, 1), date_to: end(2028, 0, 2) });
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
    expect(eventFilters(q({ q: "  jazz ", category: CAT, city: "Almaty", minPrice: "500", maxPrice: "9000" }), now, page)).toEqual({
      q: "jazz",
      category_id: CAT,
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

  it("sends canonical prices and never a non-finite number", () => {
    expect(eventFilters(q({ minPrice: "007", maxPrice: "1e+22" }), now, page)).toEqual({ min_price: 700, limit: 24, offset: 24 });
    expect(eventFilters(q({ minPrice: "1 500" }), now, page).min_price).toBe(150000);
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

  it("compares canonical numbers", () => {
    expect(priceRangeError(q({ minPrice: "1 000", maxPrice: "999" }))).toBe("discover.price_range_error");
    expect(priceRangeError(q({ minPrice: "1e+22", maxPrice: "5" }))).toBeNull();
  });

  it("is null while Free only is on, because the price fields are ignored", () => {
    expect(priceRangeError(q({ free: true, minPrice: "900", maxPrice: "500" }))).toBeNull();
  });
});

describe("hasActiveFilters", () => {
  it("ignores a search text that is only whitespace", () => {
    expect(hasActiveFilters(q({ q: "   " }))).toBe(false);
    expect(hasActiveFilters(q({ q: " a " }))).toBe(true);
  });

  it("is false for an empty query and true for any filter", () => {
    expect(hasActiveFilters(empty)).toBe(false);
    for (const patch of [{ q: "a" }, { category: CAT }, { city: "x" }, { when: "today" as const }, { free: true }, { minPrice: "1" }, { maxPrice: "1" }]) {
      expect(hasActiveFilters(q(patch))).toBe(true);
    }
  });
});

describe("cityOptions", () => {
  it("dedupes case-insensitively and sorts in the given locale", () => {
    const result = cityOptions(["Almaty", "astana", " Almaty ", "Astana", "", "Шымкент", "Алматы"], "", "ru");
    expect(result.options).toEqual(["Алматы", "Шымкент", "Almaty", "astana"]);
    expect(result.value).toBe("");
  });

  it("selects the option that matches the URL city ignoring case", () => {
    const result = cityOptions(["Almaty", "Astana"], "almaty", "en");
    expect(result.value).toBe("Almaty");
    expect(result.options).toEqual(["Almaty", "Astana"]);
  });

  it("leaves out a city longer than the URL allows", () => {
    expect(cityOptions(["Almaty", "x".repeat(101)], "", "en").options).toEqual(["Almaty"]);
  });

  it("keeps a city that no venue has, so the active filter stays visible", () => {
    const result = cityOptions(["Almaty"], "Oral", "en");
    expect(result.options).toEqual(["Almaty", "Oral"]);
    expect(result.value).toBe("Oral");
  });
});

describe("moreFiltersCount", () => {
  it("counts city, when, free and the price pair once", () => {
    expect(moreFiltersCount(empty)).toBe(0);
    expect(moreFiltersCount(q({ q: "a", category: CAT }))).toBe(0);
    expect(moreFiltersCount(q({ city: "Almaty", when: "today" }))).toBe(2);
    expect(moreFiltersCount(q({ minPrice: "1", maxPrice: "2" }))).toBe(1);
    expect(moreFiltersCount(q({ city: "A", when: "month", free: true }))).toBe(3);
  });

  it("ignores prices while Free only is on", () => {
    expect(moreFiltersCount(q({ free: true, minPrice: "5", maxPrice: "9" }))).toBe(1);
  });
});
