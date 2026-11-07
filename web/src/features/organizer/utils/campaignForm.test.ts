import { describe, expect, it } from "vitest";
import { campaignFormValues, discountLabel, toCampaignInput, usageLabel } from "./campaignForm";

const base = { ...campaignFormValues(), name: "Early bird", starts_at: "2026-11-10T10:00", ends_at: "2026-11-20T10:00" };

describe("toCampaignInput", () => {
  it("builds a percent campaign with no limit, all types and no code", () => {
    const result = toCampaignInput({ ...base, value: "15" });
    expect(result).toMatchObject({ ok: true, input: { discount_kind: "percent", value: 15, max_redemptions: null, eligible_ticket_type_ids: [], code: null } });
  });

  it("converts fixed discounts from tenge to minor units and upper-cases codes", () => {
    const result = toCampaignInput({ ...base, discount_kind: "fixed", value: "1000", code: "spring-26", max_redemptions: "50" });
    expect(result).toMatchObject({ ok: true, input: { value: 100000, code: "SPRING-26", max_redemptions: 50 } });
  });

  it("rejects bad percents, empty windows, reversed windows, limits and codes", () => {
    expect(toCampaignInput({ ...base, value: "0" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, value: "101" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, value: "12.5" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, discount_kind: "fixed", value: "0" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, starts_at: "" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, ends_at: "2026-11-01T10:00" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, max_redemptions: "0" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, code: "a b" }).ok).toBe(false);
    expect(toCampaignInput({ ...base, name: "  " }).ok).toBe(false);
  });

  it("round-trips an existing fixed campaign back to tenge in the form", () => {
    const values = campaignFormValues({ ...toCampaignInputFixture(), id: "c1", event_id: "e1", created_at: "", status: "active", redemptions_used: 3, link_url: "/c/x" });
    expect(values.value).toBe("1000");
  });
});

function toCampaignInputFixture() {
  return {
    name: "Fixed",
    discount_kind: "fixed" as const,
    value: 100000,
    starts_at: "2026-11-10T10:00:00Z",
    ends_at: "2026-11-20T10:00:00Z",
    max_redemptions: 50,
    eligible_ticket_type_ids: [],
    code: null,
  };
}

describe("labels", () => {
  it("describes discounts and usage", () => {
    expect(discountLabel({ discount_kind: "percent", value: 10 })).toBe("10% off");
    expect(discountLabel({ discount_kind: "fixed", value: 100000 })).toBe("₸1000.00 off");
    expect(usageLabel(3, 100)).toBe("3 of 100 used");
    expect(usageLabel(3, null)).toBe("3 used · no limit");
  });
});
