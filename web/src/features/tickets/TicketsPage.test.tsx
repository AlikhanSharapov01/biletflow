import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimTickets, listTickets } from "../../api/tickets";
import { deferred, makeIssuedTicket } from "../../../tests/helpers/fixtures";
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

  it("shows row skeletons while the first load runs, then the tickets", async () => {
    const pending = deferred<{ claimed: number }>();
    vi.mocked(claimTickets).mockReturnValue(pending.promise);
    vi.mocked(listTickets).mockResolvedValue([makeIssuedTicket({ id: "t1", event_title: "Jazz night" })]);
    const { container } = render(
      <MemoryRouter>
        <TicketsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading tickets…");
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(3);
    await act(async () => pending.resolve({ claimed: 0 }));
    expect(await screen.findByRole("link", { name: "Jazz night" })).toBeTruthy();
    expect(container.querySelector(".skeleton-card")).toBeNull();
  });
});
