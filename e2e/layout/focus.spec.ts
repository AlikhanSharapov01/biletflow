import { expect, test, type Page } from "@playwright/test";
import { FOCUS_EVENT, MANY_EVENTS_CATEGORY } from "./fixtures";
import { prepare } from "./harness";
import { mockApi, type Role } from "./mockApi";

// A keyboard user's focus survives an async action: it lands on a named, visible element,
// never on <body>. Mocked API, keyboard input only.

const WIDTHS = [390, 1440];

async function open(page: Page, width: number, role: Role, path: string, ready: string) {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page, "en");
  const mocked = await mockApi(page, role, "en");
  await page.goto(path);
  await expect(page.locator(ready).first()).toBeVisible();
  await expect(page.locator(".skeleton-card, .skeleton-page, .loading-state")).toHaveCount(0);
  return mocked;
}

/** Describes document.activeElement; runs in the browser. */
function activeElementState() {
  const element = document.activeElement;
  if (!element || element === document.body || element === document.documentElement) return { problem: "focus is on the page body" };
  const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const name = (element.getAttribute("aria-label") || labelledBy || element.textContent || (element as HTMLInputElement).placeholder || "").trim();
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (!name) return { problem: `${element.tagName.toLowerCase()} has no accessible name` };
  if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || style.display === "none") return { problem: `${element.tagName.toLowerCase()} "${name}" is not visible` };
  if (element.closest(".visually-hidden")) return { problem: `${element.tagName.toLowerCase()} "${name}" is visually hidden` };
  return { problem: "", tag: element.tagName.toLowerCase(), id: element.id, className: String(element.className), name, inCard: Boolean(element.closest(".event-card")) };
}

for (const width of WIDTHS) {
  test.describe(`focus retention ${width}`, () => {
    test("keyboard Load more on Discover leaves focus on a card link", async ({ page }) => {
      await open(page, width, "visitor", `/discover?category=${MANY_EVENTS_CATEGORY}`, ".load-more");
      const before = await page.locator(".event-card:not(.skeleton-card)").count();
      await page.locator(".load-more button").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".event-card:not(.skeleton-card)")).not.toHaveCount(before);
      await expect.poll(() => page.evaluate(activeElementState), "focus moves into the new cards").toMatchObject({ problem: "", tag: "a", inCard: true });
    });

    test("applying a promo code with Enter keeps the field focused", async ({ page }) => {
      await open(page, width, "member", `/events/${FOCUS_EVENT.en}`, ".promo-field input");
      const input = page.locator(".promo-field input");
      await input.focus();
      await page.keyboard.type("SPRING10");
      await page.keyboard.press("Enter");
      await expect(page.locator(".promo-note.success")).toBeVisible();
      await expect(input).toBeFocused();
    });

    test("a checkout step change leaves focus on a named, visible element", async ({ page }) => {
      await open(page, width, "admin", `/events/${FOCUS_EVENT.en}`, ".ticket-option");
      // Pick the paid ticket's quantity and reserve it, all from the keyboard.
      const quantity = page.locator(".ticket-option", { has: page.locator(".qty-field") }).last().locator("select");
      await quantity.focus();
      await page.keyboard.press("ArrowDown");
      await expect(quantity).not.toHaveValue("0");
      await page.locator(".form-actions .primary-button").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".checkout-progress .countdown")).toBeVisible();
      await expect.poll(async () => (await page.evaluate(activeElementState)).problem).toBe("");
      // The Task 3 contract: focus is on the current step of the indicator.
      await expect(page.locator('.checkout-steps li[aria-current="step"]')).toBeFocused();
      await expect(page.locator('.checkout-steps li[aria-current="step"]')).toHaveAttribute("aria-label", /\d/);
    });
  });
}
