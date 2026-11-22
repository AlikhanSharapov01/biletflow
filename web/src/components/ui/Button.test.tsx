import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink } from "./Button";

describe("Button", () => {
  it("is a plain enabled button by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(button.hasAttribute("aria-disabled")).toBe(false);
  });

  it("busy marks the button aria-busy and aria-disabled without the disabled attribute", () => {
    render(<Button busy>Saving</Button>);
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("busy keeps keyboard focus and ignores activation", () => {
    const onClick = vi.fn();
    render(<Button busy onClick={onClick}>Saving</Button>);
    const button = screen.getByRole("button", { name: "Saving" });
    button.focus();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it("busy submit buttons do not submit the form", () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<form onSubmit={onSubmit}><Button type="submit" busy>Send</Button></form>);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onClick when not busy", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("the caller's own disabled still sets the attribute, without busy semantics", () => {
    render(<Button disabled>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("busy and disabled combine", () => {
    render(<Button busy disabled>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});

describe("ButtonLink", () => {
  it("busy sets aria-busy and aria-disabled and cancels navigation", () => {
    const onClick = vi.fn();
    render(<MemoryRouter><ButtonLink to="/x" busy onClick={onClick}>Open</ButtonLink></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Open" });
    expect(link.getAttribute("aria-busy")).toBe("true");
    expect(link.getAttribute("aria-disabled")).toBe("true");
    const notCancelled = fireEvent.click(link);
    expect(notCancelled).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("button states in CSS", () => {
  const base = readFileSync("src/styles/base.css", "utf8");
  const components = readFileSync("src/styles/components.css", "utf8");
  const layout = readFileSync("src/styles/layout.css", "utf8");

  it("disabled looks not-allowed and busy looks like waiting", () => {
    expect(base).toMatch(/button:disabled,\s*[^{]*\[aria-disabled="true"\][^{]*\{[^}]*cursor: not-allowed/);
    expect(base).toMatch(/\[aria-busy="true"\][^{]*\{[^}]*cursor: wait/);
    expect(base).not.toMatch(/button:disabled[^{]*\{[^}]*cursor: wait/);
  });

  it("hover lift is limited to hover-capable pointers and skips disabled controls", () => {
    expect(components).toMatch(/@media \(hover: hover\)/);
    expect(components).not.toMatch(/^\.primary-button:hover:not\(:disabled\) \{[^}]*translateY/m);
    expect(components).toMatch(/primary-button:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
  });

  it("buttons, tabs and tab-bar links scale down on press, never when disabled or busy", () => {
    for (const css of [components, layout]) expect(css).toMatch(/:active[^{]*\{[^}]*scale\(\.97\)/);
    expect(components).toMatch(/primary-button:active:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
    expect(layout).toMatch(/\.top-tab:active/);
    expect(layout).toMatch(/\.icon-button:active/);
  });
});
