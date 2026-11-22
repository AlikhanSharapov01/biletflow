import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { listOrders } from "../../api/orders";
import type { Order } from "../../api/types";
import { deferred, makeIssuedTicket, makeOrder, makeOrderItem, makePayment } from "../../../tests/helpers/fixtures";
import { OrdersPage } from "./OrdersPage";

vi.mock("../../api/orders", () => ({ listOrders: vi.fn() }));
const listOrdersMock = vi.mocked(listOrders);

const ticket = (title: string) => makeIssuedTicket({ event_title: title });

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

afterEach(() => listOrdersMock.mockReset());

describe("OrdersPage", () => {
  it("shows a loading state while orders load", async () => {
    const pending = deferred<Order[]>();
    listOrdersMock.mockReturnValue(pending.promise);
    renderPage();
    expect(screen.getByRole("status").textContent).toBe("Loading orders…");
    expect(document.querySelectorAll(".skeleton-row")).toHaveLength(3);
    await act(async () => pending.resolve([]));
    expect(screen.queryByText("Loading orders…")).toBeNull();
  });

  it("invites the user to find an event when there are no orders", async () => {
    listOrdersMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No orders yet\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find an event" }).getAttribute("href")).toBe("/discover");
  });

  it("lists free and paid orders with their status and a link", async () => {
    listOrdersMock.mockResolvedValue([
      makeOrder({ id: "free-1", status: "confirmed", items: [makeOrderItem({ ticket: ticket("Jazz night") })] }),
      makeOrder({
        id: "paid/2",
        status: "pending",
        payable_minor: 1_000_000,
        payment: makePayment({ status: "failed" }),
        items: [makeOrderItem({ id: "a" }), makeOrderItem({ id: "b" })],
      }),
    ]);
    renderPage();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);

    const free = within(cards[0]!);
    expect(free.getByRole("link", { name: "Jazz night" }).getAttribute("href")).toBe("/orders/free-1");
    expect(free.getByText(/^1 ticket · Free · placed /)).toBeTruthy();
    expect(free.getByText("confirmed").className).toBe("status positive");
    expect(free.queryByText("Payment failed")).toBeNull();

    const paid = within(cards[1]!);
    // A pending order has no issued ticket yet, so the title falls back.
    expect(paid.getByRole("link", { name: "Event" }).getAttribute("href")).toBe("/orders/paid%2F2");
    expect(paid.getByText(/^2 tickets · ₸10,000\.00 · placed /)).toBeTruthy();
    expect(paid.getByText("Payment failed")).toBeTruthy();
    expect(paid.getByText("pending").className).toBe("status pending");
    // The title is each card's only link.
    expect(within(cards[0]!).getAllByRole("link")).toHaveLength(1);
    expect(paid.getAllByRole("link")).toHaveLength(1);
  });

  it("shows the error and retries", async () => {
    listOrdersMock.mockRejectedValueOnce(new ApiError("Can’t reach BiletFlow right now. Check that the API is running and try again.", 0, "network")).mockResolvedValueOnce([]);
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your orders.");
    expect(alert.textContent).toContain("Can’t reach BiletFlow right now.");

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No orders yet\./)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(listOrdersMock).toHaveBeenCalledTimes(2);
  });
});
