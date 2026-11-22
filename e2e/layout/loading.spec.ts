import { expect, test, type Page } from "@playwright/test";
import { FOCUS_EVENT, NOW } from "./fixtures";
import { mockApi, type Role } from "./mockApi";

// The page must not move while it loads: the heading, the filters and the first card keep
// their position when the placeholders give way to the data. A request is held open to
// look at the skeleton.

const WIDTHS = [320, 390, 768, 1440];
const PINNED_FONTS = `html:root { --font-sans: "DejaVu Sans"; --font-serif: "DejaVu Serif"; }`;
const TOLERANCE = 1;
const REAL_CARD = ".event-card:not(.skeleton-card)";

async function setUp(page: Page, width: number, role: Role = "visitor") {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => localStorage.setItem("biletflow:locale", "en"));
  await page.addInitScript((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, PINNED_FONTS);
  await mockApi(page, role, "en");
}

/** Holds every request whose path matches until `release` is called, then lets it through. */
async function hold(page: Page, match: RegExp) {
  let release!: () => void;
  const open = new Promise<void>((resolve) => (release = resolve));
  await page.route((url) => match.test(url.pathname), async (route) => {
    await open;
    await route.fallback();
  });
  return release;
}

const top = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, height: box.height, width: box.width };
  });

for (const width of WIDTHS) {
  test.describe(`loading ${width}`, () => {
    test("Discover: heading, filters and first card stay put when the data arrives", async ({ page }) => {
      await setUp(page, width);
      const release = await hold(page, /^\/api\/v1\/events$/);
      await page.goto("/discover");
      await expect(page.locator(".skeleton-card").first()).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Loading events" })).toHaveCount(1);
      const before = {
        heading: await top(page, ".page-heading h1"),
        filters: await top(page, ".discover-filters"),
        card: await top(page, ".skeleton-card"),
        grid: await top(page, ".event-grid"),
      };
      release();
      await expect(page.locator(REAL_CARD).first()).toBeVisible();
      const after = {
        heading: await top(page, ".page-heading h1"),
        filters: await top(page, ".discover-filters"),
        card: await top(page, REAL_CARD),
        grid: await top(page, ".event-grid"),
      };
      expect(Math.abs(after.heading.top - before.heading.top)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(after.filters.top - before.filters.top)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(after.grid.top - before.grid.top)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(after.card.top - before.card.top)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(after.card.width - before.card.width)).toBeLessThanOrEqual(TOLERANCE);
    });

    test("Discover: a filter change keeps the cards in place, dimmed and busy, until the new ones arrive", async ({ page }) => {
      await setUp(page, width);
      await page.goto("/discover");
      await expect(page.locator(REAL_CARD).first()).toBeVisible();
      // Typing in the search box can change the filters' height; the cards only have to stay
      // where they were under the filters.
      const gap = () => page.evaluate((card) => document.querySelector(card)!.getBoundingClientRect().top - document.querySelector(".discover-filters")!.getBoundingClientRect().bottom, REAL_CARD);
      const before = await gap();
      const count = await page.locator(REAL_CARD).count();
      const release = await hold(page, /^\/api\/v1\/events$/);
      await page.getByRole("textbox", { name: "Search events" }).fill("jazz");
      await page.getByRole("textbox", { name: "Search events" }).press("Enter");
      const grid = page.locator(".event-grid");
      await expect(grid).toHaveAttribute("aria-busy", "true");
      await expect(page.locator(REAL_CARD)).toHaveCount(count);
      await expect(page.locator(".skeleton-card")).toHaveCount(0);
      expect(Number(await grid.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(1);
      expect(await grid.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
      expect(Math.abs((await gap()) - before)).toBeLessThanOrEqual(TOLERANCE);
      release();
      await expect(grid).not.toHaveAttribute("aria-busy");
      expect(Number(await grid.evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
    });

    test("Event page: the back link, heading and both columns stay put when the data arrives", async ({ page }) => {
      await setUp(page, width, "admin");
      const release = await hold(page, new RegExp(`^/api/v1/events/${FOCUS_EVENT.en}$`));
      await page.goto(`/events/${FOCUS_EVENT.en}`);
      await expect(page.locator(".skeleton-page")).toBeVisible();
      const columns = () => page.locator(".content-grid > *").evaluateAll((panels) => panels.map((panel) => {
        const box = panel.getBoundingClientRect();
        return { left: box.left, width: box.width };
      }));
      const before = { back: await top(page, ".skeleton-back"), eyebrow: await top(page, ".skeleton-eyebrow"), h1: await top(page, ".skeleton-h1"), columns: await columns() };
      release();
      await expect(page.locator(".event-description")).toBeVisible();
      const after = { back: await top(page, ".back-link"), eyebrow: await top(page, ".page-heading .eyebrow"), h1: await top(page, ".page-heading h1"), columns: await columns() };
      expect(Math.abs(after.back.top - before.back.top)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(after.eyebrow.top - before.eyebrow.top)).toBeLessThanOrEqual(TOLERANCE);
      // A long category name wraps the eyebrow on a narrow screen; the heading follows the real text then.
      if (after.eyebrow.height < 20) expect(Math.abs(after.h1.top - before.h1.top)).toBeLessThanOrEqual(TOLERANCE);
      expect(after.columns).toEqual(before.columns);
    });
  });
}
