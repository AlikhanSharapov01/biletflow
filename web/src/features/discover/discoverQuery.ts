import type { EventFilters } from "../../api/types";
import type { TranslationKey } from "../../i18n";
import { intlLocale } from "../../utils/intlLocale";

export const DISCOVER_PAGE_SIZE = 24;
/** Most pages of results a link can ask to restore (the `pages` URL parameter). */
export const MAX_DISCOVER_PAGES = 10;

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
  /** Pages of results shown, 1 to MAX_DISCOVER_PAGES; the rest of the query does not depend on it. */
  pages: number;
}

const WHEN_VALUES: readonly DiscoverWhen[] = ["today", "weekend", "month"];

// Limits of the events endpoint; a value beyond them is a 422, so it is dropped.
const MAX_TEXT_LENGTH = 200;
const MAX_CITY_LENGTH = 100;
const MAX_PRICE_DIGITS = 9;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whole tenge as canonical digits ("007" becomes "7"), or "" when the text is not a
 * non-negative integer of at most nine digits. Spaces, including the no-break spaces
 * ru and kk use as thousands separators, are ignored.
 */
export function normalisePrice(raw: string): string {
  const digits = raw.replace(/[\s\u00a0\u202f]/g, "").replace(/^0+(?=\d)/, "");
  return digits.length <= MAX_PRICE_DIGITS && /^\d+$/.test(digits) ? digits : "";
}

function limited(value: string | null, max: number): string {
  return value !== null && value.length <= max ? value : "";
}

function parsePages(raw: string | null): number {
  if (raw === null || !/^\d{1,6}$/.test(raw)) return 1;
  return Math.min(Math.max(Number(raw), 1), MAX_DISCOVER_PAGES);
}

export function parseDiscoverQuery(params: URLSearchParams): DiscoverQuery {
  const when = params.get("when") ?? "";
  const category = params.get("category") ?? "";
  return {
    q: limited(params.get("q"), MAX_TEXT_LENGTH),
    category: UUID.test(category) ? category.toLowerCase() : "",
    city: limited(params.get("city"), MAX_CITY_LENGTH).trim(),
    when: (WHEN_VALUES as readonly string[]).includes(when) ? (when as DiscoverWhen) : "",
    free: params.get("free") === "1",
    minPrice: normalisePrice(params.get("min_price") ?? ""),
    maxPrice: normalisePrice(params.get("max_price") ?? ""),
    pages: parsePages(params.get("pages")),
  };
}

export function discoverSearchParams(query: DiscoverQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.city) params.set("city", query.city);
  if (query.when) params.set("when", query.when);
  if (query.free) params.set("free", "1");
  if (query.minPrice) params.set("min_price", query.minPrice);
  if (query.maxPrice) params.set("max_price", query.maxPrice);
  if (query.pages > 1) params.set("pages", String(Math.min(query.pages, MAX_DISCOVER_PAGES)));
  return params;
}

/** Identifies a search: the serialised query without how many pages of it are shown. */
export function searchKey(query: DiscoverQuery): string {
  return discoverSearchParams({ ...query, pages: 1 }).toString();
}

/** Date window for a quick "when" choice, in the browser's local time zone. */
export function dateRange(when: DiscoverWhen, now: Date): { date_from?: string; date_to?: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const startOfDay = (d: number) => new Date(year, month, d);
  // The last instant of the local day, also where a DST change falls on midnight.
  const endOfDay = (d: number) => new Date(new Date(year, month, d + 1).getTime() - 1);
  const window = (from: number, to: number) => ({ date_from: startOfDay(from).toISOString(), date_to: endOfDay(to).toISOString() });
  switch (when) {
    case "":
      return {};
    case "today":
      return window(day, day);
    case "month":
      return window(day, new Date(year, month + 1, 0).getDate());
    case "weekend": {
      const weekday = now.getDay();
      if (weekday === 0) return window(day, day);
      const saturday = day + (6 - weekday);
      return window(saturday, saturday + 1);
    }
    default: {
      const unreachable: never = when;
      return unreachable;
    }
  }
}

export function eventFilters(query: DiscoverQuery, now: Date, page: { limit: number; offset: number }): EventFilters {
  // Discover lists upcoming events only: whatever has not ended by now, with or without a date preset.
  const filters: EventFilters = { ...dateRange(query.when, now), ends_after: now.toISOString(), limit: page.limit, offset: page.offset };
  const text = query.q.trim();
  if (text) filters.q = text;
  if (query.category) filters.category_id = query.category;
  if (query.city) filters.city = query.city;
  if (query.free) {
    filters.free = true;
  } else {
    const min = normalisePrice(query.minPrice);
    const max = normalisePrice(query.maxPrice);
    if (min) filters.min_price = Number(min) * 100;
    if (max) filters.max_price = Number(max) * 100;
  }
  return filters;
}

export function priceRangeError(query: DiscoverQuery): TranslationKey | null {
  if (query.free) return null;
  const min = normalisePrice(query.minPrice);
  const max = normalisePrice(query.maxPrice);
  if (!min || !max) return null;
  return Number(min) > Number(max) ? "discover.price_range_error" : null;
}

export function hasActiveFilters(query: DiscoverQuery): boolean {
  return Boolean(query.q.trim() || query.category || query.city || query.when || query.free || query.minPrice || query.maxPrice);
}

/**
 * Entries of the City select: the distinct venue cities (case-insensitive, sorted for
 * the locale) and the one matching the URL's city. A city no venue has stays selectable,
 * so an active filter is never invisible.
 */
export function cityOptions(cities: readonly string[], selected: string, locale: string): { options: string[]; value: string } {
  const byKey = new Map<string, string>();
  for (const city of [...cities, selected]) {
    const name = city.trim();
    // A longer name would be dropped from the URL (see parseDiscoverQuery), so it cannot be a filter.
    if (name && name.length <= MAX_CITY_LENGTH && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  const options = [...byKey.values()].sort((a, b) => a.localeCompare(b, intlLocale(locale)));
  return { options, value: byKey.get(selected.trim().toLowerCase()) ?? "" };
}

/** How many of the filters inside "More filters" (city, when, free, price) are set. */
export function moreFiltersCount(query: DiscoverQuery): number {
  const price = !query.free && (query.minPrice || query.maxPrice);
  return [query.city, query.when, query.free, price].filter(Boolean).length;
}
