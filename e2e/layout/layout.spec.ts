import { expect, test, type Page } from "@playwright/test";
import { FOCUS_EVENT, LOCALES, type Locale } from "./fixtures";
import { mockApi, type Role } from "./mockApi";

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

interface PageCase {
  name: string;
  role: Role;
  path: (locale: Locale) => string;
  /** Present once the page has finished loading its data. */
  ready: string;
}

// One line per page. Add a page here and it runs at every width in every language.
const PAGES: PageCase[] = [
  { name: "discover-visitor", role: "visitor", path: () => "/discover", ready: ".event-card" },
  { name: "discover-admin", role: "admin", path: () => "/discover", ready: ".event-card" },
  { name: "event-admin", role: "admin", path: (locale) => `/events/${FOCUS_EVENT[locale]}`, ready: ".event-description" },
  { name: "organizer-event-admin", role: "admin", path: (locale) => `/organizer/events/${FOCUS_EVENT[locale]}`, ready: "[role=tabpanel]" },
];

// Cases that fail today because of a layout defect another task fixes. They are
// marked test.fail(): the suite stays green now and turns red when the fix lands,
// which is the reminder to delete the entry. Key: `${page} ${viewport} ${locale}`.
const KNOWN_FAILURES = new Map<string, string>();

// Task 10 (top bar): with six sections the top tabs run into the actions at 768px
// (and past the viewport in Russian and Kazakh), so the page also scrolls sideways.
for (const pageCase of PAGES.filter((item) => item.role === "admin")) {
  for (const locale of LOCALES) {
    KNOWN_FAILURES.set(`${pageCase.name} tablet ${locale}`, "top bar overflows at 768px with six sections; fixed by Task 10");
  }
}

const NAV_LINKS = { visitor: 1, admin: 6 } as const;

async function openPage(page: Page, pageCase: PageCase, locale: Locale) {
  const mocked = await mockApi(page, pageCase.role, locale);
  // The app picks its language from this stored preference (web/src/i18n/index.ts);
  // a signed-in profile's own locale takes over once it loads.
  await page.addInitScript((value) => localStorage.setItem("biletflow:locale", value), locale);
  await page.goto(pageCase.path(locale));
  await expect(page.locator(pageCase.ready).first()).toBeVisible();
  await expect(page.locator(".loading-state")).toHaveCount(0);
  await expect(page.locator(".top-tabs a")).toHaveCount(NAV_LINKS[pageCase.role]);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await page.evaluate(() => document.fonts.ready);
  return mocked;
}

// Everything measured in the browser, so the checks see the real rendered boxes.
function measureLayout() {
  const viewport = document.documentElement.clientWidth;
  const problems: string[] = [];
  const describe = (element: Element) => {
    const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
    return `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}${text ? ` "${text}"` : ""}`;
  };
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const hidden = element.closest(".visually-hidden") !== null;
    return !hidden && box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  const scroll = document.documentElement.scrollWidth;
  if (scroll > window.innerWidth) problems.push(`page scrolls horizontally: scrollWidth ${scroll} > innerWidth ${window.innerWidth}`);

  for (const bar of document.querySelectorAll(".topbar, .tab-bar")) {
    for (const element of [bar, ...bar.querySelectorAll("*")]) {
      if (!visible(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.right > viewport + 0.5 || box.left < -0.5) {
        problems.push(`${describe(element)} spans ${Math.round(box.left)}..${Math.round(box.right)} of ${viewport}`);
      }
    }
  }

  const actions = document.querySelector(".topbar-actions");
  if (actions && visible(actions)) {
    const area = actions.getBoundingClientRect();
    for (const tab of document.querySelectorAll(".top-tab")) {
      if (!visible(tab)) continue;
      const box = tab.getBoundingClientRect();
      if (box.left < area.right && box.right > area.left && box.top < area.bottom && box.bottom > area.top) {
        problems.push(`${describe(tab)} overlaps the top bar actions`);
      }
    }
  }
  return problems;
}

for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(viewportName, () => {
    test.use({ viewport: size });

    for (const pageCase of PAGES) {
      for (const locale of LOCALES) {
        const key = `${pageCase.name} ${viewportName} ${locale}`;
        test(key, async ({ page }, testInfo) => {
          const reason = KNOWN_FAILURES.get(key);
          if (reason) test.fail(true, reason);

          const mocked = await openPage(page, pageCase, locale);
          const problems = await page.evaluate(measureLayout);

          await testInfo.attach("full-page", {
            body: await page.screenshot({ fullPage: true }),
            contentType: "image/png",
          });
          expect(mocked.unmocked, "API calls without a fixture").toEqual([]);
          expect(problems, "layout problems").toEqual([]);
        });
      }
    }
  });
}
