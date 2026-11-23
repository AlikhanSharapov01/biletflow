import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavIcon, type NavIconId } from "./NavIcon";

const IDS: NavIconId[] = ["discover", "tickets", "orders", "organizer", "support", "admin"];

describe("NavIcon", () => {
  it.each(IDS)("draws %s as a line icon by default", (id) => {
    const { container } = render(<NavIcon id={id} />);
    const svg = container.querySelector("svg")!;
    expect(svg.dataset.variant).toBe("outline");
    expect(svg.getAttribute("fill")).toBe("none");
    expect(svg.querySelector("mask")).toBeNull();
  });

  it.each(IDS)("draws %s filled, with its inner lines cut out of the fill", (id) => {
    const { container } = render(<NavIcon id={id} filled />);
    const svg = container.querySelector("svg")!;
    expect(svg.dataset.variant).toBe("filled");
    // The shape is filled with the text colour and keeps the line icon's outline width, so both variants line up.
    const filled = svg.querySelector('[fill="currentColor"]');
    expect(filled).not.toBeNull();
    // The details are knocked out through a mask, so whatever is behind the bar shows through them.
    const mask = svg.querySelector("mask")!;
    expect(mask).not.toBeNull();
    expect(mask.querySelector('[fill="white"]')).not.toBeNull();
    expect(mask.querySelector('[stroke="black"]')).not.toBeNull();
    expect(filled!.closest("[mask]")?.getAttribute("mask")).toBe(`url(#${mask.id})`);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives every filled icon its own mask id", () => {
    const { container } = render(<><NavIcon id="orders" filled /><NavIcon id="orders" filled /></>);
    const ids = [...container.querySelectorAll("mask")].map((mask) => mask.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
  });
});
