// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("src/styles/tokens.css", "utf8");
function luminance(token: string): number {
  const short = css.match(new RegExp(`--${token}: #([a-f0-9]{3});`, "i"))?.[1];
  const hex = short ? [...short].map((digit) => digit + digit).join("") : css.match(new RegExp(`--${token}: #([a-f0-9]{6});`, "i"))?.[1];
  if (!hex) throw new Error(`Missing hex colour token ${token}`);
  const channels = [0, 2, 4].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

const LIGHT = ["paper", "canvas"];
// Every light surface a text token can sit on: page, tab track, disabled
// fields, hover rows and the white search field.
const LIGHT_SURFACES = [...LIGHT, "tab-track", "disabled-surface", "hover-surface", "field-surface"];

describe("WCAG AA colour tokens", () => {
  it.each(["muted", "faint", "subtitle", "meta", "body-soft", "intro", "button-ink", "nav-ink", "placeholder", "error", "error-title", "error-text", "danger", "price-ink", "timeline-ink", "note-ink"])("keeps %s text readable on light surfaces", (token) => {
    for (const surface of LIGHT) expect(contrast(token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["hint", "field-note", "table-head", "tab-ink"])("keeps %s readable on every surface it can sit on", (token) => {
    for (const surface of LIGHT_SURFACES) expect(contrast(token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps muted text readable on the tab track and the search icon readable on the search field", () => {
    expect(contrast("muted", "tab-track")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("faint", "field-surface")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("placeholder", "field-surface")).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["story-ink", "story-soft", "story-eyebrow", "story-foot", "lime"])("keeps %s readable on the auth story panel", (token) => {
    expect(contrast(token, "green-story")).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps white text readable on green and on the toast", () => {
    expect(contrast("on-green", "green")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("on-green", "green-story")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("on-green", "green-dark")).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["positive", "pending", "blocked", "neutral"])("keeps the %s pill readable", (tone) => {
    expect(contrast(`tone-${tone}`, `tone-${tone}-bg`)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps primary buttons and control outlines distinguishable", () => {
    expect(contrast("paper", "green")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("input-line", "paper")).toBeGreaterThanOrEqual(3);
    expect(contrast("input-line", "field-surface")).toBeGreaterThanOrEqual(3);
    expect(contrast("focus", "canvas")).toBeGreaterThanOrEqual(3);
    expect(contrast("focus", "tab-track")).toBeGreaterThanOrEqual(3);
  });
});

const NAMED_COLOURS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen").split(" "),
);
// Properties whose values are never colours.
const NON_COLOUR_PROPERTIES = new Set(["font-family", "content", "animation-name", "grid-area", "grid-template-areas", "counter-reset", "counter-increment", "will-change", "transition-property"]);
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![\w-])[a-z]+(?![\w-])/gi;

/** Colour tokens from tokens.css keyed by value, so a failure can name the token to use. */
function tokensByValue(): Map<string, string> {
  const byValue = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const key = value!.trim().toLowerCase();
    if (/^(#|rgb|hsl)/.test(key) && !byValue.has(key)) byValue.set(key, name!);
  }
  return byValue;
}

function findColourLiterals(source: string): { line: number; literal: string }[] {
  const found: { line: number; literal: string }[] = [];
  const lineAt = (index: number) => source.slice(0, index).split("\n").length;
  for (const block of source.matchAll(/\{([^{}]*)\}/g)) {
    const bodyStart = block.index! + 1;
    for (const declaration of block[1]!.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) {
      const property = declaration[1]!.toLowerCase();
      if (NON_COLOUR_PROPERTIES.has(property)) continue;
      const raw = declaration[2]!;
      const valueStart = bodyStart + declaration.index! + declaration[0].indexOf(raw);
      const value = raw
        .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
        .replace(/var\([^)]*\)|url\([^)]*\)|"[^"]*"|'[^']*'/g, (m) => " ".repeat(m.length));
      for (const match of value.matchAll(LITERAL)) {
        const text = match[0];
        const isFunctionOrHex = text.startsWith("#") || text.endsWith("(");
        if (!isFunctionOrHex && !NAMED_COLOURS.has(text.toLowerCase())) continue;
        // Report `rgb(255 255 255 / 9%)` whole, not just `rgb(`.
        const end = text.endsWith("(") ? value.indexOf(")", match.index!) + 1 : match.index! + text.length;
        found.push({ line: lineAt(valueStart + match.index!), literal: raw.slice(match.index!, end).trim() });
      }
    }
  }
  return found;
}

describe("colour literals live in tokens.css only", () => {
  it("finds hex, functional and named colours but not tokens, keywords or class names", () => {
    const sample = [".green { color: var(--green); background: transparent; border-color: currentColor; }", ".a { color: #fff; }", ".b { background: rgb(0 0 0 / 5%); }", ".c { color: white; font-family: Georgia, serif; content: \"red\"; }"].join("\n");
    expect(findColourLiterals(sample)).toEqual([
      { line: 2, literal: "#fff" },
      { line: 3, literal: "rgb(0 0 0 / 5%)" },
      { line: 4, literal: "white" },
    ]);
  });

  it("has no colour literal in any other stylesheet", () => {
    const byValue = tokensByValue();
    const problems: string[] = [];
    for (const file of readdirSync("src/styles").filter((name) => name.endsWith(".css") && name !== "tokens.css")) {
      const source = readFileSync(`src/styles/${file}`, "utf8");
      for (const { line, literal } of findColourLiterals(source)) {
        const existing = byValue.get(literal.toLowerCase());
        const fix = existing ? `use var(${existing})` : "add a named token to tokens.css and use var(--name)";
        problems.push(`src/styles/${file}:${line}  ${literal}  -> ${fix}`);
      }
    }
    expect(problems, `Colour literals belong in tokens.css:\n${problems.join("\n")}`).toEqual([]);
  });
});
