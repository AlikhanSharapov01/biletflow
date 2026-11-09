import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/errors";
import { previewPromo } from "../../../api/promo";
import type { EventView, TicketType } from "../../../api/types";
import type { PromoPreview } from "../../../api/types/promo";
import { deferred, makeAllocation, makeEvent, makeHold, makeOrder, makeTicketType } from "../../../../tests/helpers/fixtures";
import type { Quantities, RecipientValues } from "../utils/checkout";
import { readStashedPromo } from "../utils/promo";
import { HoldCountdown } from "./HoldCountdown";
import { PriceSummary } from "./PriceSummary";
import { PromoCodeField } from "./PromoCodeField";
import { RecipientForm } from "./RecipientForm";
import { TicketSelector } from "./TicketSelector";

vi.mock("../../../api/promo", () => ({ previewPromo: vi.fn() }));
const previewPromoMock = vi.mocked(previewPromo);

function button(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("HoldCountdown", () => {
  it("shows the time left as a timer and flags the last minute", () => {
    const { rerender } = render(<HoldCountdown secondsLeft={65} />);
    const timer = screen.getByRole("timer");
    expect(timer.textContent).toBe("Held for 1:05");
    expect(timer.className).not.toContain("urgent");

    rerender(<HoldCountdown secondsLeft={59} />);
    expect(screen.getByRole("timer").className).toContain("urgent");
    rerender(<HoldCountdown secondsLeft={-3} />);
    expect(screen.getByRole("timer").textContent).toBe("Held for 0:00");
  });
});

describe("PriceSummary", () => {
  function row(label: string): string | null | undefined {
    return screen.queryByText(label)?.nextElementSibling?.textContent;
  }

  it("shows subtotal, fee and total from the server quote", () => {
    render(<PriceSummary order={makeOrder({ gross_minor: 1_000_000, discount_minor: 0, processing_fee_minor: 30_000, payable_minor: 1_000_000 })} />);
    expect(row("Subtotal")).toBe("₸10,000.00");
    expect(screen.queryByText("Discount")).toBeNull();
    expect(row("Processing fee")).toBe("₸300.00 · included");
    expect(row("Total")).toBe("₸10,000.00 KZT");
  });

  it("shows a discount line only when there is one, and no fee as None", () => {
    render(<PriceSummary order={makeOrder({ gross_minor: 1_000_000, discount_minor: 100_000, processing_fee_minor: 0, payable_minor: 900_000 })} />);
    expect(row("Discount")).toBe("−₸1,000.00");
    expect(row("Processing fee")).toBe("None");
    expect(row("Total")).toBe("₸9,000.00 KZT");
  });
});

describe("TicketSelector", () => {
  const event = makeEvent();
  const free = makeTicketType({ id: "free", name: "General", per_order_limit: 3, quantity_limit: 20 });
  const paid = makeTicketType({ id: "paid", name: "VIP", kind: "paid", price_minor: 500_000, per_order_limit: 4, quantity_limit: 2 });
  const closed = makeTicketType({ id: "closed", name: "Early bird", sales_close_at: "2001-01-01T00:00:00Z" });

  function Harness(props: { event?: EventView; tickets?: TicketType[]; busy?: boolean; message?: string; promo?: PromoPreview | null; onReserve?: () => void }) {
    const [quantities, setQuantities] = useState<Quantities>({});
    return (
      <TicketSelector
        event={props.event ?? event}
        tickets={props.tickets ?? [free, paid, closed]}
        quantities={quantities}
        setQuantities={setQuantities}
        busy={props.busy ?? false}
        message={props.message ?? ""}
        promo={props.promo ?? null}
        onReserve={props.onReserve ?? vi.fn()}
      />
    );
  }

  function quantity(name: string): HTMLSelectElement {
    return screen.getByLabelText(`Quantity for ${name}`) as HTMLSelectElement;
  }

  it("offers quantities up to the per-order and inventory limits", () => {
    render(<Harness />);
    expect([...quantity("General").options].map((option) => option.value)).toEqual(["0", "1", "2", "3"]);
    expect([...quantity("VIP").options].map((option) => option.value)).toEqual(["0", "1", "2"]);
  });

  it("marks closed types unavailable and paid types as a demonstration payment", () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Quantity for Early bird")).toBeNull();
    expect(screen.getByText("Sales closed")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/demonstration payment, no real money moves/)).toBeTruthy();
  });

  it("offers nothing before the event is published", () => {
    render(<Harness event={makeEvent({ publication_state: "draft" })} tickets={[free]} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Registration opens when the event is published")).toBeTruthy();
  });

  it("counts the selected tickets on the reserve button", () => {
    const onReserve = vi.fn();
    render(<Harness onReserve={onReserve} />);
    expect(button("Reserve tickets").disabled).toBe(true);

    fireEvent.change(quantity("General"), { target: { value: "1" } });
    expect(button("Reserve 1 ticket").disabled).toBe(false);
    fireEvent.change(quantity("VIP"), { target: { value: "2" } });
    fireEvent.click(button("Reserve 3 tickets"));
    expect(onReserve).toHaveBeenCalledTimes(1);
  });

  it("disables reserving while busy and shows the server message", () => {
    render(<Harness busy message="Not enough places are left for that selection." />);
    expect(button("Reserving…").disabled).toBe(true);
    expect(screen.getByText("Not enough places are left for that selection.")).toBeTruthy();
  });

  it("estimates the promo discount only on eligible paid types", () => {
    const promo: PromoPreview = { event_id: "e1", code: "VIP10", discount_kind: "percent", discount_value: 10, eligible_ticket_type_ids: ["paid"], valid_until: "2099-12-31T00:00:00Z" };
    render(<Harness promo={promo} />);
    expect(screen.getAllByText(/Promo: about/)).toHaveLength(1);
    expect(screen.getByText("Promo: about ₸500.00 off each")).toBeTruthy();
  });
});

describe("PromoCodeField", () => {
  const preview: PromoPreview = { event_id: "e1", code: "SPRING10", discount_kind: "percent", discount_value: 10, eligible_ticket_type_ids: [], valid_until: "2099-12-31T00:00:00Z" };

  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => previewPromoMock.mockReset());

  function Harness({ initialCode = "", onApplied = vi.fn() }: { initialCode?: string; onApplied?: (preview: PromoPreview | null) => void }) {
    const [applied, setApplied] = useState<PromoPreview | null>(null);
    return (
      <PromoCodeField
        eventId="e1"
        initialCode={initialCode}
        applied={applied}
        onApplied={(next) => {
          onApplied(next);
          setApplied(next);
        }}
      />
    );
  }

  function input(): HTMLInputElement {
    return screen.getByRole("textbox") as HTMLInputElement;
  }

  it("needs a code before it can apply", () => {
    render(<Harness />);
    expect(button("Apply").disabled).toBe(true);
    fireEvent.change(input(), { target: { value: "   " } });
    expect(button("Apply").disabled).toBe(true);
  });

  it("normalises and checks the code, then locks the field and remembers it", async () => {
    const onApplied = vi.fn();
    const pending = deferred<PromoPreview>();
    previewPromoMock.mockReturnValue(pending.promise);
    render(<Harness onApplied={onApplied} />);

    fireEvent.change(input(), { target: { value: " spring 10 " } });
    fireEvent.click(button("Apply"));
    expect(previewPromoMock).toHaveBeenCalledWith("e1", "SPRING10");
    expect(button("Checking…").disabled).toBe(true);

    await act(async () => pending.resolve(preview));
    expect(onApplied).toHaveBeenLastCalledWith(preview);
    expect(screen.getByRole("status").textContent).toBe("SPRING10: 10% off every ticket");
    expect(input().disabled).toBe(true);
    expect(readStashedPromo("e1")).toBe("SPRING10");
  });

  it("removes an applied code and forgets it", async () => {
    previewPromoMock.mockResolvedValue(preview);
    const onApplied = vi.fn();
    render(<Harness onApplied={onApplied} />);
    fireEvent.change(input(), { target: { value: "spring10" } });
    fireEvent.click(button("Apply"));
    await screen.findByRole("button", { name: "Remove" });

    fireEvent.click(button("Remove"));
    expect(onApplied).toHaveBeenLastCalledWith(null);
    expect(input().value).toBe("");
    expect(input().disabled).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(readStashedPromo("e1")).toBe("");
  });

  it("reports a missing promo as an error rather than a planned feature", async () => {
    previewPromoMock.mockRejectedValue(new ApiError("This item could not be found.", 404));
    const onApplied = vi.fn();
    render(<Harness onApplied={onApplied} />);
    fireEvent.change(input(), { target: { value: "x" } });
    fireEvent.click(button("Apply"));
    expect((await screen.findByRole("status")).textContent).toBe("This item could not be found.");
    expect(onApplied).toHaveBeenLastCalledWith(null);
    expect(input().disabled).toBe(false);
  });

  it("shows the reason a code was rejected", async () => {
    previewPromoMock.mockRejectedValue(new ApiError("That promo code has expired.", 409, "promo_expired"));
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "old" } });
    fireEvent.click(button("Apply"));
    const note = await screen.findByRole("status");
    expect(note.textContent).toBe("That promo code has expired.");
    expect(note.className).toContain("error");
  });

  it("checks a code from the link once on load", async () => {
    previewPromoMock.mockResolvedValue(preview);
    const { rerender } = render(<Harness initialCode="SPRING10" />);
    await screen.findByRole("button", { name: "Remove" });
    rerender(<Harness initialCode="SPRING10" />);
    expect(previewPromoMock).toHaveBeenCalledTimes(1);
  });
});

describe("RecipientForm", () => {
  const hold = makeHold({
    allocations: [makeAllocation({ id: "a1", ticket_type_id: "t1" }), makeAllocation({ id: "a2", ticket_type_id: "t2" })],
  });
  const names: Record<string, string> = { t1: "General", t2: "VIP" };

  function Harness(props: { paid?: boolean; busy?: boolean; message?: string; onConfirm?: () => void; onRelease?: () => void; onChange?: (values: RecipientValues) => void }) {
    const [recipients, setRecipients] = useState<RecipientValues>({ a1: { name: "Aida", email: "aida@example.com" } });
    props.onChange?.(recipients);
    return (
      <RecipientForm
        hold={{ ...hold, pricing: { gross: props.paid ? 1_500_000 : 0, discount: 0, subtotal: props.paid ? 1_500_000 : 0, processing_fee: 0, payable: props.paid ? 1_500_000 : 0, lines: [] } }}
        typeName={(id) => names[id] ?? id}
        recipients={recipients}
        setRecipients={setRecipients}
        secondsLeft={300}
        busy={props.busy ?? false}
        message={props.message ?? ""}
        paid={props.paid ?? false}
        subtotalMinor={1_500_000}
        onConfirm={props.onConfirm ?? vi.fn()}
        onRelease={props.onRelease ?? vi.fn()}
      />
    );
  }

  it("asks for a name and email per held place", () => {
    render(<Harness />);
    const groups = screen.getAllByRole("group");
    expect(groups.map((group) => group.querySelector("legend")?.textContent)).toEqual(["Ticket 1 · General", "Ticket 2 · VIP"]);
    expect((within(groups[0]!).getByLabelText("Name") as HTMLInputElement).value).toBe("Aida");
    expect((within(groups[1]!).getByLabelText("Email") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("timer").textContent).toBe("Held for 5:00");
  });

  it("updates only the edited recipient", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const second = screen.getAllByRole("group")[1]!;
    fireEvent.change(within(second).getByLabelText("Name"), { target: { value: "Dana" } });
    fireEvent.change(within(second).getByLabelText("Email"), { target: { value: "dana@example.com" } });
    expect(onChange).toHaveBeenLastCalledWith({
      a1: { name: "Aida", email: "aida@example.com" },
      a2: { name: "Dana", email: "dana@example.com" },
    });
  });

  it("confirms a free registration or goes back", () => {
    const onConfirm = vi.fn();
    const onRelease = vi.fn();
    render(<Harness onConfirm={onConfirm} onRelease={onRelease} />);
    expect(screen.queryByText(/Ticket subtotal/)).toBeNull();
    fireEvent.click(button("Confirm registration"));
    fireEvent.click(button("Choose again"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("continues a paid basket to payment with the subtotal", () => {
    render(<Harness paid />);
    expect(screen.getByText("Subtotal").nextElementSibling?.textContent).toBe("₸15,000.00");
    expect(button("Continue to payment")).toBeTruthy();
  });

  it("locks both actions while busy", () => {
    const { unmount } = render(<Harness busy paid message="Each reserved place needs exactly one recipient." />);
    expect(button("Preparing payment…").disabled).toBe(true);
    expect(button("Choose again").disabled).toBe(true);
    expect(screen.getByText("Each reserved place needs exactly one recipient.")).toBeTruthy();
    unmount();
    render(<Harness busy />);
    expect(button("Confirming…").disabled).toBe(true);
  });
});

describe("PromoCodeField without a stored promo", () => {
  it("does not call the API on load", async () => {
    render(<PromoCodeField eventId="e1" initialCode="" applied={null} onApplied={vi.fn()} />);
    await waitFor(() => expect(previewPromoMock).not.toHaveBeenCalled());
  });
});
