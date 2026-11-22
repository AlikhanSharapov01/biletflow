import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent, makeTicketType } from "../../../../tests/helpers/fixtures";
import { GetTicketsBar } from "./GetTicketsBar";

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observed: Element[] = [];
let report: Callback = () => {};
let disconnected = 0;

class FakeObserver {
  constructor(callback: Callback) {
    report = callback;
  }
  observe(target: Element) {
    observed.push(target);
  }
  disconnect() {
    disconnected += 1;
  }
}

function mount(event = makeEvent(), tickets = [makeTicketType()]) {
  return render(
    <>
      <GetTicketsBar event={event} tickets={tickets} />
      <section id="tickets-section">
        <h2 id="tickets" tabIndex={-1}>Tickets</h2>
      </section>
    </>,
  );
}

const scrollIntoView = vi.fn();
const bar = () => document.querySelector(".get-tickets-bar")!;

beforeEach(() => {
  observed = [];
  disconnected = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false })) as never;
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GetTicketsBar", () => {
  it("shows the offer and a button for a buyable event", () => {
    mount();
    expect(screen.getByRole("button", { name: "Get tickets" })).toBeTruthy();
    expect(bar().textContent).toContain("Free");
  });

  it.each([
    ["unpublished", makeEvent({ publication_state: "unpublished" }), [makeTicketType()]],
    ["draft", makeEvent({ publication_state: "draft" }), [makeTicketType()]],
    ["completed", makeEvent({ time_status: "completed" }), [makeTicketType()]],
    ["sold out", makeEvent({ sold_out: true }), [makeTicketType()]],
    ["without visible ticket types", makeEvent(), []],
  ])("renders nothing for an event that is %s", (_name, event, tickets) => {
    mount(event, tickets);
    expect(document.querySelector(".get-tickets-bar")).toBeNull();
  });

  it("scrolls the tickets section into view and focuses its heading", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Get tickets" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(document.getElementById("tickets"));
  });

  it("scrolls without animation when reduced motion is preferred", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true })) as never;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Get tickets" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("hides while the tickets section is on screen and returns when it leaves", () => {
    mount();
    expect(observed).toEqual([document.getElementById("tickets-section")]);
    expect(bar().hasAttribute("data-hidden")).toBe(false);
    act(() => report([{ isIntersecting: true }]));
    expect(bar().hasAttribute("data-hidden")).toBe(true);
    act(() => report([{ isIntersecting: false }]));
    expect(bar().hasAttribute("data-hidden")).toBe(false);
  });

  it("takes the hidden bar out of the tab order", () => {
    mount();
    act(() => report([{ isIntersecting: true }]));
    expect(bar().getAttribute("aria-hidden")).toBe("true");
    expect(bar().hasAttribute("inert")).toBe(true);
  });

  it("stays visible when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    mount();
    expect(bar().hasAttribute("data-hidden")).toBe(false);
  });

  it("stops observing when it unmounts", () => {
    const view = mount();
    view.unmount();
    expect(disconnected).toBe(1);
  });
});
