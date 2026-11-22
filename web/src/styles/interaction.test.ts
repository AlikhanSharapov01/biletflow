// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Block = { context: string[]; selector: string; body: string };

/** Walks a stylesheet and returns every rule with the at-rule preludes that enclose it. */
function blocks(css: string): Block[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
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
      if (prelude.startsWith("@media") || prelude.startsWith("@supports")) walk(inner, [...context, prelude]);
      else found.push({ context, selector: prelude, body: inner });
      index = close;
    }
  };
  walk(source, []);
  return found;
}

const sheets = readdirSync("src/styles")
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, blocks: blocks(readFileSync(`src/styles/${name}`, "utf8")) }));

describe("interaction styles", () => {
  it("hover rules are guarded by (hover: hover)", () => {
    const unguarded = sheets.flatMap(({ name, blocks: list }) =>
      list
        .filter((block) => block.selector.includes(":hover"))
        .filter((block) => !block.context.some((c) => /\(hover:\s*hover\)/.test(c) || /prefers-reduced-motion:\s*reduce/.test(c)))
        .map((block) => `${name}: ${block.selector}`),
    );
    expect(unguarded).toEqual([]);
  });

  it("skeleton shimmer is composited, not painted", () => {
    const keyframes = sheets.flatMap(({ name, blocks: list }) => list.filter((b) => b.selector.startsWith("@keyframes")).map((b) => ({ name, ...b })));
    expect(keyframes.length).toBeGreaterThan(0);
    for (const frame of keyframes) expect(frame.body, `${frame.name}: ${frame.selector}`).not.toMatch(/background-position/);
    // The overlay clips itself to the shape's content box; no engine-specific overflow-clip-margin.
    const all = sheets.flatMap(({ blocks: list }) => list);
    const overlay = all.find((b) => b.selector.includes(".skeleton-shape::after"));
    expect(overlay?.body).toMatch(/padding:\s*inherit/);
    expect(overlay?.body).toMatch(/background-clip:\s*content-box/);
    expect(all.map((b) => b.body).join("\n")).not.toMatch(/overflow-clip-margin/);
    const shimmer = sheets.flatMap(({ blocks: list }) => list).find((b) => b.selector === "@keyframes shimmer");
    expect(shimmer?.body).toMatch(/transform\s*:\s*translateX\(-100%\)/);
    expect(shimmer?.body).toMatch(/transform\s*:\s*translateX\(100%\)/);
    expect(shimmer?.body.replace(/transform\s*:[^;}]*;?/g, "").match(/[\w-]+\s*:/g) ?? []).toEqual([]);
  });
});
