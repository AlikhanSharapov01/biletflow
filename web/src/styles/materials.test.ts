// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Block = { file: string; order: number; context: string[]; selector: string; body: string };

// Stylesheets in cascade order, as index.css imports them.
const files = [...readFileSync("src/styles/index.css", "utf8").matchAll(/@import\s+"\.\/([\w-]+\.css)"/g)].map((match) => match[1]!);

/** Every rule with the at-rule preludes around it (@media, @supports, @starting-style), in cascade order. */
function blocks(file: string, fileIndex: number): Block[] {
  const source = readFileSync(`src/styles/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Block[] = [];
  const walk = (text: string, context: string[], base: number) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      if (open === -1) break;
      let depth = 1;
      let close = open + 1;
      while (close < text.length && depth > 0) {
        if (text[close] === "{") depth++;
        else if (text[close] === "}") depth--;
        close++;
      }
      const prelude = text.slice(index, open).trim();
      const inner = text.slice(open + 1, close - 1);
      if (/^@(media|supports|starting-style)\b/.test(prelude)) walk(inner, [...context, prelude], base + open + 1);
      else found.push({ file, order: fileIndex * 1e6 + base + open, context, selector: prelude, body: inner });
      index = close;
    }
  };
  walk(source, [], 0);
  return found;
}

const all = files.flatMap((file, index) => blocks(file, index));
const selectorsOf = (block: Block) => block.selector.split(",").map((part) => part.trim());
const value = (body: string, property: string) => body.match(new RegExp(`(?<![-\\w])${property}\\s*:\\s*([^;]+)`))?.[1]?.trim();
const background = (body: string) => value(body, "background") ?? value(body, "background-color");

const FALLBACK = {
  unsupported: (context: string) => /^@supports not\b/.test(context) && context.includes("backdrop-filter"),
  transparency: (context: string) => /prefers-reduced-transparency:\s*reduce/.test(context),
  contrast: (context: string) => /prefers-contrast:\s*more/.test(context),
};
const isFallback = (block: Block) => block.context.some((c) => Object.values(FALLBACK).some((test) => test(c)));

// Blurring rules that are not chrome, with the reason:
//   .story-ticket  decorative glass card on the opaque sign-in story panel. Its light text is tested over the
//                  unblurred panel and art (contrast.test.ts), so it reads without the blur, and a light solid
//                  fallback would hide that text.
const NOT_CHROME = [".story-ticket"];

// Rules that blur what is behind them: the translucent materials.
const blurring = all.filter((block) => {
  const blur = value(block.body, "backdrop-filter");
  return blur !== undefined && blur !== "none" && !isFallback(block);
});
const materials = blurring.filter((block) => !NOT_CHROME.includes(block.selector));

/** Fallback rules for one material selector, declared after it so they win the cascade. */
const fallbacks = (selector: string, material: Block, kind: keyof typeof FALLBACK) =>
  all.filter((block) => block.order > material.order && block.context.some(FALLBACK[kind]) && selectorsOf(block).includes(selector));

describe("translucent materials", () => {
  it("covers the top bar, tab bar, sticky Get tickets bar, avatar menu and toast", () => {
    const selectors = materials.flatMap(selectorsOf);
    for (const expected of [/^\.topbar(::before)?$/, /^\.tab-bar$/, /^\.get-tickets-bar$/, /^\.avatar-menu-panel$/, /^\.toast$/]) {
      expect(selectors.some((selector) => expected.test(selector)), `${expected} has a material`).toBe(true);
    }
    for (const material of materials) {
      expect(value(material.body, "backdrop-filter"), material.selector).toBe("var(--material-blur)");
      expect(value(material.body, "-webkit-backdrop-filter"), `${material.selector} needs the -webkit- prefix`).toBe("var(--material-blur)");
      expect(background(material.body), material.selector).toMatch(/^var\(--material-(chrome|thick)\)$/);
    }
  });

  it("keeps the exemptions to real rules", () => {
    for (const selector of NOT_CHROME) expect(blurring.some((block) => block.selector === selector), selector).toBe(true);
  });

  it("falls back to the solid material where backdrop-filter is unsupported", () => {
    for (const material of materials) {
      for (const selector of selectorsOf(material)) {
        const rules = fallbacks(selector, material, "unsupported");
        expect(rules.map((rule) => background(rule.body)), `${material.file}: ${selector}`).toContain("var(--material-solid)");
      }
    }
  });

  it("turns solid and unblurred with reduced transparency", () => {
    for (const material of materials) {
      for (const selector of selectorsOf(material)) {
        const rule = fallbacks(selector, material, "transparency").find((candidate) => background(candidate.body) === "var(--material-solid)");
        expect(rule, `${material.file}: ${selector}`).toBeDefined();
        expect(value(rule!.body, "backdrop-filter"), selector).toBe("none");
        expect(value(rule!.body, "-webkit-backdrop-filter"), selector).toBe("none");
      }
    }
  });

  it("turns solid with a 1px input-line edge with more contrast", () => {
    for (const material of materials) {
      for (const selector of selectorsOf(material)) {
        const rule = fallbacks(selector, material, "contrast").find((candidate) => /^var\(--(material-solid|paper)\)$/.test(background(candidate.body) ?? ""));
        expect(rule, `${material.file}: ${selector}`).toBeDefined();
        expect(value(rule!.body, "backdrop-filter"), selector).toBe("none");
        expect(rule!.body, selector).toMatch(/border(-top|-bottom)?\s*:\s*1px solid var\(--input-line\)/);
      }
    }
  });

  it("separates the bars with a hairline instead of a border", () => {
    const bar = (selector: string) => materials.find((block) => selectorsOf(block).some((part) => part.startsWith(selector)))!;
    expect(value(bar(".topbar").body, "box-shadow")).toBe("0 0.5px 0 var(--separator)");
    expect(value(bar(".tab-bar").body, "box-shadow")).toBe("0 -0.5px 0 var(--separator)");
    expect(value(bar(".get-tickets-bar").body, "box-shadow")).toBe("0 -0.5px 0 var(--separator)");
    for (const selector of [".topbar", ".tab-bar", ".get-tickets-bar"]) {
      const rules = all.filter((block) => !isFallback(block) && selectorsOf(block).includes(selector));
      for (const rule of rules) expect(rule.body, selector).not.toMatch(/border(-top|-bottom)?\s*:\s*1px solid var\(--line\)/);
    }
  });
});

describe("forced colours", () => {
  // Forced colours drop box-shadow, which draws every chrome edge here; a transparent outline turns into a
  // visible system-colour line there and is invisible otherwise, without changing the layout.
  it("gives every chrome surface a transparent outline", () => {
    for (const selector of [".topbar::before", ".tab-bar", ".get-tickets-bar", ".avatar-menu-panel", ".action-dialog", ".toast"]) {
      const rule = all.find((block) => !isFallback(block) && selectorsOf(block).includes(selector) && value(block.body, "outline") !== undefined);
      expect(rule, selector).toBeDefined();
      expect(value(rule!.body, "outline"), selector).toBe("1px solid transparent");
      expect(value(rule!.body, "outline-offset"), selector).toBe("-1px");
    }
  });
});

describe("chrome motion", () => {
  it("never transitions all", () => {
    const offenders = all.filter((block) => /(?<![-\w])transition(-property)?\s*:[^;]*\ball\b/.test(block.body)).map((block) => `${block.file}: ${block.selector}`);
    expect(offenders).toEqual([]);
  });

  it("dialogs enter and leave on one path, as a bottom sheet on phones", () => {
    const dialog = all.find((block) => block.selector === ".action-dialog" && block.context.length === 0)!;
    expect(dialog.body).not.toMatch(/var\(--green\)/);
    expect(value(dialog.body, "border-radius")).toBe("var(--radius-menu)");
    expect(value(dialog.body, "box-shadow")).toBe("var(--shadow)");
    expect(value(dialog.body, "transition")).toMatch(/display var\(--dur-base\) var\(--ease-out\) allow-discrete/);
    expect(value(dialog.body, "transition")).toMatch(/overlay var\(--dur-base\) var\(--ease-out\) allow-discrete/);
    const starting = all.filter((block) => block.context.some((c) => c.startsWith("@starting-style")));
    const enter = starting.find((block) => block.selector === ".action-dialog[open]" && !block.context.some((c) => c.startsWith("@media")))!;
    const exit = all.find((block) => block.selector === ".action-dialog:not([open])" && block.context.length === 0)!;
    for (const state of [enter, exit]) {
      expect(value(state.body, "opacity")).toBe("0");
      expect(value(state.body, "transform")).toBe("scale(.96)");
    }
    expect(starting.some((block) => block.selector === ".action-dialog[open]::backdrop" && value(block.body, "opacity") === "0")).toBe(true);
    const backdropExit = all.find((block) => block.selector === ".action-dialog:not([open])::backdrop" && block.context.length === 0)!;
    expect(value(backdropExit.body, "opacity")).toBe("0");
    const sheet = (selector: string, list = all) => list.find((block) => block.selector === selector && block.context.some((c) => /max-width:\s*760px/.test(c)))!;
    expect(value(sheet(".action-dialog").body, "width")).toBe("100%");
    expect(value(sheet(".action-dialog").body, "padding-bottom")).toBe("max(var(--panel-pad), env(safe-area-inset-bottom))");
    expect(value(sheet(".action-dialog").body, "transition-duration")).toBe("var(--dur-spring)");
    expect(value(sheet(".action-dialog").body, "transition-timing-function")).toBe("var(--ease-spring)");
    expect(value(sheet(".action-dialog:not([open])").body, "transform")).toBe("translateY(100%)");
    expect(value(sheet(".action-dialog[open]", starting).body, "transform")).toBe("translateY(100%)");
    // The scrim leaves with the sheet, not before it.
    expect(value(sheet(".action-dialog::backdrop").body, "transition-duration")).toBe("var(--dur-spring)");
  });

  it("the avatar menu materializes from its trigger", () => {
    const panel = materials.find((block) => block.selector === ".avatar-menu-panel")!;
    expect(value(panel.body, "transform-origin")).toBe("top right");
    expect(value(panel.body, "border-radius")).toBe("var(--radius-menu)");
    expect(value(panel.body, "box-shadow")).toBe("var(--shadow-menu)");
    const enter = all.find((block) => block.context.some((c) => c.startsWith("@starting-style")) && block.selector === ".avatar-menu[open] .avatar-menu-panel")!;
    expect(value(enter.body, "opacity")).toBe("0");
    expect(value(enter.body, "transform")).toBe("scale(.96)");
    // It leaves on the path it came in by.
    const exit = all.find((block) => block.context.length === 0 && block.selector === ".avatar-menu:not([open]) .avatar-menu-panel")!;
    for (const property of ["opacity", "transform"]) expect(value(exit.body, property), property).toBe(value(enter.body, property));
  });

  it("reduced motion turns every added movement into a cross-fade", () => {
    const reduced = blocks("base.css", files.indexOf("base.css")).filter((block) => block.context.some((c) => /prefers-reduced-motion:\s*reduce/.test(c)));
    const still = reduced.filter((block) => /transform\s*:\s*none\s*!important/.test(block.body)).flatMap(selectorsOf);
    for (const selector of [".tab-bar-link:active .tab-bar-icon", ".action-dialog", ".avatar-menu-panel", ".toast"]) expect(still, selector).toContain(selector);
    // The surfaces keep a short opacity fade instead of the global near-zero transition.
    const fading = reduced.filter((block) => /transition-duration\s*:\s*var\(--dur-fast\)\s*!important/.test(block.body)).flatMap(selectorsOf);
    for (const selector of [".action-dialog", ".action-dialog::backdrop", ".avatar-menu-panel", ".toast"]) expect(fading, selector).toContain(selector);
  });
});
