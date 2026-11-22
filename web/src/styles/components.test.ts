// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Block = { file: string; context: string[]; selector: string; body: string };

// Stylesheets in cascade order, as index.css imports them.
const files = [...readFileSync("src/styles/index.css", "utf8").matchAll(/@import\s+"\.\/([\w-]+\.css)"/g)].map((match) => match[1]!);

/** Every rule with the at-rule preludes around it (@media, @supports, @starting-style). */
function blocks(file: string): Block[] {
  const source = readFileSync(`src/styles/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Block[] = [];
  const walk = (text: string, context: string[]) => {
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
      if (/^@(media|supports|starting-style)\b/.test(prelude)) walk(inner, [...context, prelude]);
      else found.push({ file, context, selector: prelude, body: inner });
      index = close;
    }
  };
  walk(source, []);
  return found;
}

const all = files.flatMap((file) => blocks(file));
const selectorsOf = (block: Block) => block.selector.split(",").map((part) => part.trim());
const value = (body: string, property: string) => body.match(new RegExp(`(?<![-\\w])${property}\\s*:\\s*([^;]+)`))?.[1]?.trim();
const hoverOnly = (block: Block) => block.context.some((c) => /\(hover:\s*hover\)/.test(c));
const reducedMotion = (block: Block) => block.context.some((c) => /prefers-reduced-motion/.test(c));

/** Unconditional rules (no @media or @supports around them) that list this exact selector. */
const base = (selector: string) => all.filter((block) => block.context.length === 0 && selectorsOf(block).includes(selector));
/** The last unconditional value of a property for a selector, as the cascade would pick it. */
const declared = (selector: string, property: string) =>
  base(selector)
    .map((block) => value(block.body, property))
    .filter((found): found is string => found !== undefined)
    .at(-1);
/** Rules with a selector part that starts with `prefix` (e.g. ".primary-button:active"). */
const startingWith = (prefix: string, list = all) =>
  list.filter((block) => selectorsOf(block).some((part) => part === prefix || part.startsWith(prefix + ":") || part.startsWith(prefix + "[") || part.startsWith(prefix + " ")));

describe("buttons", () => {
  it("never lift on hover: Apple buttons change colour, not position", () => {
    const offenders = all
      .filter((block) => selectorsOf(block).some((part) => /\.(primary|subtle|text)-button:hover/.test(part)))
      .filter((block) => /(?<![-\w])transform\s*:/.test(block.body))
      .map((block) => `${block.file}: ${block.selector}`);
    expect(offenders).toEqual([]);
  });

  // The transition lives on the element's base rule (a linked card takes it from .event-card).
  it.each([
    [".primary-button", "scale(.97)", ".primary-button"],
    [".subtle-button", "scale(.97)", ".subtle-button"],
    [".event-card-linked", "scale(.98)", ".event-card"],
  ])("%s presses down with %s over --dur-press", (selector, scale, owner) => {
    const pressed = startingWith(`${selector}:active`).filter((block) => !reducedMotion(block));
    expect(pressed.map((block) => value(block.body, "transform")), selector).toContain(scale);
    expect(declared(owner, "transition"), owner).toMatch(/(?:^|,\s*)transform var\(--dur-press\) var\(--ease-out\)/);
  });

  it("primary is a filled green button that darkens on hover", () => {
    expect(declared(".primary-button", "background")).toBe("var(--green)");
    expect(declared(".primary-button", "color")).toBe("var(--on-green)");
    expect(declared(".primary-button", "border-radius")).toBe("var(--radius-button)");
    expect(declared(".primary-button", "font-weight")).toBe("600");
    expect(declared(".primary-button", "letter-spacing")).toBe("var(--track-panel)");
    const hover = all.filter(hoverOnly).filter((block) => selectorsOf(block).some((part) => part.startsWith(".primary-button:hover")));
    expect(hover.map((block) => value(block.body, "background"))).toContain("var(--green-dark)");
  });

  it("subtle is a grey fill without a border, in dark green", () => {
    expect(declared(".subtle-button", "background")).toBe("var(--fill)");
    expect(declared(".subtle-button", "border")).toMatch(/^(0|none)$/);
    expect(declared(".subtle-button", "color")).toBe("var(--green-dark)");
    expect(declared(".subtle-button", "border-radius")).toBe("var(--radius-button)");
    const hover = all.filter(hoverOnly).filter((block) => selectorsOf(block).some((part) => part.startsWith(".subtle-button:hover")));
    expect(hover.map((block) => value(block.body, "background"))).toContain("var(--fill-strong)");
  });

  it("danger keeps its own tokens on the subtle shape", () => {
    expect(declared(".danger-button", "color")).toBe("var(--danger)");
    expect(declared(".danger-button", "border")).toBe("1px solid var(--danger-line)");
    expect(declared(".danger-button", "background")).toBe("var(--paper)");
    const hover = all.filter(hoverOnly).filter((block) => selectorsOf(block).some((part) => part.startsWith(".danger-button:hover")));
    expect(hover.map((block) => value(block.body, "background"))).toContain("var(--danger-surface)");
  });

  it("text buttons dim on press instead of scaling", () => {
    expect(declared(".text-button", "color")).toBe("var(--green)");
    expect(declared(".text-button", "font-weight")).toBe("600");
    expect(declared(".text-button", "transition")).toMatch(/opacity var\(--dur-press\) var\(--ease-out\)/);
    const pressed = startingWith(".text-button:active");
    expect(pressed.map((block) => value(block.body, "opacity"))).toContain(".55");
    for (const block of pressed) expect(value(block.body, "transform"), block.selector).toBeUndefined();
  });
});

describe("fields", () => {
  it.each([".field input:not([type=\"checkbox\"])", ".field select", ".qty-field select", ".search-box"])("%s has the input radius and a 1px input-line edge", (selector) => {
    expect(declared(selector, "border-radius"), selector).toBe("var(--radius-input)");
    expect(declared(selector, "border"), selector).toBe("1px solid var(--input-line)");
  });
});

// Cards and panels lost their border: a hairline ring keeps their edge and a soft shadow lifts them.
const RAISED = "0 0 0 0.5px var(--separator), var(--shadow-raised)";

describe("cards and panels", () => {
  it.each([".event-card", ".panel"])("%s is borderless with a separator ring and the raised shadow", (selector) => {
    expect(declared(selector, "border"), selector).toMatch(/^(0|none)$/);
    expect(declared(selector, "border-radius"), selector).toBe("var(--radius-panel)");
    expect(declared(selector, "box-shadow"), selector).toBe(RAISED);
    // Forced colours drop box-shadow: a transparent outline turns into a visible edge there.
    expect(declared(selector, "outline"), selector).toBe("1px solid transparent");
    expect(declared(selector, "outline-offset"), selector).toBe("-1px");
  });

  it("no card or panel rule brings a border colour back", () => {
    const offenders = all
      .filter((block) => !block.context.some((c) => /print|forced-colors|prefers-contrast/.test(c)))
      .filter((block) => selectorsOf(block).some((part) => /^\.(event-card|skeleton-card|panel)(:hover)?$/.test(part)))
      .filter((block) => /(?<![-\w])border(-color)?\s*:(?!\s*(0|none)\s*(;|$))/.test(block.body))
      .map((block) => `${block.file}: ${block.selector}`);
    expect(offenders).toEqual([]);
  });

  it("a linked card deepens its shadow on hover without moving", () => {
    const hover = all.filter(hoverOnly).filter((block) => selectorsOf(block).includes(".event-card-linked:hover"));
    expect(hover.map((block) => value(block.body, "box-shadow"))).toContain("0 0 0 0.5px var(--separator), var(--shadow-lift)");
    for (const block of hover) expect(value(block.body, "transform"), block.selector).toBeUndefined();
    expect(declared(".event-card", "transition")).toBe("transform var(--dur-press) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)");
  });

  it("the card title is display type at card tracking and leading", () => {
    expect(declared(".event-card h3", "font-family")).toBe("var(--font-display)");
    expect(declared(".event-card h3", "font-size")).toBe("var(--text-card-title)");
    expect(declared(".event-card h3", "font-weight")).toBe("600");
    expect(declared(".event-card h3", "letter-spacing")).toBe("var(--track-card)");
    expect(declared(".event-card h3", "line-height")).toBe("var(--leading-card)");
  });

  it("event art clips the cover to the card's corners", () => {
    expect(declared(".event-card", "overflow")).toBe("hidden");
    expect(declared(".event-card-art", "border-radius")).toBeUndefined();
  });

  it("panel headings are panel-title size, semibold, with panel tracking", () => {
    expect(declared(".panel-heading h2", "font-size")).toBe("var(--text-panel-title)");
    expect(declared(".panel-heading h2", "font-weight")).toBe("600");
    expect(declared(".panel-heading h2", "letter-spacing")).toBe("var(--track-panel)");
  });
});

describe("grouped lists", () => {
  const HAIRLINE = "0.5px solid var(--separator)";

  it("tickets and orders sit in one paper container with the panel radius", () => {
    expect(declared(".event-grid.row-grid", "gap")).toBe("0");
    expect(declared(".event-grid.row-grid", "background")).toBe("var(--paper)");
    expect(declared(".event-grid.row-grid", "border-radius")).toBe("var(--radius-panel)");
    expect(declared(".event-grid.row-grid", "box-shadow")).toBe(RAISED);
    // Rows inside it are flat: the container is the only surface.
    expect(declared(".row-grid > .event-card", "box-shadow")).toBe("none");
    expect(declared(".row-grid > .event-card", "background")).toBe("transparent");
  });

  // Each separator is a hairline that starts where the row's content starts and runs to the trailing edge.
  it.each([
    [".row-grid > .event-card + .event-card::before", "14px"],
    [".card-list > .event-card + .event-card::before", "0"],
    [".list-row + .list-row::before", "0"],
    [".notification-list > li + li::before", "8px"],
    [".image-row + .image-row::before", "8px"],
    [".ticket-option + .ticket-option::before", "0"],
    [".timeline li + li::before", "0"],
  ])("%s is a hairline inset by %s", (selector, inset) => {
    expect(declared(selector, "border-top"), selector).toBe(HAIRLINE);
    expect(declared(selector, "left"), selector).toBe(inset);
    expect(declared(selector, "right"), selector).toBe("0");
  });

  it("rows draw no borders of their own", () => {
    const rows = /^(\.list-row|\.list-row:first-child|\.notification-list > li \+ li|\.notification-row|\.image-row|\.ticket-option|\.timeline li|\.timeline li:first-child|\.card-list > \.event-card|\.row-grid > \.event-card)$/;
    const offenders = all
      .filter((block) => !block.context.some((c) => /print/.test(c)))
      .filter((block) => selectorsOf(block).some((part) => rows.test(part)))
      .filter((block) => /(?<![-\w])border(-top|-bottom)?\s*:(?!\s*(0|none)\s*(;|$))/.test(block.body))
      .map((block) => `${block.file}: ${block.selector}`);
    expect(offenders).toEqual([]);
  });

  it("a linked row highlights instead of scaling inside its group", () => {
    const pressed = startingWith(".row-grid > .event-card-linked:active");
    expect(pressed.map((block) => value(block.body, "transform"))).toContain("none");
    expect(pressed.map((block) => value(block.body, "background"))).toContain("var(--hover-surface)");
    const hover = all.filter(hoverOnly).filter((block) => selectorsOf(block).includes(".row-grid > .event-card-linked:hover"));
    expect(hover.map((block) => value(block.body, "box-shadow"))).toContain("none");
    expect(hover.map((block) => value(block.body, "background"))).toContain("var(--hover-surface)");
    // The highlight lights at once on pointer-down and fades out on release.
    expect(pressed.map((block) => value(block.body, "transition-duration"))).toContain("0s");
    expect(declared(".row-grid > .event-card", "transition")).toMatch(/background-color var\(--dur-fast\)/);
  });

  it("row titles are list headlines, smaller than a card title", () => {
    for (const selector of [".row-grid > .event-card h3", ".card-list > .event-card h3"]) {
      expect(declared(selector, "font-size"), selector).toBe("var(--text-panel-title)");
      expect(declared(selector, "letter-spacing"), selector).toBe("var(--track-panel)");
    }
  });

  it("the tickets and orders group is capped so row actions stay near their titles", () => {
    expect(declared(".event-grid.row-grid", "max-width")).toBe("780px");
  });
});

describe("edges for more contrast and forced colours", () => {
  const within = (pattern: RegExp, selector: string) => all.filter((block) => block.context.some((c) => pattern.test(c)) && selectorsOf(block).includes(selector));

  it.each([".panel", ".event-card", ".event-grid.row-grid"])("%s draws a 1px input-line ring with more contrast", (selector) => {
    const rules = within(/prefers-contrast:\s*more/, selector);
    expect(rules.map((block) => value(block.body, "box-shadow")), selector).toContain("0 0 0 1px var(--input-line), var(--shadow-raised)");
  });

  it("grouped rows stay flat with more contrast: the container carries the ring", () => {
    for (const selector of [".row-grid > .event-card", ".card-list > .event-card"]) {
      expect(within(/prefers-contrast:\s*more/, selector).map((block) => value(block.body, "box-shadow")), selector).toContain("none");
    }
  });

  it("a subtle button gets an edge with more contrast and in forced colours, where its fill alone would vanish", () => {
    expect(within(/prefers-contrast:\s*more/, ".subtle-button").map((block) => value(block.body, "box-shadow"))).toContain("inset 0 0 0 1px var(--input-line)");
    // No colour named: the border takes the forced text colour.
    expect(within(/forced-colors:\s*active/, ".subtle-button").map((block) => value(block.body, "border"))).toContain("1px solid");
  });
});

describe("status pills", () => {
  it.each([".status", ".support-role"])("%s is a pill in semibold micro type with micro tracking", (selector) => {
    expect(declared(selector, "border-radius"), selector).toBe("var(--radius-pill)");
    expect(declared(selector, "font-weight"), selector).toBe("600");
    expect(declared(selector, "letter-spacing"), selector).toBe("var(--track-micro)");
  });
});

describe("type", () => {
  it.each([".event-card h3", ".event-card-art span", ".stat-value", ".organizer-note h2", ".printable-ticket-copy h2", ".entry-code"])("%s uses the display face", (selector) => {
    expect(declared(selector, "font-family"), selector).toBe("var(--font-display)");
    expect(declared(selector, "letter-spacing"), selector).toBeDefined();
  });

  it("keeps the serif for the brand mark, .serif and the sign-in story only", () => {
    const allowed = (part: string) => part === ".brand-mark" || part === ".serif" || /^\.(auth-story|story-)/.test(part);
    const offenders = all
      .filter((block) => /var\(--font-serif\)/.test(value(block.body, "font-family") ?? ""))
      .filter((block) => !selectorsOf(block).every(allowed))
      .map((block) => `${block.file}: ${block.selector}`);
    expect(offenders).toEqual([]);
  });
});

describe("large title", () => {
  it("drops to 1.5rem at 320px so long kk words fit, and keeps the 34px maximum", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");
    expect(tokens).toMatch(/--text-title:\s*clamp\(1\.75rem,[^;]*2\.125rem\);/);
    const narrow = tokens.match(/@media \(width < 390px\)\s*\{\s*:root\s*\{\s*--text-title:\s*clamp\(([^;]*)\);/)?.[1];
    expect(narrow, "a narrow-phone --text-title").toBeDefined();
    const [floor, preferred, ceiling] = narrow!.split(/,\s*/);
    expect(floor).toBe("1.5rem");
    expect(ceiling).toBe("1.75rem");
    // The preferred size is 24px at 320 and meets the default 28px floor at 390, so nothing jumps.
    const at = (width: number) => {
      const vw = Number(preferred!.match(/([\d.]+)vw/)![1]);
      const rem = Number(preferred!.match(/([\d.]+)rem/)![1]);
      return (vw * width) / 100 + rem * 16;
    };
    expect(at(320)).toBeCloseTo(24, 0);
    expect(at(390)).toBeCloseTo(28, 0);
  });
});

describe("radii come from tokens", () => {
  it("no stylesheet outside tokens.css sets a raw border-radius above 2px", () => {
    const offenders: string[] = [];
    for (const file of files.filter((name) => name !== "tokens.css")) {
      const source = readFileSync(`src/styles/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of source.matchAll(/(?<![-\w])(border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)) {
        // A concentric radius derived from a token (the token minus the padding inside it) is allowed.
        const raw = match[2]!.replace(/calc\([^()]*var\(--radius-[\w-]+\)[^()]*\)/g, "");
        for (const length of raw.matchAll(/(\d*\.?\d+)px/g)) {
          if (Number(length[1]) > 2) offenders.push(`${file}: ${match[1]}: ${match[2]!.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the brand mark's shaped corner is a token", () => {
    expect(declared(".brand-mark", "border-radius")).toBe("var(--radius-brand)");
    expect(readFileSync("src/styles/tokens.css", "utf8")).toMatch(/--radius-brand:\s*10px 10px 10px 3px;/);
  });
});
