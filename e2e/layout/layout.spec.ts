import { expect, test, type Page } from "@playwright/test";
import { FOCUS_EVENT, FREE_EVENT, LOCALES, MANY_EVENTS_CATEGORY, SALES_ENDED_EVENT, SOLD_OUT_EVENT, type Locale } from "./fixtures";
import { assertPinnedFonts, prepare } from "./harness";
import { mockApi, type MockedApi, type Role } from "./mockApi";

const VIEWPORTS = {
  narrow: { width: 320, height: 640 },
  // 344 is a foldable's cover screen; six sections still need three Kazakh lines there.
  fold: { width: 344, height: 700 },
  // 360 is the most common Android phone width; the admin case has six tab bar sections.
  compact: { width: 360, height: 740 },
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  // 375 is a common phone; 1025 is the first width with the top tabs instead of the bottom
  // tab bar, 1100 and 1280 sit inside and at the end of the tight 1025-1279 range.
  small: { width: 375, height: 667 },
  aboveTabBar: { width: 1025, height: 768 },
  // A landscape phone: the sticky bar is not shown (500px tall or less). Only cases that name it run here.
  landscape: { width: 844, height: 390 },
  wide: { width: 1100, height: 800 },
  desktopMin: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
} as const;
type ViewportName = keyof typeof VIEWPORTS;

// Browser language per UI language, so native controls and Accept-Language follow it.
const BROWSER_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", kk: "kk-KZ" };

// A card with real content; skeleton cards share the .event-card class.
const REAL_CARD = ".event-card:not(.skeleton-card)";

interface PageCase {
  name: string;
  role: Role;
  path: (locale: Locale) => string;
  /** Present once the page has finished loading its data. */
  ready: string;
  /** Drives the page into the state to measure (runs once `ready` is visible). */
  prepare?: (page: Page) => Promise<void>;
  /** The sticky "Get tickets" bar is checked: present up to 960px (and over 500px tall), absent above. */
  stickyBar?: boolean;
  /** Nothing can be bought on this page: neither the sticky bar nor its spacer is rendered. */
  noStickyBar?: boolean;
  /** The offer is a free label, not an amount. */
  freeOffer?: boolean;
  /** Viewports to run at; all of them when omitted. */
  viewports?: ViewportName[];
}

// One line per page. Add a page here and it runs at every width in every language.
// Widths the sticky bar is checked at: 320, 360 and 390 phones, a tablet, and a laptop where it is absent.
const OPT_IN_VIEWPORTS: ViewportName[] = ["landscape"];
const STICKY_VIEWPORTS: ViewportName[] = ["narrow", "compact", "phone", "tablet", "laptop"];

const PAGES: PageCase[] = [
  { name: "discover-visitor", role: "visitor", path: () => "/discover", ready: REAL_CARD },
  // Active filters: "More filters" is open on a phone and its summary counts them.
  { name: "discover-filtered", role: "visitor", path: () => "/discover?city=Almaty&when=weekend&min_price=1000&max_price=50000", ready: REAL_CARD },
  { name: "discover-empty", role: "visitor", path: () => "/discover?q=zzzz-no-match&city=Almaty", ready: ".empty-state" },
  { name: "discover-load-more", role: "visitor", path: () => `/discover?category=${MANY_EVENTS_CATEGORY}`, ready: ".load-more" },
  { name: "discover-member", role: "member", path: () => "/discover", ready: REAL_CARD },
  { name: "discover-admin", role: "admin", path: () => "/discover", ready: REAL_CARD },
  { name: "event-admin", role: "admin", path: (locale) => `/events/${FOCUS_EVENT[locale]}`, ready: ".event-description", stickyBar: true },
  { name: "event-visitor", role: "visitor", path: (locale) => `/events/${FOCUS_EVENT[locale]}`, ready: ".event-description", stickyBar: true, viewports: STICKY_VIEWPORTS },
  { name: "event-member", role: "member", path: (locale) => `/events/${FOCUS_EVENT[locale]}`, ready: ".event-description", stickyBar: true, viewports: [...STICKY_VIEWPORTS, "landscape"] },
  // A free event: the bar's free label and a buyable free ticket row.
  { name: "event-free", role: "visitor", path: () => `/events/${FREE_EVENT}`, ready: ".event-description", stickyBar: true, freeOffer: true, viewports: ["phone"] },
  // Nothing to buy: no bar and no spacer under it.
  { name: "event-sold-out", role: "visitor", path: () => `/events/${SOLD_OUT_EVENT}`, ready: ".event-description", noStickyBar: true, viewports: STICKY_VIEWPORTS },
  { name: "event-sales-ended", role: "member", path: () => `/events/${SALES_ENDED_EVENT}`, ready: ".event-description", noStickyBar: true, viewports: STICKY_VIEWPORTS },
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
  { name: "organizer-check-ins-admin", role: "admin", path: (locale) => `/organizer/events/${FOCUS_EVENT[locale]}?tab=check-ins`, ready: "[role=tabpanel] .data-table" },
  { name: "organizer-staff-admin", role: "admin", path: (locale) => `/organizer/events/${FOCUS_EVENT[locale]}?tab=staff`, ready: "#event-section-panel .stack, #event-section-panel form" },
  { name: "organizer-finance-admin", role: "admin", path: (locale) => `/organizer/events/${FOCUS_EVENT[locale]}?tab=finance`, ready: "#event-section-panel .stat, #event-section-panel dl, #event-section-panel .panel" },
];

// Problems that open defects cause today, each with the task that fixes it. Add a row to
// KNOWN_ROWS only for a defect another task owns; delete it when that task lands.
type Expected = [pattern: RegExp, task: string];
const KNOWN_ROWS: Array<{ pages: string[]; viewport: ViewportName; locale: Locale; expected: Expected[] }> = [];

// Cases whose layout is broken today by a defect another task fixes. Everything else in
// such a case is still checked: a problem matching no entry fails the case, and so does
// an entry that no longer occurs (the fix landed: delete it).
// Key: `${page} ${viewport} ${locale}`.
const KNOWN_FAILURES = new Map<string, Expected[]>();
for (const row of KNOWN_ROWS) {
  for (const page of row.pages) KNOWN_FAILURES.set(`${page} ${row.viewport} ${row.locale}`, row.expected);
}
const GENERATED = new Set<string>();

const NAV_LINKS = { visitor: 1, member: 5, admin: 6 } as const;

async function openPage(page: Page, pageCase: PageCase, locale: Locale, mocked: MockedApi, pageErrors: string[]) {
  await prepare(page, locale);
  try {
    await page.goto(pageCase.path(locale));
    await expect(page.locator(pageCase.ready).first()).toBeVisible();
    await expect(page.locator(".loading-state")).toHaveCount(0);
    // Placeholders are not the page: wait until none is left.
    await expect(page.locator(".skeleton-card, .skeleton-page, [aria-busy=true]")).toHaveCount(0);
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
  await assertPinnedFonts(page);
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

  // Top bar children stay inside the bar's padded content box, so the right gutter
  // matches the left one.
  const inner = document.querySelector(".topbar-inner");
  if (inner) {
    const style = getComputedStyle(inner);
    const box = inner.getBoundingClientRect();
    const left = box.left + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.paddingRight);
    for (const child of inner.querySelectorAll(".brand, .topbar-actions > *")) {
      const rect = rendered(child);
      if (rect && (rect.right > right + TOLERANCE || rect.left < left - TOLERANCE)) {
        problems.push(`${describe(child)} leaves the top bar content box ${Math.round(left)}..${Math.round(right)}: ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
  }
  // A top tab must end inside the tab strip.
  const strip = document.querySelector(".top-tabs");
  const stripBox = strip && rendered(strip);
  if (stripBox) {
    for (const tab of document.querySelectorAll(".top-tab")) {
      const box = tab.getBoundingClientRect();
      if (box.right > stripBox.right + TOLERANCE) problems.push(`${describe(tab)} runs past the end of the tab strip`);
    }
  }
  // Navigation switches at 1024/1025: bottom tab bar up to 1024, top tabs above.
  const bar = document.querySelector(".tab-bar");
  if (bar && document.querySelectorAll(".top-tab").length > 0) {
    const barShown = getComputedStyle(bar).display !== "none";
    const tabsShown = getComputedStyle(document.querySelector(".top-tabs")!).display !== "none";
    if (width <= 1024 && (!barShown || tabsShown)) problems.push(`navigation at ${width}px: bottom tab bar expected, not top tabs`);
    if (width >= 1025 && (barShown || !tabsShown)) problems.push(`navigation at ${width}px: top tabs expected, not the bottom tab bar`);
  }

  // Tab bar labels: inside their link, at most two lines (three only at 320 with six
  // sections), broken only at soft hyphens or spaces, no line shorter than three letters,
  // and every link and the bar at their designed size whatever the language.
  const SOFT_HYPHEN = "\u00ad";
  const tabBar = document.querySelector(".tab-bar");
  const tabBarShown = tabBar && rendered(tabBar);
  (window as unknown as { tabLabelLines: string[] }).tabLabelLines = [];
  const links = [...document.querySelectorAll(".tab-bar-link")].filter((link) => rendered(link));
  for (const link of links) {
    if (link.scrollWidth > link.clientWidth) problems.push(`${describe(link)} label overflows its link: ${link.scrollWidth} > ${link.clientWidth}`);
    const minHeight = parseFloat(getComputedStyle(link).minHeight);
    const height = link.getBoundingClientRect().height;
    if (!Number.isFinite(minHeight)) problems.push(`${describe(link)} has no pixel min-height`);
    else if (Math.abs(height - minHeight) > TOLERANCE) problems.push(`${describe(link)} is ${Math.round(height)}px tall, expected ${minHeight}px`);
    const label = link.querySelector(".tab-bar-label");
    const node = label?.firstChild;
    if (!label || !node || node.nodeType !== Node.TEXT_NODE) continue;
    if (label.scrollWidth > label.clientWidth) problems.push(`${describe(label)} label is wider than its box: ${label.scrollWidth} > ${label.clientWidth}`);
    const text = node.textContent ?? "";
    if (!text) continue;
    const lines: string[] = [];
    let lastTop: number | null = null;
    let previous = -1;
    for (let index = 0; index < text.length; index++) {
      if (text.charAt(index) === SOFT_HYPHEN || /\s/.test(text.charAt(index))) continue;
      const range = document.createRange();
      // The line a character sits on is where the text up to and including it ends.
      range.setStart(node, 0);
      range.setEnd(node, index + 1);
      const rects = range.getClientRects();
      const top = rects[rects.length - 1]!.top;
      // Glyphs of one line differ by a pixel or two; the next line is a line height lower.
      if (lastTop === null || top - lastTop > 5) {
        if (lastTop !== null && previous >= 0 && !/[\s\u00ad-]/.test(text.slice(previous + 1, index) + (text[previous] === "-" ? "-" : ""))) {
          problems.push(`${describe(label)} breaks inside a word without a hyphenation point`);
        }
        lines.push("");
        lastTop = top;
      }
      lines[lines.length - 1] += text.charAt(index);
      previous = index;
    }
    (window as unknown as { tabLabelLines: string[] }).tabLabelLines.push(`${lines.join("/")}`);
    if (lines.length > 3 || (lines.length === 3 && !(width < 360 && links.length === 6))) problems.push(`${describe(label)} label wraps to ${lines.length} lines`);
    if (lines.length > 1) {
      for (const line of lines) if (line.length < 3) problems.push(`${describe(label)} has a ${line.length}-letter line "${line}"`);
    }
  }
  if (tabBarShown) {
    const style = getComputedStyle(tabBar);
    // The token is a calc() expression: let the browser resolve it on a probe element.
    const probe = document.body.appendChild(document.createElement("div"));
    probe.style.cssText = "position: absolute; visibility: hidden; height: var(--tab-bar-height)";
    const resolved = probe.getBoundingClientRect().height;
    const expected = resolved + parseFloat(style.borderTopWidth);
    probe.remove();
    const actual = tabBar.getBoundingClientRect().height;
    if (!(resolved > 0)) problems.push("tab bar height token --tab-bar-height is missing or does not resolve to a length");
    else if (Math.abs(actual - expected) > TOLERANCE) problems.push(`tab bar is ${actual}px tall, expected ${expected}px`);
  }
  for (const link of document.querySelectorAll(".tab-bar-link")) {
    const box = rendered(link);
    if (box && (box.right - box.left < 44 || box.bottom - box.top < 44)) problems.push(`${describe(link)} is smaller than 44x44`);
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

  // The selected tab of a scrolling tab row must be fully visible, not scrolled out of sight.
  for (const tab of document.querySelectorAll('[role="tab"][aria-selected="true"]')) {
    const row = tab.closest('[role="tablist"]');
    if (!row) continue;
    const box = tab.getBoundingClientRect();
    const view = row.getBoundingClientRect();
    if (box.left < view.left - TOLERANCE || box.right > view.right + TOLERANCE) {
      problems.push(`${describe(tab)} selected tab is not fully inside its tab row (${Math.round(box.left)}..${Math.round(box.right)} in ${Math.round(view.left)}..${Math.round(view.right)})`);
    }
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

// The sticky "Get tickets" bar sits on the tab bar (or the bottom edge without one), shows the
// whole offer, and the page's last content can scroll clear of it. Runs in the browser, scrolled to the end.
function stickyBarProblems(freeOffer: boolean): string[] {
  const problems: string[] = [];
  const bar = document.querySelector(".get-tickets-bar");
  if (!bar) return ["no Get tickets bar"];
  const shown = getComputedStyle(bar).display !== "none";
  if (window.innerWidth > 960 || window.innerHeight <= 500) {
    if (shown) problems.push("Get tickets bar shows where it should not (over 960px wide or 500px tall or less)");
    const hiddenSpacer = document.querySelector(".get-tickets-spacer");
    if (hiddenSpacer && getComputedStyle(hiddenSpacer).display !== "none") problems.push("Get tickets spacer takes room where the bar is not shown");
    // Only the tab bar (if any) and the usual 16px keep focused controls clear: nothing for the absent bar.
    const tabs = document.querySelector(".tab-bar");
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0;
    const allowed = (tabs ? tabs.getBoundingClientRect().height : 0) + 16 + 1;
    if (padding > allowed) problems.push(`scroll padding at the bottom is ${padding}px, more than the tab bar and 16px (${allowed - 1}px)`);
    return problems;
  }
  if (!shown) return ["Get tickets bar is not shown up to 960px"];
  const box = bar.getBoundingClientRect();
  const tabBar = document.querySelector(".tab-bar");
  const floor = tabBar ? tabBar.getBoundingClientRect().top : window.innerHeight;
  if (Math.abs(box.bottom - floor) > 1) problems.push(`bar bottom ${Math.round(box.bottom)} is not on the ${tabBar ? "tab bar" : "bottom edge"} at ${Math.round(floor)}`);
  if (box.left < 0 || box.right > window.innerWidth) problems.push(`bar spans ${Math.round(box.left)}..${Math.round(box.right)}`);
  const button = bar.querySelector("button")!.getBoundingClientRect();
  if (button.height < 44 || button.right > box.right || button.left < box.left) problems.push("bar button is under 44px tall or leaves the bar");
  const offer = bar.querySelector(".get-tickets-offer")!;
  const offerBox = offer.getBoundingClientRect();
  const sideBySide = offerBox.top < button.bottom && button.top < offerBox.bottom;
  if (sideBySide && offerBox.right > button.left + 1) problems.push("offer text runs into the button");
  if (!sideBySide && offerBox.bottom > button.top + 1) problems.push("offer text overlaps the button below it");
  if (offer.scrollHeight > offer.clientHeight + 1 || offer.scrollWidth > offer.clientWidth + 1) problems.push("offer text is cut off");
  if (offerBox.left < box.left || offerBox.right > box.right) problems.push("offer text leaves the bar");
  // The amount (digits and the tenge sign) stays on one visual line, never cut.
  const text = offer.firstChild;
  const content = offer.textContent ?? "";
  const amount = /\d[\d\s\u00a0\u202f.,]*₸|₸[\s\u00a0\u202f]*\d[\d\s\u00a0\u202f.,]*\d/.exec(content);
  if (freeOffer) {
    if (/\d|₸/.test(content)) problems.push(`free offer "${content}" shows an amount`);
  } else if (!text || !amount) problems.push(`offer "${content}" shows no amount with the ₸ sign`);
  else {
    const range = document.createRange();
    range.setStart(text, amount.index);
    range.setEnd(text, amount.index + amount[0].length);
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    if (tops.size > 1) problems.push(`the amount "${amount[0]}" breaks over ${tops.size} lines`);
  }
  const spacer = document.querySelector(".get-tickets-spacer");
  if (!spacer || Math.abs(spacer.getBoundingClientRect().height - box.height) > 1) problems.push(`the spacer is ${Math.round(spacer?.getBoundingClientRect().height ?? 0)}px for a ${Math.round(box.height)}px bar`);
  const last = [...document.querySelector(".page")!.children].filter((child) => !child.classList.contains("get-tickets-bar") && !child.classList.contains("get-tickets-spacer")).at(-1)!;
  const lastBottom = last.getBoundingClientRect().bottom;
  if (lastBottom > box.top + 1) problems.push(`the page's last content ends at ${Math.round(lastBottom)}, under the bar at ${Math.round(box.top)}`);
  return problems;
}

// Nothing can be bought: no bar and no spacer in the page.
function noStickyBarProblems(): string[] {
  return [".get-tickets-bar", ".get-tickets-spacer"].filter((selector) => document.querySelector(selector)).map((selector) => `${selector} is rendered on a page with nothing to buy`);
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

      for (const pageCase of PAGES.filter((item) => (item.viewports ? item.viewports.includes(viewportName) : !OPT_IN_VIEWPORTS.includes(viewportName)))) {
        const key = `${pageCase.name} ${viewportName} ${locale}`;
        GENERATED.add(key);
        test(key, async ({ page }, testInfo) => {
          const mocked = await mockApi(page, pageCase.role, locale);
          const pageErrors: string[] = [];
          page.on("pageerror", (error) => pageErrors.push(error.message));

          await openPage(page, pageCase, locale, mocked, pageErrors);
          const problems = await page.evaluate(measureLayout);
          if (process.env.LAYOUT_TRACE) console.log(`TRACE ${key} ${(await page.evaluate(() => (window as unknown as { tabLabelLines?: string[] }).tabLabelLines ?? [])).join(" | ")}`);

          // Saved under test-results/ (and uploaded by CI). The full-page shot shows all
          // content; the viewport shot shows the fixed tab bar where it really sits.
          for (const [name, fullPage] of [["full-page", true], ["viewport", false]] as const) {
            const file = testInfo.outputPath(`${name}.png`);
            await page.screenshot({ path: file, fullPage });
            await testInfo.attach(name, { path: file, contentType: "image/png" });
          }

          if (pageCase.stickyBar) {
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            // Where the tickets section is on screen the bar slides away; measure it in its shown
            // position, as it appears whenever the section scrolls out of view.
            await page.addStyleTag({ content: ".get-tickets-bar { transition: none !important; transform: none !important; visibility: visible !important; opacity: 1 !important; }" });
            expect(await page.evaluate(stickyBarProblems, pageCase.freeOffer ?? false), "sticky Get tickets bar").toEqual([]);
          }

          if (pageCase.noStickyBar) expect(await page.evaluate(noStickyBarProblems), "no sticky Get tickets bar").toEqual([]);

          const fields = viewportName === "phone" ? await page.evaluate(smallFields) : [];
          expect(mocked.unmocked, "API calls without a fixture").toEqual([]);
          expect(pageErrors, "uncaught page errors").toEqual([]);

          expect(fields, "fields under 16px zoom the page on iOS").toEqual([]);

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
