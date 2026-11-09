import { fireEvent, render, screen } from "@testing-library/react-native";

import { TicketTypeForm } from "@/features/organizer/components/TicketTypeForm";

import { makeEvent } from "../testFixtures";

describe("TicketTypeForm", () => {
  const event = makeEvent({ capacity: 100 });

  it("submits a paid ticket type with the price in minor units and default windows", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onInvalid = jest.fn();
    await render(<TicketTypeForm event={event} submitLabel="Add ticket type" busy={false} message="" onSubmit={onSubmit} onInvalid={onInvalid} />);

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. General admission"), "VIP");
    await fireEvent.press(screen.getByLabelText("Kind: Free"));
    await fireEvent.press(screen.getByText("Paid"));
    await fireEvent.changeText(screen.getByDisplayValue("0"), "8500");
    await fireEvent.changeText(screen.getByPlaceholderText("Up to 100"), "10");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Hidden from attendees" }));
    await fireEvent.press(screen.getByText("Add ticket type"));

    expect(onInvalid).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      name: "VIP",
      description: "",
      kind: "paid",
      price_minor: 850000,
      quantity_limit: 10,
      per_order_limit: 5,
      sales_open_at: event.registration_opens_at,
      sales_close_at: event.registration_closes_at,
      is_hidden: true,
    });
  });

  it("reports the first problem instead of submitting", async () => {
    const onSubmit = jest.fn();
    const onInvalid = jest.fn();
    await render(<TicketTypeForm event={event} submitLabel="Add ticket type" busy={false} message="" onSubmit={onSubmit} onInvalid={onInvalid} />);
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. General admission"), "Too many");
    await fireEvent.changeText(screen.getByPlaceholderText("Up to 100"), "101");
    await fireEvent.press(screen.getByText("Add ticket type"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith("Quantity must be a whole number up to the event capacity (100).");
  });

  it("accepts sales windows typed with a space", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<TicketTypeForm event={event} submitLabel="Add ticket type" busy={false} message="" onSubmit={onSubmit} onInvalid={jest.fn()} />);
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. General admission"), "Early");
    await fireEvent.changeText(screen.getByPlaceholderText("Up to 100"), "20");
    await fireEvent.changeText(screen.getByLabelText("Sales open, format YYYY-MM-DD HH:mm"), "2026-10-10 09:00");
    await fireEvent.changeText(screen.getByLabelText("Sales close, format YYYY-MM-DD HH:mm"), "2026-11-10 09:00");
    await fireEvent.press(screen.getByText("Add ticket type"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sales_open_at: new Date("2026-10-10T09:00").toISOString(),
        sales_close_at: new Date("2026-11-10T09:00").toISOString(),
      }),
    );
  });
});
