import { describe, expect, it } from "vitest";
import type { PromoPreview } from "../../../api/types/promo";
import { initialPromo, normalizePromoCode, promoDiscountFor, readStashedPromo, stashPromo } from "./promo";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
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

  it("prefers the URL code and remembers it for after sign-in", () => {
    const storage = memoryStorage();
    expect(initialPromo("e1", "spring", storage)).toBe("SPRING");
    expect(initialPromo("e1", null, storage)).toBe("SPRING");
    expect(initialPromo("e2", null, storage)).toBe("");
    stashPromo("e1", "", storage);
    expect(readStashedPromo("e1", storage)).toBe("");
  });

  it("survives storage that throws", () => {
    const broken = { ...memoryStorage(), getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } } as Storage;
    expect(initialPromo("e1", "code", broken)).toBe("CODE");
    expect(readStashedPromo("e1", broken)).toBe("");
  });

  it("estimates discounts only for eligible types", () => {
    expect(promoDiscountFor(preview, "t1", 500000)).toBe(50000);
    expect(promoDiscountFor(preview, "t2", 500000)).toBe(0);
    expect(promoDiscountFor({ ...preview, discount_kind: "fixed", discount_value: 900000 }, "t1", 500000)).toBe(500000);
    expect(promoDiscountFor(null, "t1", 500000)).toBe(0);
  });
});
