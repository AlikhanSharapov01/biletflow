import { campaignDiscount, contextLine, opsTone, toOpsFilters } from "./ops";

describe("admin operations helpers", () => {
  it("sends only filled filters and wants a whole event id", () => {
    expect(toOpsFilters({ q: "  refund ", status: "", event_id: "" })).toEqual({ ok: true, filters: { q: "refund" } });
    const id = "ad2139b9-8161-414c-ac16-d872c3c89ec6";
    expect(toOpsFilters({ q: "", status: "dead", event_id: ` ${id} ` })).toEqual({ ok: true, filters: { status: "dead", event_id: id } });
    expect(toOpsFilters({ q: "", status: "", event_id: "ad2139b9" })).toEqual({ ok: false, error: "Enter the full ID (36 characters)." });
  });

  it("names the ids a job carries without exposing anything else", () => {
    expect(
      contextLine({ notice: "refund_started", order_id: "26bdfdd1-355d-4cee-b4be-18fcd487043a", recipient_user_id: "2f3fea55-442d-4c32-95b7-e48eedfa418e" }),
    ).toBe("refund started · Order 26bdfdd1 · Recipient 2f3fea55");
    expect(contextLine({})).toBe("");
  });

  it("shows campaign discounts and status tones", () => {
    expect(campaignDiscount({ discount_kind: "percentage", percentage_bps: 1000, fixed_minor: null })).toBe("10%");
    expect(campaignDiscount({ discount_kind: "fixed", percentage_bps: null, fixed_minor: 50000 })).toBe("₸500.00");
    expect([opsTone("dead"), opsTone("done"), opsTone("leased"), opsTone("other")]).toEqual(["blocked", "positive", "pending", "neutral"]);
  });
});
