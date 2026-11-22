// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const files = readdirSync("src/styles").filter((name) => name.endsWith(".css"));

describe("phone browser fixes", () => {
  it("raises input, select and textarea to 16px on small or touch screens", () => {
    const tokens = read("src/styles/tokens.css");
    expect(tokens).toMatch(/--text-field: var\(--text-body\);/);
    expect(tokens).toMatch(/@media \(max-width: 1024px\), \(pointer: coarse\) \{\s*:root \{ --text-field: 16px; \}/);
    expect(read("src/styles/base.css")).toMatch(/\binput, select, textarea \{ font-size: var\(--text-field\); \}/);
    // No field style may pin its own size, or it would skip the 16px rule.
    for (const name of files) {
      for (const [, selector, body] of read(`src/styles/${name}`).matchAll(/([^{}\/]+)\{([^{}]*)\}/g)) {
        if (!/\b(input|select|textarea)\b/.test(selector!)) continue;
        for (const size of body!.matchAll(/(?<![-\w])font-size: ([^;]+);/g)) {
          expect(size[1], `${name}: ${selector!.trim()}`).toBe("var(--text-field)");
        }
      }
    }
  });

  it("keeps 100vh as a fallback followed by 100dvh", () => {
    for (const name of files) {
      for (const rule of read(`src/styles/${name}`).split("}")) {
        for (const match of rule.matchAll(/([\w-]+): ([^;:{}]*100vh[^;]*);/g)) {
          const dynamic = `${match[1]}: ${match[2]!.replaceAll("100vh", "100dvh")};`;
          expect(rule.indexOf(dynamic), `${name}: ${match[0]}`).toBeGreaterThan(rule.indexOf(match[0]));
        }
      }
    }
  });

  it("gives interactive elements a tap highlight token and touch-action", () => {
    expect(read("src/styles/tokens.css")).toMatch(/--tap-highlight: rgb\(/);
    const base = read("src/styles/base.css");
    expect(base).toMatch(/a, button, summary, label, \[role="tab"\] \{[^}]*-webkit-tap-highlight-color: var\(--tap-highlight\)/);
    expect(base).toMatch(/a, button, summary, label, \[role="tab"\] \{[^}]*touch-action: manipulation/);
  });

  it("extends the viewport under the notch without disabling zoom", () => {
    const meta = read("index.html").match(/<meta name="viewport" content="([^"]*)"/)?.[1] ?? "";
    expect(meta).toContain("width=device-width");
    expect(meta).toContain("initial-scale=1");
    expect(meta).toContain("viewport-fit=cover");
    expect(meta).not.toMatch(/user-scalable|maximum-scale/);
  });
});
