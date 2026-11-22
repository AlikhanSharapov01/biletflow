import type { EventFilters } from "../../api/types";

export const DISCOVER_PAGE_SIZE = 24;

export type DiscoverWhen = "" | "today" | "weekend" | "month";

export interface DiscoverQuery {
  q: string;
  category: string;
  city: string;
  when: DiscoverWhen;
  free: boolean;
  /** Whole tenge, as typed. */
  minPrice: string;
  maxPrice: string;
}

const WHEN_VALUES: readonly DiscoverWhen[] = ["today", "weekend", "month"];

function wholeNumber(value: string | null): string {
  return value !== null && /^\d+$/.test(value) ? value : "";
}

export function parseDiscoverQuery(params: URLSearchParams): DiscoverQuery {
  const when = params.get("when") ?? "";
  return {
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    city: params.get("city") ?? "",
    when: (WHEN_VALUES as readonly string[]).includes(when) ? (when as DiscoverWhen) : "",
    free: params.get("free") === "1",
    minPrice: wholeNumber(params.get("min_price")),
    maxPrice: wholeNumber(params.get("max_price")),
  };
}

export function discoverSearchParams(query: DiscoverQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.city) params.set("city", query.city);
  if (query.when) params.set("when", query.when);
  if (query.free) params.set("free", "1");
  if (query.minPrice) params.set("min_price", query.minPrice);
  if (query.maxPrice) params.set("max_price", query.maxPrice);
  return params;
}

/** Date window for a quick "when" choice, in the browser's local time zone. */
export function dateRange(when: DiscoverWhen, now: Date): { date_from?: string; date_to?: string } {
  if (!when) return {};
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const startOf = (d: number) => new Date(year, month, d, 0, 0, 0, 0);
  const endOf = (d: number) => new Date(year, month, d, 23, 59, 59, 999);
  if (when === "today") return { date_from: startOf(day).toISOString(), date_to: endOf(day).toISOString() };
  if (when === "month") {
    return { date_from: startOf(day).toISOString(), date_to: endOf(new Date(year, month + 1, 0).getDate()).toISOString() };
  }
  const weekday = now.getDay();
  if (weekday === 0) return { date_from: startOf(day).toISOString(), date_to: endOf(day).toISOString() };
  const saturday = day + (6 - weekday);
  return { date_from: startOf(saturday).toISOString(), date_to: endOf(saturday + 1).toISOString() };
}

export function eventFilters(query: DiscoverQuery, now: Date, page: { limit: number; offset: number }): EventFilters {
  const filters: EventFilters = { ...dateRange(query.when, now), limit: page.limit, offset: page.offset };
  const text = query.q.trim();
  if (text) filters.q = text;
  if (query.category) filters.category_id = query.category;
  if (query.city) filters.city = query.city;
  if (query.free) {
    filters.free = true;
  } else {
    if (query.minPrice) filters.min_price = Number(query.minPrice) * 100;
    if (query.maxPrice) filters.max_price = Number(query.maxPrice) * 100;
  }
  return filters;
}

export function priceRangeError(query: DiscoverQuery): string | null {
  if (!query.minPrice || !query.maxPrice) return null;
  return Number(query.minPrice) > Number(query.maxPrice) ? "discover.price_range_error" : null;
}

export function hasActiveFilters(query: DiscoverQuery): boolean {
  return Boolean(query.q.trim() || query.category || query.city || query.when || query.free || query.minPrice || query.maxPrice);
}
