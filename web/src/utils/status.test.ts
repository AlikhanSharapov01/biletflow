import { describe, expect, it } from "vitest";
import { orderTone, publicationTone, ticketTone } from "./status";

describe("ticketTone", () => {
  it("shows a valid ticket as positive and a used one as neutral", () => {
    expect(ticketTone("valid")).toBe("positive");
    expect(ticketTone("checked_in")).toBe("neutral");
  });

  it("blocks every ticket that can no longer admit", () => {
    expect(ticketTone("cancelled")).toBe("blocked");
    expect(ticketTone("refunded")).toBe("blocked");
    expect(ticketTone("refund_pending")).toBe("blocked");
    expect(ticketTone("some_future_state")).toBe("blocked");
  });

  it("stays neutral without a status", () => {
    expect(ticketTone(null)).toBe("neutral");
    expect(ticketTone(undefined)).toBe("neutral");
    expect(ticketTone("")).toBe("neutral");
  });
});

describe("orderTone", () => {
  it("marks only confirmed orders positive", () => {
    expect(orderTone("confirmed")).toBe("positive");
    expect(orderTone("pending")).toBe("pending");
    expect(orderTone("expired")).toBe("pending");
  });
});

describe("publicationTone", () => {
  it("maps each publication state", () => {
    expect(publicationTone("published")).toBe("positive");
    expect(publicationTone("cancelled")).toBe("blocked");
    expect(publicationTone("draft")).toBe("neutral");
    expect(publicationTone("unpublished")).toBe("neutral");
  });
});
