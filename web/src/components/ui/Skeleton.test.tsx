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
  });

  it("draws the art block on grid cards only", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector(".skeleton-art")).not.toBeNull();
  });

  it("a page skeleton is one status region with a heading and the requested panels", () => {
    const { container } = render(<SkeletonPage label="Loading event details…" panels={2} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Loading event details…");
    expect(container.querySelectorAll(".skeleton-panel")).toHaveLength(2);
  });
});

describe("skeleton styles", () => {
  const css = readFileSync("src/styles/components.css", "utf8");
  it("shimmers from tokens and stops under reduced motion", () => {
    const skeleton = css.split("\n").filter((line) => /skeleton|shimmer/.test(line)).join("\n");
    expect(skeleton).toMatch(/@keyframes shimmer/);
    expect(skeleton).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("skeleton")));
    expect(reduced).toMatch(/\.skeleton[^{]*\{[^}]*animation: none/);
  });
});
