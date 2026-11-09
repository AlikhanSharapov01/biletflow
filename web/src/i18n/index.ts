import { useSyncExternalStore } from "react";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import kk from "./locales/kk.json";
import type { Category } from "../api/types/catalog";
import type { Locale } from "../api/types/common";

export type TranslationKey = keyof typeof en;
const catalogs = { en, ru, kk };
const byText = new Map(Object.values(catalogs).flatMap((catalog) =>
  Object.entries(catalog).map(([key, value]) => [value, key as TranslationKey] as const)));
const messagePatterns = Object.values(catalogs).flatMap((catalog) => Object.entries(catalog).flatMap(([key, value]) => {
  if (!value.includes("{")) return [];
  const names: string[] = [];
  const pattern = value.split(/(\{\w+\})/).map((part) => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return "([\\s\\S]*?)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return [{ key: key as TranslationKey, names, pattern: new RegExp(`^${pattern}$`) }];
}));
const listeners = new Set<() => void>();
const STORAGE_KEY = "biletflow:locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "kk" || value === "ru";
}
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch { /* Storage may be disabled. */ }
  const browser = typeof navigator === "undefined" ? "en" : navigator.language.split("-")[0];
  return isLocale(browser) ? browser : "en";
}
let current: Locale = initialLocale();
export const getLocale = (): Locale => current;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "en");
}
export function setLocale(locale: Locale): void {
  current = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* Optional cache. */ }
  listeners.forEach((listener) => listener());
}
export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  return catalogs[current][key].replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}

export function quantityLabel(kind: "ticket" | "seat", count: number): string {
  const rule = new Intl.PluralRules(current).select(count);
  const form = rule === "one" || rule === "few" || rule === "many" ? rule : "other";
  return t(`count.${kind}.${form}`, { count });
}
/** Transitional lookup for label tables and errors; new code should use explicit keys. */
export function translate(value: string): string {
  const key = byText.get(value);
  if (key) return t(key);
  if (!value) return value;
  for (const item of messagePatterns) {
    const match = item.pattern.exec(value);
    if (match) return t(item.key, Object.fromEntries(item.names.map((name, index) => [name, match[index + 1] ?? ""])));
  }
  return value;
}
export function categoryName(category: Category | undefined): string {
  return category?.[`name_${current}`] || category?.name_en || t("common.event");
}
