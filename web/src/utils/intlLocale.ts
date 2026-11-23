/**
 * The locale to hand to `Intl` for an app language. An engine without Kazakh data would
 * silently format in its own default (often English), so Kazakh falls back to Russian,
 * which the same readers know, and anything else to English. Some engines list "kk" as
 * supported yet have no month names for it ("2027 M02 4"), so a month is formatted once
 * to check the data is really there. Each answer is kept per locale.
 */
const chosen = new Map<string, string>();

export function intlLocale(locale: string): string {
  let result = chosen.get(locale);
  if (result === undefined) {
    result = usable(locale) ? locale : locale === "kk" ? "ru" : "en";
    chosen.set(locale, result);
  }
  return result;
}

// Forgets the answers, for tests that stub the engine's locale data.
export function clearIntlLocales(): void {
  chosen.clear();
}

function usable(locale: string): boolean {
  try {
    if (!Intl.DateTimeFormat.supportedLocalesOf([locale]).length || !Intl.NumberFormat.supportedLocalesOf([locale]).length) return false;
    const month = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" })
      .formatToParts(Date.UTC(2027, 1, 4))
      .find((part) => part.type === "month")?.value;
    // A missing name comes out as the number ("2", "02") or a pattern code ("M02").
    return month !== undefined && month.trim() !== "" && !/^M?\d+$/.test(month.trim());
  } catch {
    // An unusable tag falls through to the fallback.
    return false;
  }
}
