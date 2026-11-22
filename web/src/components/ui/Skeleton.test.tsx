import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SkeletonCard, SkeletonGrid, SkeletonPage } from "./Skeleton";

describe("Skeleton", () => {
  it("is one status region named by its label, with every shape hidden from assistive tech", () => {
    const { container } = render(<SkeletonGrid count={4} label="Loading events…" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Loading events…");
    const cards = container.querySelectorAll(".skeleton-card");
    expect(cards).toHaveLength(4);
    for (const card of cards) expect(card.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".event-grid.row-grid")).toBeNull();
  });

  it("draws row cards in the row grid", () => {
    const { container } = render(<SkeletonGrid count={2} row label="Loading orders…" />);
    expect(container.querySelector(".event-grid.row-grid")).not.toBeNull();
    expect(container.querySelectorAll(".skeleton-card.skeleton-row")).toHaveLength(2);
    expect(container.querySelector(".skeleton-art")).toBeNull();
    // Real ticket and order rows have no eyebrow line.
    expect(container.querySelector(".skeleton-eyebrow")).toBeNull();
  });

  it("draws the art block on grid cards only", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector(".skeleton-art")).not.toBeNull();
  });

  it("draws three row cards by default", () => {
    const { container } = render(<SkeletonGrid row label="Loading orders…" />);
    expect(container.querySelectorAll(".skeleton-card")).toHaveLength(3);
  });

  it("a page skeleton is one status region with the back link, heading, status pill and two panels", () => {
    const { container } = render(<SkeletonPage label="Loading event details…" />);
    expect(container.querySelector(".skeleton-back")).not.toBeNull();
    expect(container.querySelector(".skeleton-pill")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Loading event details…");
    expect(container.querySelectorAll(".skeleton-panel")).toHaveLength(2);
  });
});

describe("skeleton styles", () => {
  const css = readFileSync("src/styles/components.css", "utf8");
  const reducedMotion = (source: string) => {
    const start = source.indexOf("@media (prefers-reduced-motion: reduce)", source.indexOf("skeleton"));
    let depth = 0;
    for (let index = source.indexOf("{", start); index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
    }
    return source.slice(start);
  };

  it("shimmers from tokens and stops under reduced motion", () => {
    const skeleton = css.split("\n").filter((line) => /skeleton|shimmer/.test(line)).join("\n");
    expect(skeleton).toMatch(/@keyframes shimmer/);
    expect(skeleton).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const reduced = reducedMotion(css);
    expect(reduced).toMatch(/\.skeleton[^{]*\{[^}]*animation: none/);
    expect(reduced).toMatch(/\.skeleton-page \.page-heading \.skeleton-shape \{[^}]*background-image: none/);
    expect(reduced.trim().endsWith("}")).toBe(true);
    expect(reduced).not.toMatch(/Loading, error/);
  });

  it("draws shapes that sit on the canvas in the darker line colour", () => {
    expect(css).toMatch(/\.skeleton-page \.page-heading \.skeleton-shape \{[^}]*var\(--line\) 30%/);
  });

  it("dims a reload after a short delay and eases back in, with no transition under reduced motion", () => {
    expect(css).toMatch(/\.event-grid \{ transition: opacity \.2s ease; \}/);
    expect(css).toMatch(/\.event-grid\[aria-busy="true"\] \{[^}]*transition: opacity \.2s ease \.15s/);
    expect(reducedMotion(css)).toMatch(/\.event-grid\[aria-busy="true"\] \{ transition: none; \}/);
  });
});
