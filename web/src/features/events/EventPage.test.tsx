import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEvent, listCategories, listTicketTypes, listVenues } from "../../api/catalog";
import { makeAuthValue, makeEvent, makeTicketType } from "../../../tests/helpers/fixtures";
import { AuthContext } from "../auth/AuthContext";
import { EventPage } from "./EventPage";

vi.mock("../../api/catalog", () => ({ getEvent: vi.fn(), listCategories: vi.fn(), listTicketTypes: vi.fn(), listVenues: vi.fn() }));
afterEach(() => vi.clearAllMocks());

function mount(event = makeEvent(), tickets = [makeTicketType()]) {
  vi.mocked(getEvent).mockResolvedValue(event);
  vi.mocked(listTicketTypes).mockResolvedValue(tickets);
  vi.mocked(listCategories).mockResolvedValue([]);
  vi.mocked(listVenues).mockResolvedValue([]);
  render(
    <AuthContext.Provider value={makeAuthValue()}>
      <MemoryRouter initialEntries={["/events/e1"]}>
        <Routes><Route path="/events/:eventId" element={<EventPage />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("EventPage Get tickets bar", () => {
  it("appears with the tickets heading as its target once the event has loaded", async () => {
    mount();
    expect(document.querySelector(".get-tickets-bar")).toBeNull();
    await screen.findByRole("button", { name: "Get tickets" });
    const heading = screen.getByRole("heading", { name: "Tickets" });
    expect(heading.id).toBe("tickets");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.closest("#tickets-section")).not.toBeNull();
  });

  it("is absent for a sold out event", async () => {
    mount(makeEvent({ sold_out: true }));
    await screen.findByRole("heading", { name: "Tickets" });
    expect(document.querySelector(".get-tickets-bar")).toBeNull();
  });
});
