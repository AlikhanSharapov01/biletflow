import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink, busyProps } from "./Button";

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
    expect(button.textContent).toBe("Saving");
  });

  it("busy ignores activation while the button holds focus", () => {
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

  it("aria-disabled ignores clicks, keeps focus, and is not busy", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<form onSubmit={onSubmit}><Button type="submit" aria-disabled onClick={onClick}>Other</Button></form>);
    const button = screen.getByRole("button", { name: "Other" });
    button.focus();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("aria-disabled=false does not lock the button", () => {
    const onClick = vi.fn();
    render(<Button aria-disabled={false} onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
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

describe("busyProps", () => {
  it("marks a raw button busy and swallows its click", () => {
    const onClick = vi.fn();
    render(<button type="button" {...busyProps(true, onClick)}>Go</button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("locks a sibling with aria-disabled only, and swallows its click", () => {
    const onClick = vi.fn();
    render(<button type="button" {...busyProps(false, onClick, true)}>Go</button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes clicks through and adds no attributes when idle", () => {
    const onClick = vi.fn();
    render(<button type="button" {...busyProps(false, onClick)}>Go</button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
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
    // The busy rule must come later so it wins over the disabled one.
    expect(base.indexOf('button[aria-busy="true"]')).toBeGreaterThan(base.indexOf("button:disabled,"));
  });

  it("the busy dimming keeps the focus ring above 3:1", () => {
    expect(base).toMatch(/button\[aria-disabled="true"\]:focus-visible[^{]*\{[^}]*opacity: \.75/);
  });

  it("hover colours live only inside the hover-capable media block, and nothing lifts", () => {
    const hoverBlock = /@media \(hover: hover\) \{([\s\S]*?)\n\}/.exec(components);
    expect(hoverBlock).not.toBeNull();
    const inside = hoverBlock?.[1] ?? "";
    expect(inside).toMatch(/primary-button:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)[^}]*background: var\(--green-dark\)/);
    expect(inside).toMatch(/subtle-button:hover[^}]*background: var\(--fill-strong\)/);
    expect(inside).not.toMatch(/translateY/);
    const outside = components.replace(hoverBlock?.[0] ?? "", "");
    expect(outside).not.toMatch(/:hover[^{]*\{[^}]*translateY/);
    expect(outside).not.toMatch(/(primary|subtle|danger|text)-button:hover/);
  });

  it("reduced motion drops the press transforms but keeps colour changes", () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(base);
    const reduced = block?.[1] ?? "";
    const selectors = /([^{}]*)\{[^}]*transform: none/.exec(reduced)?.[1] ?? "";
    expect(selectors).not.toBe("");
    for (const selector of [".primary-button:active", ".subtle-button:active", ".event-card-linked:active", ".tab:active", ".top-tab:active", ".icon-button:active", ".tab-bar-link:active"]) {
      expect(selectors).toContain(selector);
    }
  });

  it("buttons, tabs and tab-bar links scale down on press, never when disabled or busy", () => {
    for (const css of [components, layout]) expect(css).toMatch(/:active[^{]*\{[^}]*scale\(\.97\)/);
    expect(components).toMatch(/primary-button:active:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
    expect(layout).toMatch(/\.top-tab:active/);
    expect(layout).toMatch(/\.icon-button:active/);
  });
});
