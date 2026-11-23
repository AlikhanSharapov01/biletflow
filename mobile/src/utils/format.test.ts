import { dateLabel, formatCountdown, localInputToIso, tokenFromLink } from "@/utils/format";
import { setLocale } from "@/i18n";
import { clearIntlLocales, intlLocale } from "@/utils/intlLocale";

describe("tokenFromLink", () => {
  it("reads the token from an emailed link fragment", () => {
    expect(tokenFromLink("http://localhost:8080/verify-email#token=abc.123")).toBe("abc.123");
  });

  it("accepts a bare token", () => {
    expect(tokenFromLink("  abc.123  ")).toBe("abc.123");
  });

  it("returns nothing for a link without a token", () => {
    expect(tokenFromLink("http://localhost:8080/verify-email")).toBe("");
  });
});

describe("formatCountdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("localInputToIso", () => {
  it("accepts a space or a T between date and time", () => {
    const withT = localInputToIso("2026-11-20T19:00");
    expect(withT).not.toBeNull();
    expect(localInputToIso("2026-11-20 19:00")).toBe(withT);
  });

  it("rejects text that is not a date", () => {
    expect(localInputToIso("tomorrow evening")).toBeNull();
    expect(localInputToIso("")).toBeNull();
  });
});

describe("Kazakh fallback", () => {
  beforeEach(() => clearIntlLocales());
  afterEach(() => {
    jest.restoreAllMocks();
    clearIntlLocales();
    setLocale("en");
  });

  // Some engines list "kk" as supported but have no month names for it, and print
  // "2027 M02 4" for a date.
  function monthNamesFor(locale: string, value: string) {
    const real = Intl.DateTimeFormat.prototype.formatToParts;
    jest.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(function (this: Intl.DateTimeFormat, date) {
      const parts = real.call(this, date);
      if (!this.resolvedOptions().locale.startsWith(locale)) return parts;
      return parts.map((part) => (part.type === "month" ? { ...part, value } : part));
    });
  }

  it("uses Russian when the engine lists Kazakh without month names", () => {
    monthNamesFor("kk", "M02");
    expect(intlLocale("kk")).toBe("ru");
  });

  it("uses Russian when Kazakh months come out as numbers", () => {
    monthNamesFor("kk", "2");
    expect(intlLocale("kk")).toBe("ru");
  });

  it("checks each locale once", () => {
    const check = jest.spyOn(Intl.DateTimeFormat, "supportedLocalesOf");
    intlLocale("kk");
    intlLocale("kk");
    intlLocale("ru");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("falls back to Russian formatting but keeps Kazakh month names when the engine has no Kazakh data", () => {
    jest.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockReturnValue([]);
    setLocale("kk");
    expect(intlLocale("kk")).toBe("ru");
    expect(intlLocale("en")).toBe("en");
    expect(dateLabel("2026-10-18T13:00:00Z", { month: "long", timeZone: "UTC" })).toBe("Қазан");
  });

  it("keeps Kazakh when the engine supports it", () => {
    const spy = jest.spyOn(Intl, "DateTimeFormat");
    jest.spyOn(Intl.NumberFormat, "supportedLocalesOf").mockReturnValue(["kk"]);
    // The spy replaced the constructor, so its static method is stubbed by assignment (restored with the spy).
    Intl.DateTimeFormat.supportedLocalesOf = () => ["kk"];
    setLocale("kk");
    dateLabel("2026-10-18T13:00:00Z");
    expect(intlLocale("kk")).toBe("kk");
    expect(spy.mock.calls[0]![0]).toBe("kk");
  });
});
