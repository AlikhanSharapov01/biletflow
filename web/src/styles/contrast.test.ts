// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/tokens.css", "utf8");

// ---- Token parser: hex (#rgb, #rrggbb, #rrggbbaa), rgb()/rgba() with alpha, var() aliases.
type Rgba = { r: number; g: number; b: number; a: number };
const declarations = new Map<string, string>();
for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) declarations.set(name!, value!.trim());

function parseColour(value: string, token: string, depth = 0): Rgba {
  if (depth > 8) throw new Error(`Token ${token} aliases too deeply`);
  const alias = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (alias) {
    const target = declarations.get(alias[1]!);
    if (target === undefined) throw new Error(`${token} aliases missing token ${alias[1]}`);
    return parseColour(target, alias[1]!, depth + 1);
  }
  const hex = value.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex && [3, 6, 8].includes(hex.length)) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    const channel = (index: number) => parseInt(full.slice(index, index + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? channel(6) / 255 : 1 };
  }
  const functional = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/i);
  if (functional) {
    const alpha = functional[4] === undefined ? 1 : functional[5] ? Number(functional[4]) / 100 : Number(functional[4]);
    return { r: Number(functional[1]), g: Number(functional[2]), b: Number(functional[3]), a: alpha };
  }
  throw new Error(`Token ${token} is not a colour this test can read: ${value}`);
}

function colourOf(token: string): Rgba {
  const value = declarations.get(`--${token}`);
  if (value === undefined) throw new Error(`Missing colour token ${token}`);
  return parseColour(value, token);
}

/** Layers listed top to bottom, e.g. ["glass", "green-story"] is the glass over the story panel. */
function flatten(layers: string[]): Rgba {
  const base = colourOf(layers[layers.length - 1]!);
  if (base.a !== 1) throw new Error(`${layers[layers.length - 1]} must be opaque to be a base surface`);
  return layers.slice(0, -1).reduceRight<Rgba>((under, name) => {
    const top = colourOf(name);
    return { r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 };
  }, base);
}

function luminance({ r, g, b }: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return lr! * 0.2126 + lg! * 0.7152 + lb! * 0.0722;
}

function contrast(text: string, surface: string | string[]): number {
  const layers = Array.isArray(surface) ? surface : [surface];
  const ground = flatten(layers);
  const ink = colourOf(text);
  const shown = { r: ink.r * ink.a + ground.r * (1 - ink.a), g: ink.g * ink.a + ground.g * (1 - ink.a), b: ink.b * ink.a + ground.b * (1 - ink.a), a: 1 };
  const [light, dark] = [luminance(shown), luminance(ground)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const name = (surface: string | string[]) => (Array.isArray(surface) ? surface.join(" over ") : surface);

// ---- Real text / surface pairs, taken from the stylesheets. `where` says which rule puts them together.
type Pair = [text: string, surface: string | string[], where: string];
const TEXT_PAIRS: Pair[] = [
  ["muted", "paper", "panel text"],
  ["muted", "canvas", "page text"],
  ["muted", "note", ".eyebrow in note panels"],
  ["muted", "disabled-surface", "disabled fields (before the .65 opacity of disabled buttons)"],
  ["muted", "tab-track", "text beside tabs"],
  ["faint", "paper", ".list-row-note"],
  ["faint", "canvas", ".list-row-note on the page"],
  ["faint", "note", "notes inside note panels"],
  ["faint", "raised-surface", ".search-box span"],
  ["faint", "tone-neutral-bg", ".seat-unavailable"],
  ["placeholder", "paper", "field placeholder"],
  ["placeholder", "raised-surface", ".search-box placeholder"],
  ["subtitle", "paper", ".auth-subtitle"],
  ["subtitle", "canvas", ".auth-subtitle on the page"],
  ["intro", "paper", ".form-intro"],
  ["intro", "canvas", ".empty-state on the page"],
  ["intro", "note", "intro text in note panels"],
  ["body-soft", "paper", ".fact-list"],
  ["body-soft", "canvas", ".event-description"],
  ["body-soft", "note", "body text in note panels"],
  ["meta", "paper", ".list-row-meta"],
  ["meta", "canvas", ".event-card-meta"],
  ["meta", "note", ".notification-time on .notification-row.unread"],
  ["meta", "hover-surface", ".notification-time while the row is hovered"],
  ["meta", "tab-track", ".seat-stage (checkout.css, organizer.css)"],
  ["button-ink", "paper", ".form-details summary"],
  ["button-ink", "canvas", ".seat-section h4"],
  ["nav-ink", "tab-track", ".admin-nav-link"],
  ["nav-ink", ["topbar-glass", "canvas"], ".top-tab on the sticky top bar over the page"],
  ["nav-ink", ["topbar-glass", "paper"], ".top-tab on the sticky top bar over a panel"],
  ["nav-ink", "sidebar", "phone .tab-bar-link"],
  ["green-dark", "active-nav", ".top-tab[aria-current] and active tab-bar link"],
  ["hint", "paper", ".field-label small"],
  ["hint", "canvas", ".account-email"],
  ["hint", "note", "labels in note panels"],
  ["field-note", "paper", ".field-note"],
  ["field-note", "canvas", ".field-note on the page"],
  ["field-note", "note", ".field-note in note panels"],
  ["table-head", "paper", ".data-table th in a panel"],
  ["table-head", "canvas", ".data-table th on the page"],
  ["tab-ink", "tab-track", ".tab on the track"],
  ["tab-ink", "canvas", ".tab in a secondary row on the page"],
  ["tab-ink", "paper", ".tab in a secondary row on a panel"],
  ["price-ink", "paper", ".price"],
  ["price-ink", "canvas", ".price on the page"],
  ["timeline-ink", "paper", ".timeline span"],
  ["timeline-ink", "canvas", ".timeline span on the page"],
  ["note-ink", "note", ".organizer-note p (panel tone note)"],
  ["note-ink", "paper", ".organizer-note p if the panel is plain"],
  ["error", "paper", ".form-message"],
  ["error", "canvas", ".form-message on the page"],
  ["error-title", "paper", ".error-panel strong"],
  ["error-title", "canvas", ".error-panel strong on the page"],
  ["error-text", "paper", ".error-panel p"],
  ["error-text", "canvas", ".error-panel p on the page"],
  ["danger", "paper", ".danger-button"],
  ["danger", "canvas", ".danger-button on the page"],
  ["danger", "danger-surface", ".danger-button:hover"],
  ["tone-positive", "tone-positive-bg", "positive status pill"],
  ["tone-pending", "tone-pending-bg", "pending status pill"],
  ["tone-blocked", "tone-blocked-bg", "blocked status pill"],
  ["tone-neutral", "tone-neutral-bg", "neutral status pill"],
  ["paper", "green", ".primary-button"],
  ["on-green", "green", ".primary-button, .skip-link, .brand-mark"],
  ["on-green", "green-dark", ".primary-button:hover"],
  ["on-green", "green-story", ".toast"],
];

// Sign-in story panel: the ticket card is --glass laid over the panel and over the ::after art, so
// text inside it is tested on each of those blended backgrounds; copy outside the card sits on
// the flat panel or art.
const STORY_FLAT = ["green-story", "story-art-from", "story-art-to"];
const STORY_GLASS = STORY_FLAT.map((base) => ["glass", base]);
for (const text of ["story-ink", "story-soft"]) {
  for (const surface of [...STORY_FLAT, ...STORY_GLASS]) TEXT_PAIRS.push([text, surface, ".story-copy and .story-ticket text"]);
}
for (const text of ["story-eyebrow", "story-foot"]) {
  for (const surface of STORY_FLAT) TEXT_PAIRS.push([text, surface, ".eyebrow and .auth-foot"]);
}
for (const surface of [...STORY_FLAT, ...STORY_GLASS]) TEXT_PAIRS.push(["lime", surface, ".ticket-stamp and headline accent"]);

// Deliberately outside the text rules, with the reason:
//   art-ink     white initial on pastel artwork; aria-hidden, decorative (the event title carries the meaning)
//   art-ring    its outline ring
//   google-blue Google's logotype colour; the "G" mark is aria-hidden and the button has a text label
const EXEMPT_TOKENS = ["art-ink", "art-ring", "google-blue"];

describe("WCAG AA colour tokens", () => {
  it.each(TEXT_PAIRS.map(([text, surface, where]) => ({ text, surface, where, label: `${text} on ${name(surface)} (${where})` })))("text: $label", ({ text, surface }) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["input-line", "paper", "field outline"],
    ["input-line", "raised-surface", ".search-box outline"],
    ["focus", "canvas", "focus ring on the page"],
    ["focus", "paper", "focus ring in a panel"],
    ["focus", "tab-track", "focus ring on a tab"],
  ] as const)("boundary: %s on %s (%s)", (token, surface, _where) => {
    expect(contrast(token, surface)).toBeGreaterThanOrEqual(3);
  });

  it("reads rgb() tokens, alpha and var() aliases", () => {
    expect(colourOf("glass")).toEqual({ r: 255, g: 255, b: 255, a: 0.09 });
    expect(colourOf("field-note")).toEqual(colourOf("hint"));
    const blended = flatten(["glass", "green-story"]);
    expect(blended.r).toBeCloseTo(0x17 * 0.91 + 255 * 0.09, 5);
  });

  it("keeps the exempt tokens declared, so an exemption cannot outlive its token", () => {
    for (const token of EXEMPT_TOKENS) expect(declarations.has(`--${token}`), token).toBe(true);
  });
});

// ---- Colour literals live in tokens.css only.
const NAMED_COLOURS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen " +
    "canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext").split(" "),
);
// Properties whose values are never colours.
const NON_COLOUR_PROPERTIES = new Set(["font-family", "content", "animation-name", "grid-area", "grid-template-areas", "counter-reset", "counter-increment", "will-change", "transition-property"]);
const LITERAL = /#[0-9a-f]{3,8}\b|%23[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|(?<![\w-])[a-z]+(?![\w-])(?!\()/gi;

const blank = (text: string) => text.replace(/[^\n]/g, " ");

/** Blank comments, strings and plain url() references, keeping every newline so line numbers hold. */
function stripNoise(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|url\(\s*(?!["']?data:)[^)]*\)/gi, (match, offset: number) => {
    // A quoted data: URL can carry an SVG with colours: keep it so the scan sees %23rrggbb.
    const quoted = match.startsWith('"') || match.startsWith("'");
    if (quoted && /^["']data:/i.test(match) && /url\(\s*$/i.test(source.slice(Math.max(0, offset - 12), offset))) return match;
    return blank(match);
  });
}

/** `var(--x)` is a token reference; for `var(--x, fallback)` only the `var(--x,` part is skipped. */
function stripVarReferences(value: string): string {
  return value.replace(/var\(\s*--[\w-]+\s*\)/g, blank).replace(/var\(\s*--[\w-]+\s*,/g, blank);
}

/** Declarations anywhere in the source, nested rules included: segments ending in `;` or `}`. */
function declarationsOf(clean: string): { property: string; value: string; valueStart: number }[] {
  const found: { property: string; value: string; valueStart: number }[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index <= clean.length; index += 1) {
    const char = clean[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    const boundary = index === clean.length || (depth === 0 && (char === ";" || char === "{" || char === "}"));
    if (!boundary) continue;
    if (char !== "{") {
      const segment = clean.slice(start, index);
      const colon = segment.indexOf(":");
      if (colon > 0) {
        const property = segment.slice(0, colon).trim().toLowerCase();
        if (/^-{0,2}[\w-]+$/.test(property)) found.push({ property, value: segment.slice(colon + 1), valueStart: start + colon + 1 });
      }
    }
    start = index + 1;
  }
  return found;
}

function findColourLiterals(source: string): { line: number; literal: string }[] {
  const clean = stripNoise(source);
  const found: { line: number; literal: string }[] = [];
  const lineAt = (index: number) => source.slice(0, index).split("\n").length;
  for (const { property, value, valueStart } of declarationsOf(clean)) {
    if (NON_COLOUR_PROPERTIES.has(property)) continue;
    const scanned = stripVarReferences(value);
    for (const match of scanned.matchAll(LITERAL)) {
      const text = match[0];
      const isHexOrFunction = /^(#|%23)/.test(text) || text.endsWith("(");
      if (!isHexOrFunction && !NAMED_COLOURS.has(text.toLowerCase())) continue;
      let end = match.index! + text.length;
      if (text.endsWith("(")) {
        let open = 1;
        while (end < scanned.length && open > 0) {
          if (scanned[end] === "(") open += 1;
          if (scanned[end] === ")") open -= 1;
          end += 1;
        }
      }
      found.push({ line: lineAt(valueStart + match.index!), literal: value.slice(match.index!, end).trim() });
    }
  }
  return found;
}

/** Tokens in tokens.css that hold exactly this colour value. */
function tokensWithValue(literal: string): string[] {
  const wanted = literal.trim().toLowerCase();
  return [...declarations].filter(([, value]) => value.toLowerCase() === wanted).map(([token]) => token);
}

describe("colour literals live in tokens.css only", () => {
  const literals = (source: string) => findColourLiterals(source).map(({ line, literal }) => `${line}:${literal}`);

  it("finds hex, functional and named colours but not tokens, keywords or class names", () => {
    const sample = [".green { color: var(--green); background: transparent; border-color: currentColor; }", ".a { color: #fff; }", ".b { background: rgb(0 0 0 / 5%); }", ".c { color: white; font-family: Georgia, serif; content: \"red\"; }"].join("\n");
    expect(literals(sample)).toEqual(["2:#fff", "3:rgb(0 0 0 / 5%)", "4:white"]);
  });

  it("ignores colour words inside comments, including top-level comments with rules", () => {
    expect(literals(".a {\n  /* note: white on green */\n  color: var(--ink);\n}\n/* Example: .x { color: red } */\n")).toEqual([]);
  });

  it("does not let a comment hide a real declaration", () => {
    expect(literals(".a { /* content: */ color: red; }")).toEqual(["1:red"]);
  });

  it("checks var() fallbacks", () => {
    expect(literals(".a { color: var(--ink, #123456); border-color: var(--line, rgb(1 2 3)); background: var(--paper, var(--canvas)); }")).toEqual(["1:#123456", "1:rgb(1 2 3)"]);
  });

  it("catches the color() function but not color-mix() of tokens", () => {
    expect(literals(".a { color: color(srgb 1 0 0); background: color-mix(in srgb, var(--green) 90%, transparent); }")).toEqual(["1:color(srgb 1 0 0)"]);
  });

  it("catches system colours but not math functions named like colours", () => {
    expect(literals(".a { color: CanvasText; border-color: Highlight; width: calc(tan(45deg) * 10px); }")).toEqual(["1:CanvasText", "1:Highlight"]);
  });

  it("reads declarations after nested rules", () => {
    expect(literals(".a { color: var(--ink); &:hover { color: var(--green); }\n  border-color: #abcdef; }")).toEqual(["2:#abcdef"]);
  });

  it("ignores selectors, id references and url() fragments", () => {
    expect(literals("#fade:hover, a[href='#bad'] { fill: url(#abc); background: url(image.png) no-repeat; }")).toEqual([]);
  });

  it("scans colours inside data: URLs without splitting on their semicolons", () => {
    expect(literals(".a { background: url(\"data:image/svg+xml;utf8,%3Csvg fill='%23ff0000'/%3E\"); }")).toEqual(["1:%23ff0000"]);
    expect(literals(".a { background: url(data:image/png;base64,iVBORw0KGgo=) center; color: var(--ink); }")).toEqual([]);
  });

  it("has no colour literal in any other stylesheet", () => {
    const problems: string[] = [];
    for (const file of readdirSync("src/styles").filter((entry) => entry.endsWith(".css") && entry !== "tokens.css")) {
      const source = readFileSync(`src/styles/${file}`, "utf8");
      for (const { line, literal } of findColourLiterals(source)) {
        const holders = tokensWithValue(literal);
        const fix = holders.length ? `tokens with this value: ${holders.map((token) => `var(${token})`).join(", ")}; pick the one named for this role` : "add a role-named token to tokens.css and use var(--name)";
        problems.push(`src/styles/${file}:${line}  ${literal}  -> ${fix}`);
      }
    }
    expect(problems, `Colour literals belong in tokens.css:\n${problems.join("\n")}`).toEqual([]);
  });
});
