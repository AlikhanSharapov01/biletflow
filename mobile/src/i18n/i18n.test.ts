import { categoryName, pluralForm, quantityLabel, setLocale, t } from "@/i18n";
import { paymentLabel } from "@/features/checkout/utils/payment";
import { sampleCategory, sampleOrder } from "@/features/checkout/testing/fixtures";
import { amountLabel, priceLabel, statusLabel } from "@/utils/format";

describe("i18n", () => {
  afterEach(() => setLocale("en"));

  it("switches the catalog and falls back to English for a missing key", () => {
    setLocale("ru");
    expect(t("common.free")).not.toBe("Free");
    expect(t("nope" as never)).toBe("nope");
    setLocale("en");
    expect(t("common.free")).toBe("Free");
  });

  it("uses Russian and Kazakh plural forms", () => {
    expect([1, 2, 5, 11, 21, 22, 112].map((n) => pluralForm(n, "ru"))).toEqual(["one", "few", "many", "many", "one", "few", "many"]);
    expect([1, 2, 5].map((n) => pluralForm(n, "kk"))).toEqual(["one", "other", "other"]);
    setLocale("ru");
    expect(quantityLabel("ticket", 2)).toContain("2");
  });

  it("formats money and statuses for the language", () => {
    expect(priceLabel(664000)).toBe("₸6640.00");
    expect(amountLabel(-5000)).toBe("−₸50.00");
    expect(statusLabel("refund_pending")).toBe("refund pending");
    setLocale("ru");
    expect(priceLabel(664000)).toBe("6 640,00 ₸");
    expect(amountLabel(0)).toBe("0,00 ₸");
    expect(statusLabel("refund_pending")).not.toBe("refund pending");
  });

  it("names categories and payment results in the language", () => {
    expect(categoryName(sampleCategory)).toBe(sampleCategory.name_en);
    expect(categoryName(null)).toBe("Event");
    const paid = sampleOrder({ payment: { id: "p1", status: "succeeded", charged_minor: 0, environment: "simulation", provider_payment_id: null, simulated: true } });
    expect(paymentLabel(paid)).toBe("Paid");
    setLocale("ru");
    expect(categoryName(sampleCategory)).toBe(sampleCategory.name_ru);
    expect(paymentLabel(paid)).toBe("Оплачено");
    expect(statusLabel("published")).not.toBe("published");
  });
});
