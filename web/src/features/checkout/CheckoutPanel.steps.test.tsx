import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { makeAuthValue, makeEvent, makeHold, makeOrder, makePayment, makeProfile, makeTicketType } from "../../../tests/helpers/fixtures";
import { AuthContext } from "../auth/AuthContext";
import { CheckoutPanel } from "./CheckoutPanel";
import { useCheckoutFlow } from "./hooks/useCheckoutFlow";

vi.mock("./hooks/useCheckoutFlow", () => ({ useCheckoutFlow: vi.fn() }));

function flow(overrides: Partial<ReturnType<typeof useCheckoutFlow>>) {
  vi.mocked(useCheckoutFlow).mockReturnValue({
    hold: null, order: null, recipients: {}, setRecipients: vi.fn(), busy: false, expired: false, message: "", secondsLeft: 540, paid: false,
    reserve: vi.fn(), release: vi.fn(), confirm: vi.fn(), finished: vi.fn(), reset: vi.fn(), ...overrides,
  } as ReturnType<typeof useCheckoutFlow>);
}
const paidType = makeTicketType({ id: "p1", name: "Premium", kind: "paid", price_minor: 5000 });
const freeType = makeTicketType({ id: "f1", name: "Free pass" });

function mount(event = makeEvent(), tickets = [freeType]) {
  const tree = () => (
    <AuthContext.Provider value={makeAuthValue({ status: "authenticated", profile: makeProfile() })}>
      <MemoryRouter><CheckoutPanel event={event} tickets={tickets} /></MemoryRouter>
    </AuthContext.Provider>
  );
  const view = render(tree());
  return { container: view.container, rerender: () => view.rerender(tree()) };
}
const list = () => screen.getByRole("list", { name: "Checkout steps" });
const items = () => within(list()).getAllByRole("listitem");
const current = () => list().querySelector("[aria-current=step]")?.textContent;

describe("CheckoutPanel steps", () => {
  it("shows the tickets step without a countdown before a hold", () => {
    flow({});
    mount();
    expect(current()).toBe("1Tickets");
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("shows seats for assigned events", () => {
    flow({});
    mount(makeEvent({ seating_mode: "assigned" }));
    expect(current()).toBe("1Seats");
  });

  it("lists two steps for a free event before a hold", () => {
    flow({});
    mount();
    expect(items()).toHaveLength(2);
  });

  it("adds the payment step once a paid ticket is selected", () => {
    flow({});
    mount(makeEvent(), [freeType, paidType]);
    fireEvent.change(screen.getByLabelText("Quantity for Free pass"), { target: { value: "1" } });
    expect(items()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Quantity for Premium"), { target: { value: "1" } });
    expect(items()).toHaveLength(3);
  });

  it("shows steps and countdown together on the recipients step of a free hold", () => {
    flow({ hold: makeHold(), paid: false });
    mount();
    expect(current()).toBe("2Recipients");
    expect(items()).toHaveLength(2);
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.getByRole("timer").textContent).toBe("Held for 9:00");
    expect(screen.getByRole("timer").parentElement).toBe(list().parentElement);
  });

  it("shows a paid hold's recipients step with Tickets completed", () => {
    flow({ hold: makeHold(), paid: true });
    mount(makeEvent(), [paidType]);
    expect(items()).toHaveLength(3);
    expect(within(items()[0]!).getByText("step completed")).toBeTruthy();
    expect(current()).toBe("2Recipients");
  });

  it("shows one countdown, the hold's, on the real payment step", () => {
    flow({ hold: makeHold(), order: makeOrder({ status: "pending", confirmed_at: null, payment: makePayment({ status: "pending" }) }), paid: true });
    mount(makeEvent(), [paidType]);
    expect(current()).toBe("3Payment");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.queryByText(/Price held for/)).toBeNull();
  });

  it("keeps one status region across expiry so the notice is spoken", () => {
    flow({ hold: makeHold(), secondsLeft: 1 });
    const view = mount();
    const status = view.container.querySelector(".checkout-progress [role=status]")!;
    expect(status.textContent).toBe("Less than 1 minute left on your reservation");
    flow({ hold: null, secondsLeft: 0, expired: true });
    view.rerender();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(status.isConnected).toBe(true);
    expect(status.textContent).toBe("Your reservation expired. Choose your tickets again.");
  });

  it("does not move focus on the first render", () => {
    flow({});
    const view = mount();
    expect(document.activeElement).toBe(document.body);
    expect(view.container.querySelector(".checkout-progress [role=status]")!.textContent).toBe("");
  });

  // The focused item's name already says the step, so the status region stays quiet
  // and the step is spoken once.
  it("focuses the new step in the indicator without repeating it in the status region", () => {
    flow({});
    const view = mount(makeEvent(), [paidType]);
    flow({ hold: makeHold(), paid: true });
    view.rerender();
    expect(document.activeElement).toBe(screen.getByRole("listitem", { name: "Step 2 of 3: Recipients" }));
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement?.getAttribute("aria-current")).toBe("step");
    expect(view.container.querySelector(".checkout-progress [role=status]")!.textContent).toBe("");
    flow({ hold: makeHold(), order: makeOrder({ status: "pending", confirmed_at: null, payment: makePayment({ status: "pending" }) }), paid: true });
    view.rerender();
    expect(document.activeElement).toBe(screen.getByRole("listitem", { name: "Step 3 of 3: Payment" }));
    expect(view.container.querySelector(".checkout-progress [role=status]")!.textContent).toBe("");
  });

  it("announces the step in the status region when focus could not move", () => {
    flow({});
    const view = mount(makeEvent(), [paidType]);
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
    flow({ hold: makeHold(), paid: true });
    view.rerender();
    expect(view.container.querySelector(".checkout-progress [role=status]")!.textContent).toBe("Step 2 of 3: Recipients");
    focus.mockRestore();
  });

  it("counts two steps for a free basket", () => {
    flow({});
    const view = mount();
    flow({ hold: makeHold(), paid: false });
    view.rerender();
    expect(document.activeElement).toBe(screen.getByRole("listitem", { name: "Step 2 of 2: Recipients" }));
  });
});
