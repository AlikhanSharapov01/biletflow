import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent, makeTicketType } from "../../../../tests/helpers/fixtures";
import type { EventView, TicketType } from "../../../api/types";
import { GetTicketsBar } from "./GetTicketsBar";

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observed: Element[] = [];
let report: Callback = () => {};
let disconnected = 0;
let options: IntersectionObserverInit | undefined;

class FakeObserver {
  constructor(callback: Callback, init?: IntersectionObserverInit) {
    report = callback;
    options = init;
  }
  observe(target: Element) {
    observed.push(target);
  }
  disconnect() {
    disconnected += 1;
  }
}

const sectionRef = createRef<HTMLElement>();
function page(event: EventView, tickets: TicketType[], tabBar = false) {
  return (
    <>
      <GetTicketsBar event={event} tickets={tickets} sectionRef={sectionRef} tabBar={tabBar} />
      <section id="tickets-section" ref={sectionRef}>
        <h2 id="tickets" tabIndex={-1}>Tickets</h2>
      </section>
    </>
  );
}
function mount(event = makeEvent(), tickets = [makeTicketType()]) {
  return render(page(event, tickets));
}

const scrollIntoView = vi.fn();
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalMatchMedia = window.matchMedia;
const show = () => act(() => report([{ isIntersecting: false }]));
const bar = () => document.querySelector(".get-tickets-bar")!;

beforeEach(() => {
  observed = [];
  disconnected = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: false })));
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  window.matchMedia = originalMatchMedia;
  vi.clearAllMocks();
});

describe("GetTicketsBar", () => {
  it("shows the offer and a button for a buyable event", () => {
    mount();
    show();
    expect(screen.getByRole("button", { name: "Get tickets" })).toBeTruthy();
    expect(bar().textContent).toContain("Free");
  });

  it.each([
    ["unpublished", makeEvent({ publication_state: "unpublished" }), [makeTicketType()]],
    ["draft", makeEvent({ publication_state: "draft" }), [makeTicketType()]],
    ["suspended", makeEvent({ moderation_state: "suspended" }), [makeTicketType()]],
    ["completed", makeEvent({ time_status: "completed" }), [makeTicketType()]],
    ["sold out", makeEvent({ sold_out: true }), [makeTicketType()]],
    ["closed for registration", makeEvent({ registration_closes_at: "2000-01-01T00:00:00Z" }), [makeTicketType()]],
    ["priced as none", makeEvent({ price_from_minor: null }), [makeTicketType()]],
    ["without visible ticket types", makeEvent(), []],
    ["before every sales window", makeEvent(), [makeTicketType({ sales_open_at: "2098-01-01T00:00:00Z" })]],
    ["after every sales window", makeEvent(), [makeTicketType({ sales_close_at: "2001-01-01T00:00:00Z" })]],
    ["limited to zero places", makeEvent(), [makeTicketType({ quantity_limit: 0 })]],
  ])("renders nothing for an event that is %s", (_name, event, tickets) => {
    mount(event, tickets);
    expect(document.querySelector(".get-tickets-bar")).toBeNull();
    expect(document.querySelector(".get-tickets-spacer")).toBeNull();
  });

  it("shows for an ongoing event that is still on sale", () => {
    mount(makeEvent({ time_status: "active", price_from_minor: 500_000 }));
    show();
    expect(screen.getByRole("button", { name: "Get tickets" })).toBeTruthy();
    expect(bar().textContent).toContain("from");
  });

  it("shows when one of several ticket types is on sale", () => {
    mount(makeEvent(), [makeTicketType({ id: "a", quantity_limit: 0 }), makeTicketType({ id: "b" })]);
    expect(bar()).toBeTruthy();
  });

  it("scrolls the tickets section into view and focuses its heading", () => {
    mount();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Get tickets" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(document.getElementById("tickets"));
  });

  it("scrolls without animation when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: true })));
    mount();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Get tickets" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("hides while the tickets section is on screen and returns when it leaves", () => {
    mount();
    expect(observed).toEqual([document.getElementById("tickets-section")]);
    act(() => report([{ isIntersecting: true }]));
    expect(bar().hasAttribute("data-hidden")).toBe(true);
    act(() => report([{ isIntersecting: false }]));
    expect(bar().hasAttribute("data-hidden")).toBe(false);
  });

  it("shrinks the observed area by the top bar, the bar and the tab bar, and follows the tab bar", () => {
    let offset = "0px";
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element, pseudo?: string | null) => {
      const style = real(element, pseudo);
      if (element === document.documentElement) return { scrollPaddingTop: "72px" } as CSSStyleDeclaration;
      if (element.classList.contains("get-tickets-bar")) return { bottom: offset } as CSSStyleDeclaration;
      return style;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(93);
    const view = render(page(makeEvent(), [makeTicketType()]));
    expect(options?.rootMargin).toBe("-72px 0px -93px 0px");
    const before = disconnected;
    offset = "71px";
    view.rerender(page(makeEvent(), [makeTicketType()], true));
    expect(disconnected).toBeGreaterThan(before);
    expect(options?.rootMargin).toBe("-72px 0px -164px 0px");
    vi.restoreAllMocks();
  });

  it("writes the measured height to --sticky-bar-height and removes it on unmount", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(93);
    const view = mount();
    expect(document.documentElement.style.getPropertyValue("--sticky-bar-height")).toBe("93px");
    view.unmount();
    expect(document.documentElement.style.getPropertyValue("--sticky-bar-height")).toBe("");
    vi.restoreAllMocks();
  });

  it("starts hidden without a transition until the observer has reported", () => {
    mount();
    expect(bar().hasAttribute("data-hidden")).toBe(true);
    expect(bar().hasAttribute("data-ready")).toBe(false);
    act(() => report([{ isIntersecting: true }]));
    expect(bar().hasAttribute("data-hidden")).toBe(true);
    expect(bar().hasAttribute("data-ready")).toBe(true);
  });

  it("slides in after the first report when the section is off screen", () => {
    mount();
    act(() => report([{ isIntersecting: false }]));
    expect(bar().hasAttribute("data-hidden")).toBe(false);
    expect(bar().hasAttribute("data-ready")).toBe(true);
  });

  it("takes the hidden bar out of the tab order", () => {
    mount();
    show();
    act(() => report([{ isIntersecting: true }]));
    expect(bar().getAttribute("aria-hidden")).toBe("true");
    expect(bar().hasAttribute("inert")).toBe(true);
  });

  it("is shown at once, without a transition, when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    mount();
    expect(bar().hasAttribute("data-hidden")).toBe(false);
    expect(bar().hasAttribute("data-ready")).toBe(false);
  });

  it("scrolls with animation when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    mount();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Get tickets" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("removes the bar and its spacer, and stops observing, when the event sells out", () => {
    const view = mount();
    show();
    expect(bar()).toBeTruthy();
    const before = disconnected;
    view.rerender(page(makeEvent({ sold_out: true }), [makeTicketType()]));
    expect(document.querySelector(".get-tickets-bar")).toBeNull();
    expect(document.querySelector(".get-tickets-spacer")).toBeNull();
    expect(disconnected).toBeGreaterThan(before);
  });

  it("stops observing when it unmounts", () => {
    const view = mount();
    view.unmount();
    expect(disconnected).toBe(1);
  });
});
