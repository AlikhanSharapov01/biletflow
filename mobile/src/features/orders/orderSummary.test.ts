import { sampleOrder } from "@/features/checkout/testing/fixtures";

import { orderStart, orderTitle } from "./orderSummary";

describe("order summary", () => {
  it("names an order after its event, from the issued tickets", () => {
    expect(orderTitle(sampleOrder())).toBe("Event");
    expect(orderStart(sampleOrder())).toBeNull();
    const item = { ticket: { event_title: "Almaty Jazz Night", event_starts_at: "2099-11-01T18:00:00Z" } };
    const order = sampleOrder({ items: [item as unknown as ReturnType<typeof sampleOrder>["items"][number]] });
    expect(orderTitle(order)).toBe("Almaty Jazz Night");
    expect(orderStart(order)).toBe("2099-11-01T18:00:00Z");
  });
});
