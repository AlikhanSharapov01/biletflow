// Interface language. The three catalogs in ./locales are the web's files,
// copied unchanged so both clients use the same keys and wording; text only
// the app has lives in ./locales/mobile. The language follows the signed-in
// profile (Account → Language) and, before sign-in, the device.

import { useSyncExternalStore } from "react";

import type { Locale } from "@/api/types/common";

import en from "./locales/en.json";
import kk from "./locales/kk.json";
import mobileEn from "./locales/mobile/en.json";
import mobileKk from "./locales/mobile/kk.json";
import mobileRu from "./locales/mobile/ru.json";
import ru from "./locales/ru.json";

const english = { ...en, ...mobileEn };
export type TranslationKey = keyof typeof english;
type Catalog = Record<TranslationKey, string>;

const catalogs: Record<Locale, Partial<Catalog>> = {
  en: english,
  kk: { ...kk, ...mobileKk },
  ru: { ...ru, ...mobileRu },
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "kk" || value === "ru";
}

function deviceLocale(): Locale {
  try {
    const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0];
    return isLocale(language) ? language : "en";
  } catch {
    return "en";
  }
}

let current: Locale = deviceLocale();
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Components call this so they re-render, keeping their state, when the
// language changes.
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  listeners.forEach((listener) => listener());
}

// A missing translation falls back to English rather than showing a key.
export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  const template = catalogs[current][key] ?? english[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}

type PluralForm = "one" | "few" | "many" | "other";

// The CLDR rules for the three languages, written out because the app's
// JavaScript engine has no Intl.PluralRules.
export function pluralForm(count: number, locale: Locale = current): PluralForm {
  const n = Math.abs(count);
  if (locale === "ru") {
    if (!Number.isInteger(n)) return "other";
    const last = n % 10;
    const lastTwo = n % 100;
    if (last === 1 && lastTwo !== 11) return "one";
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "other";
}

// "1 ticket", "2 билета", "5 билетов".
export function quantityLabel(kind: "ticket" | "seat", count: number): string {
  return t(`count.${kind}.${pluralForm(count)}` as TranslationKey, { count });
}
