import type { PromoPreview } from "@/api/types/promo";
import { initialPromo, normalizePromoCode, promoDiscountFor, promoSummary, readStashedPromo, stashPromo, type PromoStore } from "./promo";

function memoryStore(): PromoStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    delete: (key) => void data.delete(key),
  };
}

const preview: PromoPreview = {
  event_id: "e1",
  code: "SPRING",
  discount_kind: "percent",
  discount_value: 10,
  eligible_ticket_type_ids: ["t1"],
  valid_until: null,
};

describe("promo codes", () => {
  it("normalises codes", () => {
    expect(normalizePromoCode("  spr ing ")).toBe("SPRING");
  });

  it("prefers the route code and remembers it for later visits", () => {
    const store = memoryStore();
    expect(initialPromo("e1", "spring", store)).toBe("SPRING");
    expect(initialPromo("e1", null, store)).toBe("SPRING");
    expect(initialPromo("e2", null, store)).toBe("");
    stashPromo("e1", "", store);
    expect(readStashedPromo("e1", store)).toBe("");
  });

  it("survives a store that throws", () => {
    const broken: PromoStore = {
      get: () => {
        throw new Error("denied");
      },
      set: () => {
        throw new Error("denied");
      },
      delete: () => {
        throw new Error("denied");
      },
    };
    expect(initialPromo("e1", "code", broken)).toBe("CODE");
    expect(readStashedPromo("e1", broken)).toBe("");
  });

  it("estimates discounts only for eligible types", () => {
    expect(promoDiscountFor(preview, "t1", 500000)).toBe(50000);
    expect(promoDiscountFor(preview, "t2", 500000)).toBe(0);
    expect(promoDiscountFor({ ...preview, discount_kind: "fixed", discount_value: 900000 }, "t1", 500000)).toBe(500000);
    expect(promoDiscountFor(null, "t1", 500000)).toBe(0);
  });

  it("summarises an accepted code", () => {
    expect(promoSummary(preview)).toBe("SPRING: 10% off eligible tickets");
    expect(promoSummary({ ...preview, eligible_ticket_type_ids: [] })).toBe("SPRING: 10% off every ticket");
  });
});
