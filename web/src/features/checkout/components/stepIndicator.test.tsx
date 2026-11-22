import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckoutSteps } from "./CheckoutSteps";

function steps() {
  return within(screen.getByRole("list", { name: "Checkout steps" })).getAllByRole("listitem");
}
const labels = () => steps().map((item) => item.textContent?.replace("completed", "").replace(/^\d+/, "").trim());
const current = () => steps().filter((item) => item.getAttribute("aria-current") === "step").map((item) => item.textContent);

describe("CheckoutSteps", () => {
  it("lists tickets, recipients and payment for a paid general-admission flow", () => {
    render(<CheckoutSteps step="select" assigned={false} paid />);
    expect(labels()).toEqual(["Tickets", "Recipients", "Payment"]);
    expect(current()).toEqual(["1Tickets"]);
  });

  it("uses Seats for assigned seating", () => {
    render(<CheckoutSteps step="select" assigned paid />);
    expect(labels()).toEqual(["Seats", "Recipients", "Payment"]);
  });

  it("drops the payment step for a free flow", () => {
    render(<CheckoutSteps step="recipients" assigned={false} paid={false} />);
    expect(labels()).toEqual(["Tickets", "Recipients"]);
    expect(current()).toEqual(["2Recipients"]);
  });

  it("marks earlier steps completed for assistive technology and keeps one current step", () => {
    render(<CheckoutSteps step="payment" assigned paid />);
    const [first, second, third] = steps();
    expect(within(first!).getByText("completed")).toBeTruthy();
    expect(within(second!).getByText("completed")).toBeTruthy();
    expect(within(third!).queryByText("completed")).toBeNull();
    expect(current()).toEqual(["3Payment"]);
  });

  it("has no completed step on the first step", () => {
    render(<CheckoutSteps step="select" assigned={false} paid={false} />);
    expect(screen.queryByText("completed")).toBeNull();
  });
});
