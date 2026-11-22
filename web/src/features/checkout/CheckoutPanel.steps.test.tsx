import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { makeAuthValue, makeEvent, makeHold, makeOrder, makeProfile, makeTicketType } from "../../../tests/helpers/fixtures";
import { AuthContext } from "../auth/AuthContext";
import { CheckoutPanel } from "./CheckoutPanel";
import { useCheckoutFlow } from "./hooks/useCheckoutFlow";

vi.mock("./hooks/useCheckoutFlow", () => ({ useCheckoutFlow: vi.fn() }));
vi.mock("./components/PaymentStep", () => ({ PaymentStep: () => <p>payment form</p> }));

function flow(overrides: Record<string, unknown>) {
  vi.mocked(useCheckoutFlow).mockReturnValue({
    hold: null, order: null, recipients: {}, setRecipients: vi.fn(), busy: false, message: "", secondsLeft: 540, paid: false,
    reserve: vi.fn(), release: vi.fn(), confirm: vi.fn(), finished: vi.fn(), reset: vi.fn(), ...overrides,
  } as unknown as ReturnType<typeof useCheckoutFlow>);
}
function mount(event = makeEvent(), tickets = [makeTicketType()]) {
  render(
    <AuthContext.Provider value={makeAuthValue({ status: "authenticated", profile: makeProfile() })}>
      <MemoryRouter><CheckoutPanel event={event} tickets={tickets} /></MemoryRouter>
    </AuthContext.Provider>,
  );
}
const current = () => screen.getByRole("list", { name: "Checkout steps" }).querySelector("[aria-current=step]")?.textContent;

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

  it("shows paid events with a payment step before a hold", () => {
    flow({});
    mount(makeEvent(), [makeTicketType({ kind: "paid", price_minor: 5000 })]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Payment")).toBeTruthy();
  });

  it("shows steps and countdown together on the recipients step of a free hold", () => {
    flow({ hold: makeHold(), paid: false });
    mount();
    expect(current()).toBe("2Recipients");
    expect(screen.queryByText("Payment")).toBeNull();
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.getByRole("timer").textContent).toBe("Held for 9:00");
    expect(screen.getByRole("timer").parentElement).toBe(screen.getByRole("list", { name: "Checkout steps" }).parentElement);
  });

  it("shows steps and countdown on the payment step", () => {
    flow({ hold: makeHold(), order: makeOrder(), paid: true });
    mount();
    expect(current()).toBe("3Payment");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
  });
});
