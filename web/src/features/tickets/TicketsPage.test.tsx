import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimTickets, listTickets } from "../../api/tickets";
import type { IssuedTicket } from "../../api/types";
import { TicketsPage } from "./TicketsPage";

vi.mock("../../api/tickets", () => ({ claimTickets: vi.fn(), listTickets: vi.fn() }));

const ticket = (id: string, title: string): IssuedTicket => ({
  id,
  order_item_id: "i",
  event_id: "e1",
  event_title: title,
  event_starts_at: "2026-11-01T18:00:00Z",
  venue_name: "Hall",
  ticket_type_name: "General",
  recipient_name: "Aida",
  seat_snapshot: null,
  status: "valid",
  recipient_user_id: "u1",
  claimed_at: null,
  issued_at: "2026-10-26T12:00:00Z",
  qr_payload: null,
});

afterEach(() => vi.resetAllMocks());

describe("TicketsPage", () => {
  it("shows one link per ticket card, named by the event title, with its status", async () => {
    vi.mocked(claimTickets).mockResolvedValue({ claimed: 0 });
    vi.mocked(listTickets).mockResolvedValue([ticket("t/1", "Jazz night"), ticket("t2", "Book fair")]);
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
    expect(screen.queryByText(/Show QR/)).toBeNull();
  });
});
