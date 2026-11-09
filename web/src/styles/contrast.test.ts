// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("src/styles/tokens.css", "utf8");
function luminance(token: string): number {
  const hex = css.match(new RegExp(`--${token}: #([a-f0-9]{6})`, "i"))?.[1];
  if (!hex) throw new Error(`Missing colour token ${token}`);
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

describe("WCAG AA colour tokens", () => {
  it.each(["muted", "faint", "subtitle", "meta", "body-soft", "intro", "button-ink", "nav-ink", "placeholder", "error", "error-title", "error-text", "danger"])("keeps %s text readable on light surfaces", (token) => {
    for (const surface of ["paper", "canvas"]) expect(contrast(token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["positive", "pending", "blocked", "neutral"])("keeps the %s pill readable", (tone) => {
    expect(contrast(`tone-${tone}`, `tone-${tone}-bg`)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps primary buttons and control outlines distinguishable", () => {
    expect(contrast("paper", "green")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("input-line", "paper")).toBeGreaterThanOrEqual(3);
    expect(contrast("focus", "canvas")).toBeGreaterThanOrEqual(3);
  });
});
