/**
 * The locale to hand to `Intl` for an app language. An engine without Kazakh data would
 * silently format in its own default (often English), so Kazakh falls back to Russian,
 * which the same readers know, and anything else to English.
 */
export function intlLocale(locale: string): string {
  try {
    if (Intl.DateTimeFormat.supportedLocalesOf([locale]).length && Intl.NumberFormat.supportedLocalesOf([locale]).length) return locale;
  } catch {
    // An unusable tag falls through to the fallback.
  }
  return locale === "kk" ? "ru" : "en";
}
