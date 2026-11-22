import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimTickets, listTickets } from "../../api/tickets";
import { makeIssuedTicket } from "../../../tests/helpers/fixtures";
import { TicketsPage } from "./TicketsPage";

vi.mock("../../api/tickets", () => ({ claimTickets: vi.fn(), listTickets: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe("TicketsPage", () => {
  it("shows one link per ticket card, named by the event title, with its status", async () => {
    vi.mocked(claimTickets).mockResolvedValue({ claimed: 0 });
    vi.mocked(listTickets).mockResolvedValue([makeIssuedTicket({ id: "t/1", event_title: "Jazz night" }), makeIssuedTicket({ id: "t2", event_title: "Book fair" })]);
    render(
      <MemoryRouter>
        <TicketsPage />
      </MemoryRouter>,
    );
    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getAllByRole("link")).toHaveLength(1);
    expect(first.getByRole("link", { name: "Jazz night" }).getAttribute("href")).toBe("/tickets/t%2F1");
    expect(first.getByText("valid")).toBeTruthy();
    expect(within(cards[1]!).getAllByRole("link")).toHaveLength(1);
    expect(first.getByRole("link", { name: "Jazz night" }).closest(".event-card")!.classList.contains("event-card-linked")).toBe(true);
    // The cue is visual only; it is not a second link or part of the name.
    expect(first.queryByRole("link", { name: /Show QR/ })).toBeNull();
  });
});
