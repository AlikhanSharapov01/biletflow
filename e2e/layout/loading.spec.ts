import { expect, test, type Page } from "@playwright/test";
import { FOCUS_EVENT, LOCALES, type Locale } from "./fixtures";
import { assertPinnedFonts, prepare } from "./harness";
import { mockApi, type Role } from "./mockApi";

// The page must not move while it loads: the heading, the filters and the first card keep
// their position when the placeholders give way to the data. A request is held open to
// look at the skeleton.

const WIDTHS = [320, 390, 768, 1440];
const TOLERANCE = 1;
const REAL_CARD = ".event-card:not(.skeleton-card)";

async function setUp(page: Page, width: number, role: Role = "visitor", locale: Locale = "en") {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page, locale);
  await mockApi(page, role, locale);
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

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE);

for (const width of WIDTHS) {
  for (const locale of LOCALES) {
    test.describe(`loading ${width} ${locale}`, () => {
      test("Discover: heading, filters and first card stay put when the data arrives", async ({ page }) => {
        await setUp(page, width, "visitor", locale);
        const release = await hold(page, /^\/api\/v1\/events$/);
        await page.goto("/discover");
        await expect(page.locator(".skeleton-card").first()).toBeVisible();
        await assertPinnedFonts(page);
        // One live region carries the skeleton's label.
        await expect(page.locator("[role=status]:has(.skeleton-card)")).toHaveCount(1);
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
        // Only positions and widths are compared: card heights differ by design (a skeleton is one
        // typical card, a real card grows with its title and meta lines).
        near(after.heading.top, before.heading.top);
        near(after.filters.top, before.filters.top);
        near(after.grid.top, before.grid.top);
        near(after.card.top, before.card.top);
        near(after.card.width, before.card.width);
      });

      test("Event page: the back link, heading and both columns stay put when the data arrives", async ({ page }) => {
        await setUp(page, width, "admin", locale);
        const release = await hold(page, new RegExp(`^/api/v1/events/${FOCUS_EVENT[locale]}$`));
        await page.goto(`/events/${FOCUS_EVENT[locale]}`);
        await expect(page.locator(".skeleton-page")).toBeVisible();
        await assertPinnedFonts(page);
        const columns = () => page.locator(".content-grid > *").evaluateAll((panels) => panels.map((panel) => {
          const box = panel.getBoundingClientRect();
          return { left: box.left, width: box.width };
        }));
        const before = { back: await top(page, ".skeleton-back"), eyebrow: await top(page, ".skeleton-eyebrow"), h1: await top(page, ".skeleton-h1"), columns: await columns() };
        release();
        await expect(page.locator(".event-description")).toBeVisible();
        const after = { back: await top(page, ".back-link"), eyebrow: await top(page, ".page-heading .eyebrow"), h1: await top(page, ".page-heading h1"), columns: await columns() };
        near(after.back.top, before.back.top);
        near(after.eyebrow.top, before.eyebrow.top);
        // A long category name wraps the eyebrow onto more lines; the heading moves down by exactly that much.
        near(after.h1.top - before.h1.top, after.eyebrow.height - before.eyebrow.height);
        expect(after.columns).toEqual(before.columns);
      });
    });
  }

  test.describe(`loading ${width} en`, () => {
    test("Discover: a filter change keeps the cards in place, dimmed and busy, until the new ones arrive", async ({ page }) => {
      await setUp(page, width);
      await page.goto("/discover");
      await expect(page.locator(REAL_CARD).first()).toBeVisible();
      await assertPinnedFonts(page);
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
      // The dim eases in after a short delay; wait for it to settle.
      await expect(grid).toHaveCSS("opacity", "0.5");
      expect(await grid.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
      near(await gap(), before);
      release();
      await expect(grid).not.toHaveAttribute("aria-busy");
      await expect(grid).toHaveCSS("opacity", "1");
    });
  });
}

test("skeleton shimmer overlay paints only the content box of a padded shape", async ({ page }) => {
  await setUp(page, 390);
  await hold(page, /^\/api\/v1\/events$/);
  await page.goto("/discover");
  await expect(page.locator(".skeleton-eyebrow").first()).toBeVisible();
  const overlay = await page.locator(".skeleton-eyebrow").first().evaluate((shape) => {
    const style = getComputedStyle(shape, "::after");
    return { clip: style.backgroundClip, padding: style.paddingTop, shapePadding: getComputedStyle(shape).paddingTop };
  });
  expect(overlay.clip).toBe("content-box");
  expect(overlay.padding).toBe(overlay.shapePadding);
  expect(parseFloat(overlay.padding)).toBeGreaterThan(0);
});
