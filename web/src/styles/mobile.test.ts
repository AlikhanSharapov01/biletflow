// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const files = readdirSync("src/styles").filter((name) => name.endsWith(".css"));
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));

describe("phone browser fixes", () => {
  it("raises input, select and textarea to 16px on small or touch screens", () => {
    const tokens = read("src/styles/tokens.css");
    expect(tokens).toMatch(/--text-field:\s*var\(--text-body\)\s*;/);
    expect(tokens).toMatch(/@media \(max-width:\s*1024px\),\s*\(pointer:\s*coarse\)\s*\{\s*:root\s*\{\s*--text-field:\s*16px\s*;?\s*\}/);
    expect(read("src/styles/base.css")).toMatch(/\binput,\s*select,\s*textarea\s*\{\s*font-size:\s*var\(--text-field\)\s*;?\s*\}/);
    // No field style may pin its own size, or it would skip the 16px rule.
    for (const name of files) {
      for (const { selector, body } of rules(read(`src/styles/${name}`))) {
        if (!/\b(input|select|textarea)\b/.test(selector)) continue;
        if (name === "base.css" && selector.startsWith("button,")) continue; // `font: inherit` reset, overridden right after
        expect(body, `${name}: ${selector}`).not.toMatch(/(?<![-\w])font\s*:/);
        for (const size of body.matchAll(/(?<![-\w])font-size\s*:\s*([^;}]+)/g)) {
          expect(size[1]!.trim(), `${name}: ${selector}`).toBe("var(--text-field)");
        }
      }
    }
  });

  it("pairs every 100vh with a following 100dvh and the other way round", () => {
    for (const name of files) {
      for (const { body } of rules(read(`src/styles/${name}`))) {
        for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;:{}]*100vh[^;]*)/g)) {
          const dynamic = new RegExp(`${match[1]}\\s*:\\s*${match[2]!.replaceAll("100vh", "100dvh").replace(/[()+*.]/g, "\\$&")}`);
          expect(body.slice(body.indexOf(match[0]) + match[0].length), `${name}: ${match[0]}`).toMatch(dynamic);
        }
        for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;:{}]*100dvh[^;]*)/g)) {
          // The dialog's calc(100dvh - 2rem) has no fallback by design.
          if (match[2]!.includes("calc(")) continue;
          const fallback = `${match[1]}: ${match[2]!.replaceAll("100dvh", "100vh")}`;
          expect(body.slice(0, body.indexOf(match[0])), `${name}: ${match[0]}`).toContain(fallback);
        }
      }
    }
    expect(read("src/styles/support.css")).toMatch(/max-height:\s*60vh;\s*max-height:\s*60dvh/);
  });

  it("gives interactive elements a tap highlight and touch-action", () => {
    const tokens = read("src/styles/tokens.css");
    expect(tokens).toMatch(/--tap-highlight:\s*rgb\(/);
    expect(tokens).toMatch(/--tap-highlight-on-green:\s*rgb\(/);
    const base = read("src/styles/base.css");
    expect(base).toMatch(/html\s*\{[^}]*-webkit-tap-highlight-color:\s*var\(--tap-highlight\)/);
    expect(base).toMatch(/a,\s*button,\s*summary,\s*label,\s*\[role="tab"\]\s*\{[^}]*touch-action:\s*manipulation/);
    expect(base).toMatch(/\.primary-button[^{]*\{[^}]*-webkit-tap-highlight-color:\s*var\(--tap-highlight-on-green\)/);
  });

  it("extends the viewport under the notch without disabling zoom", () => {
    const meta = read("index.html").match(/<meta name="viewport" content="([^"]*)"/)?.[1] ?? "";
    expect(meta).toContain("width=device-width");
    expect(meta).toContain("initial-scale=1");
    expect(meta).toContain("viewport-fit=cover");
    expect(meta).not.toMatch(/user-scalable|maximum-scale/);
  });

  it("keeps fixed and edge-aligned layers out from under the notch", () => {
    const inset = (side: string) => new RegExp(`max\\([^;]*env\\(safe-area-inset-${side}`);
    const layout = read("src/styles/layout.css");
    for (const selector of [".topbar-inner", ".page", ".tab-bar"]) {
      const body = rules(layout).find((r) => r.selector.endsWith(selector) && /padding/.test(r.body))?.body ?? "";
      expect(body, selector).toMatch(inset("left"));
      expect(body, selector).toMatch(inset("right"));
    }
    expect(rules(layout).find((r) => r.selector === ".topbar")?.body).toMatch(/padding-top:\s*env\(safe-area-inset-top/);
    const toast = read("src/styles/components.css");
    expect(toast).toMatch(/\.toast\s*\{[^}]*right:\s*max\([^;]*env\(safe-area-inset-right/);
    expect(toast).toMatch(/\.toast\s*\{[^}]*left:\s*max\([^;]*env\(safe-area-inset-left/);
    expect(read("src/styles/auth.css")).toMatch(/\.auth-story\s*\{[^}]*max\([^;]*env\(safe-area-inset-left/);
  });
});
