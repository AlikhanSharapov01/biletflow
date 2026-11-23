import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
  { id: "d", label: "Delta" },
] as const;
type Id = (typeof items)[number]["id"];

// Fractional layout, as a browser reports it: content positions inside the row.
const CONTENT = { a: [0, 70.4], b: [74.4, 150.6], c: [154.6, 220.6], d: [224.6, 290.6] } as const;
const CLIENT_WIDTH = 200;
const SCROLL_WIDTH = 291;
const GROWN_SCROLL_WIDTH = 311;
const ROW_LEFT = 16;

let scrollLeft = 0;
let resizeCallbacks: Array<() => void> = [];
let observed: Element[] = [];
let disconnects = 0;
let scrollWidth = SCROLL_WIDTH;

function layout(row: HTMLElement) {
  Object.defineProperty(row, "clientWidth", { configurable: true, value: CLIENT_WIDTH });
  Object.defineProperty(row, "scrollWidth", { configurable: true, get: () => scrollWidth });
  // Chromium 131 keeps scrollLeft as an integer.
  Object.defineProperty(row, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (next: number) => {
      scrollLeft = Math.trunc(Math.min(Math.max(next, 0), scrollWidth - CLIENT_WIDTH));
    },
  });
  row.getBoundingClientRect = () => ({ left: ROW_LEFT, right: ROW_LEFT + CLIENT_WIDTH, top: 0, bottom: 40, width: CLIENT_WIDTH, height: 40, x: ROW_LEFT, y: 0, toJSON: () => ({}) });
  row.querySelectorAll<HTMLElement>("[role=tab]").forEach((tab, index) => {
    const [start, end] = CONTENT[items[index].id];
    tab.getBoundingClientRect = () => ({ left: ROW_LEFT + start - scrollLeft, right: ROW_LEFT + end - scrollLeft, top: 0, bottom: 40, width: end - start, height: 40, x: 0, y: 0, toJSON: () => ({}) });
  });
}

function mount(value: Id) {
  const view = render(<Tabs label="Sections" items={items} value={value} onChange={() => {}} />);
  const row = view.getByRole("tablist");
  layout(row);
  const rerender = (next: Id) => view.rerender(<Tabs label="Sections" items={items} value={next} onChange={() => {}} />);
  return { row, rerender };
}

const endOf = (id: Id) => CONTENT[id][1] - scrollLeft;
const startOf = (id: Id) => CONTENT[id][0] - scrollLeft;

describe("Tabs scrolling", () => {
  beforeEach(() => {
    scrollLeft = 0;
    scrollWidth = SCROLL_WIDTH;
    observed = [];
    disconnects = 0;
    resizeCallbacks = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback);
        }
        observe(element: Element) {
          observed.push(element);
        }
        disconnect() {
          disconnects += 1;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fully reveals a last tab at a fractional position under integer scrolling", () => {
    const { rerender } = mount("a");
    rerender("d");
    expect(endOf("d")).toBeLessThanOrEqual(CLIENT_WIDTH);
    expect(scrollLeft).toBe(SCROLL_WIDTH - CLIENT_WIDTH);
  });

  it("fully reveals a middle tab past the end of the row", () => {
    const { rerender } = mount("a");
    rerender("c");
    expect(endOf("c")).toBeLessThanOrEqual(CLIENT_WIDTH);
    expect(startOf("c")).toBeGreaterThanOrEqual(0);
  });

  it("fully reveals a middle tab before the start of the row", () => {
    const { rerender } = mount("d");
    scrollLeft = SCROLL_WIDTH - CLIENT_WIDTH;
    rerender("b");
    expect(startOf("b")).toBeGreaterThanOrEqual(0);
    expect(endOf("b")).toBeLessThanOrEqual(CLIENT_WIDTH);
  });

  it("scrolls to the start for the first tab", () => {
    const { rerender } = mount("d");
    scrollLeft = SCROLL_WIDTH - CLIENT_WIDTH;
    rerender("a");
    expect(scrollLeft).toBe(0);
  });

  it("realigns when the row is resized", () => {
    mount("d");
    scrollLeft = 0;
    resizeCallbacks.forEach((callback) => callback());
    expect(endOf("d")).toBeLessThanOrEqual(CLIENT_WIDTH);
    expect(scrollLeft).toBe(SCROLL_WIDTH - CLIENT_WIDTH);
  });

  it("watches every tab, so a longer label realigns the row", () => {
    const { row } = mount("d");
    const tabs = Array.from(row.querySelectorAll("[role=tab]"));
    expect(observed).toEqual(expect.arrayContaining([row, ...tabs]));
    scrollWidth = GROWN_SCROLL_WIDTH;
    resizeCallbacks.forEach((callback) => callback());
    expect(scrollLeft).toBe(GROWN_SCROLL_WIDTH - CLIENT_WIDTH);
  });

  it("disconnects the observer when it unmounts", () => {
    const view = render(<Tabs label="Sections" items={items} value="a" onChange={() => {}} />);
    view.unmount();
    expect(disconnects).toBeGreaterThan(0);
  });
});
