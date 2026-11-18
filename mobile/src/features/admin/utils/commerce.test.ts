import { localInputToIso } from "@/utils/format";

import { EMPTY_COMMERCE_DRAFT, commerceTone, environmentLabel, purposeLabel, toCommerceFilters } from "./commerce";

describe("commerce filters", () => {
  it("sends only the fields that are filled in, trimmed", () => {
    expect(toCommerceFilters(EMPTY_COMMERCE_DRAFT)).toEqual({ ok: true, filters: {} });
    expect(
      toCommerceFilters({ ...EMPTY_COMMERCE_DRAFT, status: "failed", purpose: "activation", environment: "simulation", event_id: " e1 ", order_id: "o1" }),
    ).toEqual({ ok: true, filters: { status: "failed", purpose: "activation", environment: "simulation", event_id: "e1", order_id: "o1" } });
  });

  it("turns typed dates into instants and refuses a range that ends before it starts", () => {
    const ok = toCommerceFilters({ ...EMPTY_COMMERCE_DRAFT, from: "2026-11-01 10:00", to: "2026-11-02 10:00" });
    expect(ok).toEqual({ ok: true, filters: { from: localInputToIso("2026-11-01T10:00"), to: localInputToIso("2026-11-02T10:00") } });
    expect(toCommerceFilters({ ...EMPTY_COMMERCE_DRAFT, from: "2026-11-02 10:00", to: "2026-11-01 10:00" })).toEqual({
      ok: false,
      error: "“To” must be after “From”.",
    });
    expect(toCommerceFilters({ ...EMPTY_COMMERCE_DRAFT, from: "tomorrow" }).ok).toBe(false);
  });

  it("labels purpose, environment and status tone", () => {
    expect(purposeLabel("ticket_order")).toBe("Ticket order");
    expect(purposeLabel("activation")).toBe("Activation fee");
    expect(environmentLabel(true, "simulation")).toBe("Simulation");
    expect(environmentLabel(false, "sandbox")).toBe("Sandbox payments");
    expect([commerceTone("succeeded"), commerceTone("failed"), commerceTone("pending")]).toEqual(["positive", "blocked", "pending"]);
  });
});
