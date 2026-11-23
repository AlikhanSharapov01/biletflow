import type { Page } from "@playwright/test";
import { NOW, type Locale } from "./fixtures";

// Text widths depend on the font, and the app's font stack falls back to whatever the
// machine has (Inter here, DejaVu Sans on a CI runner). Pin the same installed fonts
// everywhere so a case gives the same answer on every machine. CI installs them
// (fonts-dejavu-core); the stylesheet below overrides the tokens in web/src/styles/tokens.css, headings
// --font-display included.
// The language select is pinned to 16px below 1025px, the widths where form fields get that size on phones and tablets.
export const PINNED_FONTS = `html:root { --font-sans: "DejaVu Sans"; --font-display: "DejaVu Sans"; --font-serif: "DejaVu Serif"; } @media (width < 1025px) { .topbar select { font-size: 16px; } }`;

/** Fixed clock, stored UI language and pinned fonts: call before `page.goto`. */
export async function prepare(page: Page, locale: Locale) {
  // Fixed clock: sales windows and event dates in fixtures.ts are relative to NOW.
  await page.clock.setFixedTime(NOW);
  // The app picks its language from this stored preference (web/src/i18n/index.ts);
  // a signed-in profile's own locale takes over once it loads.
  await page.addInitScript((value) => localStorage.setItem("biletflow:locale", value), locale);
  await page.addInitScript((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, PINNED_FONTS);
}

/** A missing pinned font would silently change every text width: fail loudly instead. */
export async function assertPinnedFonts(page: Page) {
  const missing = await page.evaluate(() => {
    const context = document.createElement("canvas").getContext("2d")!;
    const sample = "Wiiiiimmmmm 0123456789 Ыы Әә";
    const width = (font: string) => {
      context.font = `16px ${font}`;
      return context.measureText(sample).width;
    };
    return ["DejaVu Sans", "DejaVu Serif"].filter((family) => width(`"${family}", monospace`) === width("monospace"));
  });
  if (missing.length) throw new Error(`install DejaVu fonts (fonts-dejavu-core): ${missing.join(", ")} not found`);
}
