import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmHold, createHold, releaseHold, startCheckout } from "../../../api/checkout";
import { ApiError } from "../../../api/errors";
import type { Profile, TicketType } from "../../../api/types";
import type { PromoPreview } from "../../../api/types/promo";
import { makeAllocation, makeEvent, makeHold, makeOrder, makePayment, makeProfile, makeTicketType } from "../../../../tests/helpers/fixtures";
import { useCheckoutFlow } from "./useCheckoutFlow";

vi.mock("../../../api/checkout", () => ({
  createHold: vi.fn(),
  releaseHold: vi.fn(),
  confirmHold: vi.fn(),
  startCheckout: vi.fn(),
}));

const createHoldMock = vi.mocked(createHold);
const releaseHoldMock = vi.mocked(releaseHold);
const confirmHoldMock = vi.mocked(confirmHold);
const startCheckoutMock = vi.mocked(startCheckout);

const event = makeEvent({ id: "e1" });
const free = makeTicketType({ id: "free" });
const paid = makeTicketType({ id: "paid", kind: "paid", price_minor: 500_000 });

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/events/e1"]}>{children}</MemoryRouter>;
}

function renderFlow(options: { tickets?: TicketType[]; profile?: Profile | null; promo?: PromoPreview | null } = {}) {
  const tickets = options.tickets ?? [free, paid];
  const profile = options.profile === undefined ? makeProfile() : options.profile;
  const promo = options.promo ?? null;
  return renderHook(() => ({ flow: useCheckoutFlow(event, tickets, profile, promo), location: useLocation() }), { wrapper });
}

afterEach(() => {
  vi.useRealTimers();
  createHoldMock.mockReset();
  releaseHoldMock.mockReset();
  confirmHoldMock.mockReset();
  startCheckoutMock.mockReset();
});

describe("useCheckoutFlow reserve", () => {
  it("does nothing for a visitor without a profile", async () => {
    const { result } = renderFlow({ profile: null });
    await act(() => result.current.flow.reserve([{ ticket_type_id: "free", quantity: 1 }]));
    expect(createHoldMock).not.toHaveBeenCalled();
    expect(result.current.flow.hold).toBeNull();
  });

  it("asks for at least one ticket before calling the API", async () => {
    const { result } = renderFlow();
    await act(() => result.current.flow.reserve([]));
    expect(result.current.flow.message).toBe("Choose at least one ticket.");
    expect(createHoldMock).not.toHaveBeenCalled();
  });

  it("creates a hold and pre-fills the buyer as the first recipient", async () => {
    const hold = makeHold({ allocations: [makeAllocation({ id: "a1", ticket_type_id: "free" }), makeAllocation({ id: "a2", ticket_type_id: "free" })] });
    createHoldMock.mockResolvedValue(hold);
    const { result } = renderFlow();

    await act(() => result.current.flow.reserve([{ ticket_type_id: "free", quantity: 2 }]));

    expect(createHoldMock).toHaveBeenCalledWith("e1", [{ ticket_type_id: "free", quantity: 2 }], undefined);
    expect(result.current.flow.hold).toBe(hold);
    expect(result.current.flow.recipients).toEqual({
      a1: { name: "Aida Sarsen", email: "aida@example.com" },
      a2: { name: "", email: "" },
    });
    expect(result.current.flow.paid).toBe(false);
    expect(result.current.flow.busy).toBe(false);
  });

  it("sends an accepted promo code with the hold", async () => {
    createHoldMock.mockResolvedValue(makeHold());
    const promo: PromoPreview = { event_id: "e1", code: "SPRING", discount_kind: "percent", discount_value: 10, eligible_ticket_type_ids: [], valid_until: "2099-12-31T00:00:00Z" };
    const { result } = renderFlow({ promo });
    await act(() => result.current.flow.reserve([{ ticket_type_id: "paid", quantity: 1 }]));
    expect(createHoldMock).toHaveBeenCalledWith("e1", [{ ticket_type_id: "paid", quantity: 1 }], "SPRING");
  });

  it("shows the API error and keeps the selection step", async () => {
    createHoldMock.mockRejectedValue(new ApiError("Not enough places are left for that selection.", 409, "event_capacity_exceeded"));
    const { result } = renderFlow();
    await act(() => result.current.flow.reserve([{ ticket_type_id: "free", quantity: 5 }]));
    expect(result.current.flow.message).toBe("Not enough places are left for that selection.");
    expect(result.current.flow.hold).toBeNull();
    expect(result.current.flow.busy).toBe(false);
  });
});

describe("useCheckoutFlow confirm", () => {
  async function held(allocations = [makeAllocation({ id: "a1", ticket_type_id: "free" })]) {
    const payable = allocations.some((item) => item.ticket_type_id === "paid") ? 500_000 : 0;
    createHoldMock.mockResolvedValue(makeHold({ id: "h1", allocations,
      pricing: { gross: payable, discount: 0, subtotal: payable, processing_fee: 0, payable, lines: [] },
    }));
    const rendered = renderFlow();
    await act(() => rendered.result.current.flow.reserve([{ ticket_type_id: allocations[0]!.ticket_type_id, quantity: allocations.length }]));
    return rendered;
  }

  it("refuses incomplete recipients without calling the API", async () => {
    const { result } = await held([makeAllocation({ id: "a1", ticket_type_id: "free" }), makeAllocation({ id: "a2", ticket_type_id: "free" })]);
    await act(() => result.current.flow.confirm());
    expect(result.current.flow.message).toBe("Enter a name and a valid email for every ticket.");
    expect(confirmHoldMock).not.toHaveBeenCalled();
    expect(startCheckoutMock).not.toHaveBeenCalled();
  });

  it("confirms a free basket with normalised recipients and opens the order", async () => {
    const { result } = await held();
    act(() => result.current.flow.setRecipients({ a1: { name: "  Aida  ", email: " AIDA@Example.com " } }));
    confirmHoldMock.mockResolvedValue(makeOrder({ id: "order/1", status: "confirmed" }));

    await act(() => result.current.flow.confirm());

    expect(confirmHoldMock).toHaveBeenCalledWith("h1", [{ allocation_id: "a1", name: "Aida", email: "aida@example.com" }]);
    expect(startCheckoutMock).not.toHaveBeenCalled();
    expect(result.current.location.pathname).toBe("/orders/order%2F1");
  });

  it("starts a paid checkout and stays on the payment step while pending", async () => {
    const { result } = await held([makeAllocation({ id: "a1", ticket_type_id: "paid" })]);
    expect(result.current.flow.paid).toBe(true);
    const pending = makeOrder({ id: "o2", status: "pending", payable_minor: 500_000, payment: makePayment({ status: "created" }) });
    startCheckoutMock.mockResolvedValue(pending);

    await act(() => result.current.flow.confirm());

    expect(startCheckoutMock).toHaveBeenCalledWith("h1", [{ allocation_id: "a1", name: "Aida Sarsen", email: "aida@example.com" }]);
    expect(confirmHoldMock).not.toHaveBeenCalled();
    expect(result.current.flow.order).toBe(pending);
    expect(result.current.flow.busy).toBe(false);
    expect(result.current.location.pathname).toBe("/events/e1");
  });

  it("confirms a paid ticket discounted to zero without starting a payment", async () => {
    createHoldMock.mockResolvedValue(makeHold({
      allocations: [makeAllocation({ id: "a1", ticket_type_id: "paid" })],
      pricing: { gross: 500_000, discount: 500_000, subtotal: 0, processing_fee: 0, payable: 0, lines: [] },
      promo: { code: "FREE100", campaign_id: "c1", discount_kind: "percent", discount_value: 100 },
    }));
    confirmHoldMock.mockResolvedValue(makeOrder({ id: "zero-order", status: "confirmed" }));
    const { result } = renderFlow();
    await act(() => result.current.flow.reserve([{ ticket_type_id: "paid", quantity: 1 }]));
    expect(result.current.flow.paid).toBe(false);
    await act(() => result.current.flow.confirm());
    expect(startCheckoutMock).not.toHaveBeenCalled();
    expect(confirmHoldMock).toHaveBeenCalled();
    expect(result.current.location.pathname).toBe("/orders/zero-order");
  });

  it("starts over when the promo needs a new quote", async () => {
    const { result } = await held();
    confirmHoldMock.mockRejectedValue(new ApiError("The promo changed. Choose your tickets again for a new price.", 409, "promo_requote_required"));
    await act(() => result.current.flow.confirm());
    expect(result.current.flow.hold).toBeNull();
    expect(result.current.flow.message).toBe("The promo changed. Choose your tickets again for a new price.");
    expect(result.current.flow.busy).toBe(false);
  });

  it("keeps the hold and shows other confirmation errors", async () => {
    const { result } = await held();
    confirmHoldMock.mockRejectedValue(new ApiError("One of the selected seats is no longer available.", 409, "seat_unavailable"));
    await act(() => result.current.flow.confirm());
    expect(result.current.flow.hold).not.toBeNull();
    expect(result.current.flow.message).toBe("One of the selected seats is no longer available.");
    expect(result.current.flow.busy).toBe(false);
  });

  it("does nothing without a hold", async () => {
    const { result } = renderFlow();
    await act(() => result.current.flow.confirm());
    expect(confirmHoldMock).not.toHaveBeenCalled();
    expect(result.current.flow.message).toBe("");
  });
});

describe("useCheckoutFlow release and expiry", () => {
  it("releases the hold and resets even when the release call fails", async () => {
    createHoldMock.mockResolvedValue(makeHold({ id: "h9" }));
    releaseHoldMock.mockRejectedValue(new ApiError("gone", 404, "hold_not_found"));
    const { result } = renderFlow();
    await act(() => result.current.flow.reserve([{ ticket_type_id: "free", quantity: 1 }]));

    await act(() => result.current.flow.release());

    expect(releaseHoldMock).toHaveBeenCalledWith("h9");
    expect(result.current.flow.hold).toBeNull();
    expect(result.current.flow.message).toBe("");
  });

  it("drops the hold with a message once the countdown reaches zero", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    createHoldMock.mockResolvedValue(makeHold({ expires_at: "2026-11-01T12:00:03Z" }));
    const { result } = renderFlow();
    await act(() => result.current.flow.reserve([{ ticket_type_id: "free", quantity: 1 }]));
    expect(result.current.flow.hold).not.toBeNull();
    expect(result.current.flow.secondsLeft).toBe(3);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.flow.hold).not.toBeNull();

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.flow.hold).toBeNull();
    expect(result.current.flow.message).toBe("Your reservation expired. Choose your tickets again.");
  });

  it("does not expire a freshly created ten-minute hold", async () => {
    createHoldMock.mockResolvedValue(makeHold({ expires_at: new Date(Date.now() + 600_000).toISOString() }));
    const { result } = renderFlow();
    await act(() => result.current.flow.reserve([{ ticket_type_id: "free", quantity: 1 }]));
    expect(result.current.flow.hold).not.toBeNull();
    expect(result.current.flow.message).toBe("");
    expect(result.current.flow.secondsLeft).toBeGreaterThan(590);
  });
});
