import { expect, test, type Page } from "@playwright/test";
import { FOCUS_EVENT, LOCALES, MANY_EVENTS_CATEGORY, NOW, type Locale } from "./fixtures";
import { mockApi, type MockedApi, type Role } from "./mockApi";

const VIEWPORTS = {
  narrow: { width: 320, height: 640 },
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
} as const;
type ViewportName = keyof typeof VIEWPORTS;

// Browser language per UI language, so native controls and Accept-Language follow it.
const BROWSER_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", kk: "kk-KZ" };

interface PageCase {
  name: string;
  role: Role;
  path: (locale: Locale) => string;
  /** Present once the page has finished loading its data. */
  ready: string;
  /** Drives the page into the state to measure (runs once `ready` is visible). */
  prepare?: (page: Page) => Promise<void>;
  /** Viewports to run at; all of them when omitted. */
  viewports?: ViewportName[];
}

// One line per page. Add a page here and it runs at every width in every language.
const PAGES: PageCase[] = [
  { name: "discover-visitor", role: "visitor", path: () => "/discover", ready: ".event-card" },
  // Active filters: "More filters" is open on a phone and its summary counts them.
  { name: "discover-filtered", role: "visitor", path: () => "/discover?city=Almaty&when=weekend&min_price=1000&max_price=50000", ready: ".event-card" },
  { name: "discover-empty", role: "visitor", path: () => "/discover?q=zzzz-no-match&city=Almaty", ready: ".empty-state" },
  { name: "discover-load-more", role: "visitor", path: () => `/discover?category=${MANY_EVENTS_CATEGORY}`, ready: ".load-more" },
  { name: "discover-admin", role: "admin", path: () => "/discover", ready: ".event-card" },
  { name: "event-admin", role: "admin", path: (locale) => `/events/${FOCUS_EVENT[locale]}`, ready: ".event-description" },
  {
    name: "checkout-hold",
    role: "admin",
    path: (locale) => `/events/${FOCUS_EVENT[locale]}`,
    ready: ".ticket-option",
    // Reserve the paid ticket: the step list (three steps) and the countdown appear.
    prepare: async (page) => {
      await page.locator(".ticket-option", { has: page.locator(".qty-field") }).last().locator("select").selectOption("1");
      await page.locator(".form-actions .primary-button").click();
      await expect(page.locator(".checkout-progress .countdown")).toBeVisible();
    },
    viewports: ["narrow", "phone"],
  },
  { name: "organizer-event-admin", role: "admin", path: (locale) => `/organizer/events/${FOCUS_EVENT[locale]}`, ready: "[role=tabpanel]" },
];

// Problems that open defects cause today, each with the task that fixes it.
const TOP_BAR = "Task 10 (top bar)";
const TAB_BAR = "Task 11 (tab bar labels)";
type Expected = [pattern: RegExp, task: string];
const PAGE_SCROLL: Expected = [/^page scrolls horizontally/, TOP_BAR];
const ACTIONS_EDGE: Expected = [/^div\.topbar-actions .* spans \d+\.\.\d+ of \d+$/, TOP_BAR];
const SIGN_IN_EDGE: Expected = [/^a\.primary-button .* spans \d+\.\.\d+ of \d+$/, TOP_BAR];
const AVATAR_EDGE: Expected = [/^(details\.avatar-menu|summary|span\.avatar) .* spans \d+\.\.\d+ of \d+$/, TOP_BAR];
const TOP_TAB_EDGE: Expected = [/^a\.top-tab .* spans \d+\.\.\d+ of \d+$/, TOP_BAR];
const TOP_TAB_OVERLAP: Expected = [/^a\.top-tab .* overlaps the top bar actions$/, TOP_BAR];
// The language select is 16px on phones (iOS zoom), which widens the actions further.
const BADGE_EDGE: Expected = [/^span\.notification-badge .* spans \d+\.\.\d+ of \d+$/, TOP_BAR];
const TAB_LABEL_SPILL: Expected = [/^a\.tab-bar-link .* text spills out of its box$/, TAB_BAR];
const TAB_LABEL_EDGE: Expected = [/^a\.tab-bar-link .* text spans \d+\.\.\d+ of \d+$/, TAB_BAR];
const TAB_LABEL_OVERLAP: Expected = [/^a\.tab-bar-link .* labels overlap$/, TAB_BAR];

const VISITOR_PAGES = ["discover-visitor", "discover-filtered", "discover-empty", "discover-load-more"];
const ADMIN_PAGES = ["discover-admin", "event-admin", "checkout-hold", "organizer-event-admin"];
const KNOWN_ROWS: Array<{ pages: string[]; viewport: ViewportName; locale: Locale; expected: Expected[] }> = [
  { pages: VISITOR_PAGES, viewport: "narrow", locale: "en", expected: [PAGE_SCROLL, ACTIONS_EDGE, SIGN_IN_EDGE] },
  { pages: VISITOR_PAGES, viewport: "narrow", locale: "ru", expected: [PAGE_SCROLL, ACTIONS_EDGE, SIGN_IN_EDGE] },
  { pages: VISITOR_PAGES, viewport: "narrow", locale: "kk", expected: [PAGE_SCROLL, ACTIONS_EDGE, SIGN_IN_EDGE] },
  { pages: ADMIN_PAGES, viewport: "narrow", locale: "en", expected: [PAGE_SCROLL, ACTIONS_EDGE, AVATAR_EDGE, TAB_LABEL_SPILL, TAB_LABEL_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "narrow", locale: "ru", expected: [PAGE_SCROLL, ACTIONS_EDGE, AVATAR_EDGE, TAB_LABEL_SPILL, TAB_LABEL_EDGE, TAB_LABEL_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "narrow", locale: "kk", expected: [PAGE_SCROLL, ACTIONS_EDGE, AVATAR_EDGE, TAB_LABEL_SPILL, TAB_LABEL_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "phone", locale: "ru", expected: [TAB_LABEL_SPILL, TAB_LABEL_EDGE, TAB_LABEL_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "phone", locale: "kk", expected: [TAB_LABEL_SPILL, TAB_LABEL_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "tablet", locale: "en", expected: [TOP_TAB_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "tablet", locale: "ru", expected: [PAGE_SCROLL, TOP_TAB_EDGE, TOP_TAB_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "tablet", locale: "kk", expected: [PAGE_SCROLL, TOP_TAB_EDGE, TOP_TAB_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "laptop", locale: "ru", expected: [TOP_TAB_OVERLAP] },
  { pages: ADMIN_PAGES, viewport: "laptop", locale: "kk", expected: [TOP_TAB_OVERLAP] },
];

// Cases whose layout is broken today by a defect another task fixes. Everything else in
// such a case is still checked: a problem matching no entry fails the case, and so does
// an entry that no longer occurs (the fix landed: delete it).
// Key: `${page} ${viewport} ${locale}`.
const KNOWN_FAILURES = new Map<string, Expected[]>();
for (const row of KNOWN_ROWS) {
  for (const page of row.pages) KNOWN_FAILURES.set(`${page} ${row.viewport} ${row.locale}`, row.expected);
}
const GENERATED = new Set<string>();

const NAV_LINKS = { visitor: 1, admin: 6 } as const;

// Text widths depend on the font, and the app's font stack falls back to whatever the
// machine has (Inter here, DejaVu Sans on a CI runner). Pin the same installed fonts
// everywhere so a case gives the same answer on every machine. CI installs them
// (fonts-dejavu-core); the stylesheet below overrides the tokens in web/src/styles/tokens.css.
const PINNED_FONTS = `html:root { --font-sans: "DejaVu Sans"; --font-serif: "DejaVu Serif"; }`;

async function openPage(page: Page, pageCase: PageCase, locale: Locale, mocked: MockedApi, pageErrors: string[]) {
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
  try {
    await page.goto(pageCase.path(locale));
    await expect(page.locator(pageCase.ready).first()).toBeVisible();
    await expect(page.locator(".loading-state")).toHaveCount(0);
    await expect(page.locator(".top-tabs a")).toHaveCount(NAV_LINKS[pageCase.role]);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await pageCase.prepare?.(page);
    await page.evaluate(() => document.fonts.ready);
  } catch (failure) {
    if (mocked.unmocked.length === 0 && pageErrors.length === 0) throw failure;
    const details = [
      mocked.unmocked.length ? `API calls without a fixture: ${mocked.unmocked.join(", ")}` : "",
      pageErrors.length ? `page errors: ${pageErrors.join(" | ")}` : "",
    ].filter(Boolean);
    throw new Error(`Page did not load; ${details.join("; ")}`, { cause: failure });
  }
  // A missing pinned font would silently change every text width.
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

// Runs in the browser, so it sees the real rendered boxes. Returns one line per problem.
function measureLayout(): string[] {
  const problems: string[] = [];
  const width = window.innerWidth;
  const TOLERANCE = 0.5;

  const describe = (element: Element) => {
    const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
    const name = (element.getAttribute("class") ?? "").split(" ")[0];
    return `${element.tagName.toLowerCase()}${name ? `.${name}` : ""}${text ? ` "${text}"` : ""}`;
  };

  interface Box { left: number; right: number; top: number; bottom: number }
  // The part of a box that an ancestor with its own overflow handling (a scrollable
  // strip, a clipped label) actually shows.
  const clipped = (element: Element, box: Box, includeSelf = false): Box | null => {
    let result = box;
    for (let parent: Element | null = includeSelf ? element : element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX === "visible") continue;
      const outer = parent.getBoundingClientRect();
      result = {
        left: Math.max(result.left, outer.left),
        right: Math.min(result.right, outer.right),
        top: result.top,
        bottom: result.bottom,
      };
      if (result.right - result.left <= 0) return null;
    }
    return result;
  };
  const rendered = (element: Element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    // Content of a closed menu (<details>) is not shown, though it keeps a box.
    const menu = element.closest("details:not([open])");
    if (menu && !element.closest("summary") && element !== menu) return null;
    if (element.closest(".visually-hidden") || style.visibility === "hidden" || style.display === "none") return null;
    if (box.width <= 0 || box.height <= 0) return null;
    return clipped(element, box);
  };
  const overlaps = (a: Box, b: Box) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

  // Boxes of the text an element draws (a text node can overflow its box): its own text
  // nodes, or with `deep` those of its descendants too. Menu options are not drawn inline.
  const textBoxes = (element: Element, deep = false): Box[] => {
    const boxes: Box[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent ?? "").trim()) continue;
      const parent = node.parentElement;
      if (!parent || (!deep && parent !== element)) continue;
      if (!rendered(parent) || parent.closest("option, select")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const shown = clipped(parent, rect, true);
        if (shown) boxes.push(shown);
      }
    }
    return boxes;
  };

  // Discover filters: every control stays inside the viewport and none covers another.
  const controls = [...document.querySelectorAll(".discover-filters :is(input, select, button, summary)")]
    .map((control) => ({ control, box: rendered(control) }))
    .filter((entry): entry is { control: Element; box: Box } => entry.box !== null);
  controls.forEach(({ control, box }, index) => {
    if (box.right > width + TOLERANCE || box.left < -TOLERANCE) {
      problems.push(`filter ${describe(control)} spans ${Math.round(box.left)}..${Math.round(box.right)} of ${width}`);
    }
    for (const other of controls.slice(index + 1)) {
      if (overlaps(box, other.box)) problems.push(`filter ${describe(control)} overlaps ${describe(other.control)}`);
    }
  });

  // A select's chosen option must fit beside the arrow, or its text is cut off.
  const SELECT_ARROW = 22;
  const canvas = document.createElement("canvas").getContext("2d");
  for (const select of document.querySelectorAll<HTMLSelectElement>(".discover-filters select")) {
    if (!canvas || !rendered(select)) continue;
    const style = getComputedStyle(select);
    canvas.font = style.font;
    const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - SELECT_ARROW;
    const shown = select.selectedOptions[0]?.textContent ?? "";
    if (canvas.measureText(shown).width > room) problems.push(`filter ${describe(select)} cuts off "${shown}" (${Math.round(canvas.measureText(shown).width)} > ${Math.round(room)})`);
  }

  const scroll = document.documentElement.scrollWidth;
  if (scroll > width) problems.push(`page scrolls horizontally: scrollWidth ${scroll} > innerWidth ${width}`);

  for (const bar of document.querySelectorAll(".topbar, .tab-bar, .checkout-progress")) {
    for (const element of [bar, ...bar.querySelectorAll("*")]) {
      const box = rendered(element);
      if (!box) continue;
      if (box.right > width + TOLERANCE || box.left < -TOLERANCE) {
        problems.push(`${describe(element)} spans ${Math.round(box.left)}..${Math.round(box.right)} of ${width}`);
      }
      // Text spilling out of its own box, or out of the viewport.
      const own = element.getBoundingClientRect();
      for (const text of textBoxes(element)) {
        if (text.right > width + TOLERANCE || text.left < -TOLERANCE) {
          problems.push(`${describe(element)} text spans ${Math.round(text.left)}..${Math.round(text.right)} of ${width}`);
        } else if (getComputedStyle(element).overflowX === "visible" && (text.right > own.right + 1 || text.left < own.left - 1)) {
          problems.push(`${describe(element)} text spills out of its box`);
        }
      }
    }
  }

  // Page content outside the bars: reported separately from the top bar problems, so a
  // known top bar overflow cannot hide a new one in the page itself.
  for (const element of document.body.querySelectorAll("*")) {
    if (element.closest(".topbar, .tab-bar, .skip-link")) continue;
    const box = rendered(element);
    if (box && (box.right > width + TOLERANCE || box.left < -TOLERANCE)) {
      problems.push(`content ${describe(element)} spans ${Math.round(box.left)}..${Math.round(box.right)} of ${width}`);
    }
    // Text running out of a block, so a known "page scrolls" row cannot hide it.
    for (const text of textBoxes(element)) {
      if (text.right > width + TOLERANCE || text.left < -TOLERANCE) {
        problems.push(`content ${describe(element)} text spans ${Math.round(text.left)}..${Math.round(text.right)} of ${width}`);
      }
    }
  }

  // The checkout step list and countdown must not run into each other, and a
  // one-word step label must not break inside the word.
  for (const row of document.querySelectorAll(".checkout-progress")) {
    const list = row.querySelector(".checkout-steps");
    const timer = row.querySelector(".countdown");
    const listBox = list && rendered(list);
    const timerBox = timer && rendered(timer);
    if (listBox && timerBox && overlaps(listBox, timerBox)) problems.push("checkout steps overlap the countdown");
    const steps = [...row.querySelectorAll(".checkout-step")].map((step) => ({ step, box: rendered(step) }));
    steps.forEach(({ step, box }, index) => {
      for (const other of steps.slice(index + 1)) {
        if (box && other.box && overlaps(box, other.box)) problems.push(`${describe(step)} and ${describe(other.step)} overlap`);
      }
      const label = step.querySelector(".checkout-step-label");
      const lines = label ? new Set(textBoxes(label).map((line) => Math.round(line.top))).size : 0;
      if (label && !/\s/.test(label.textContent!.trim()) && lines > 1) problems.push(`${describe(label)} breaks inside the word`);
    });
  }

  // Labels of sibling tabs must not run into each other.
  for (const selector of [".tab-bar-link", ".top-tab"]) {
    const links = [...document.querySelectorAll(selector)].filter((link) => rendered(link));
    links.forEach((link, index) => {
      for (const other of links.slice(index + 1)) {
        if (textBoxes(link, true).some((a) => textBoxes(other, true).some((b) => overlaps(a, b)))) {
          problems.push(`${describe(link)} and ${describe(other)} labels overlap`);
        }
      }
    });
  }

  const actions = document.querySelector(".topbar-actions");
  const area = actions && rendered(actions);
  if (area) {
    for (const tab of document.querySelectorAll(".top-tab")) {
      const box = rendered(tab);
      if (box && overlaps(box, area)) problems.push(`${describe(tab)} overlaps the top bar actions`);
    }
  }
  return problems;
}

// iOS Safari zooms the page when a field under 16px gets focus. Runs in the browser.
function smallFields(): string[] {
  return [...document.querySelectorAll("input, select, textarea")]
    .filter((field) => {
      const box = field.getBoundingClientRect();
      const style = getComputedStyle(field);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none"
        && !(field instanceof HTMLInputElement && ["checkbox", "radio", "hidden"].includes(field.type));
    })
    .map((field) => ({ field, size: parseFloat(getComputedStyle(field).fontSize) }))
    .filter(({ size }) => size < 16)
    .map(({ field, size }) => `${field.tagName.toLowerCase()}${field.className ? `.${String(field.className).split(" ")[0]}` : ""} ${size}px`);
}

for (const [viewportName, size] of Object.entries(VIEWPORTS) as Array<[ViewportName, (typeof VIEWPORTS)[ViewportName]]>) {
  for (const locale of LOCALES) {
    test.describe(`${viewportName} ${locale}`, () => {
      test.use({ viewport: size, locale: BROWSER_LOCALE[locale] });

      for (const pageCase of PAGES.filter((item) => !item.viewports || item.viewports.includes(viewportName))) {
        const key = `${pageCase.name} ${viewportName} ${locale}`;
        GENERATED.add(key);
        test(key, async ({ page }, testInfo) => {
          const mocked = await mockApi(page, pageCase.role, locale);
          const pageErrors: string[] = [];
          page.on("pageerror", (error) => pageErrors.push(error.message));

          await openPage(page, pageCase, locale, mocked, pageErrors);
          const problems = await page.evaluate(measureLayout);
          if (size.width === VIEWPORTS.phone.width) {
            expect(await page.evaluate(smallFields), "fields under 16px zoom the page on iOS").toEqual([]);
          }

          // Saved under test-results/ (and uploaded by CI). The full-page shot shows all
          // content; the viewport shot shows the fixed tab bar where it really sits.
          for (const [name, fullPage] of [["full-page", true], ["viewport", false]] as const) {
            const file = testInfo.outputPath(`${name}.png`);
            await page.screenshot({ path: file, fullPage });
            await testInfo.attach(name, { path: file, contentType: "image/png" });
          }

          expect(mocked.unmocked, "API calls without a fixture").toEqual([]);
          expect(pageErrors, "uncaught page errors").toEqual([]);

          const known = KNOWN_FAILURES.get(key);
          if (!known) {
            expect(problems, "layout problems").toEqual([]);
            return;
          }
          const unexpected = problems.filter((problem) => !known.some(([pattern]) => pattern.test(problem)));
          expect(unexpected, "layout problems beyond the known ones").toEqual([]);
          for (const [pattern, task] of known) {
            expect(
              problems.some((problem) => pattern.test(problem)),
              `${pattern} no longer occurs: ${task} fixed it, delete this expectation from KNOWN_FAILURES`,
            ).toBe(true);
          }
        });
      }
    });
  }
}

// A renamed page, width or language must not silently turn a known row into a no-op.
for (const key of KNOWN_FAILURES.keys()) {
  if (!GENERATED.has(key)) throw new Error(`KNOWN_FAILURES has "${key}", which matches no generated case`);
}
