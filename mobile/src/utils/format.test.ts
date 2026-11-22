import { dateLabel, formatCountdown, localInputToIso, tokenFromLink } from "@/utils/format";
import { setLocale } from "@/i18n";
import { intlLocale } from "@/utils/intlLocale";

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
  afterEach(() => {
    jest.restoreAllMocks();
    setLocale("en");
  });

  it("formats dates in Russian when the engine has no Kazakh data", () => {
    setLocale("ru");
    const russian = dateLabel("2026-10-18T13:00:00Z", { month: "long", timeZone: "UTC" });
    jest.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockReturnValue([]);
    setLocale("kk");
    expect(intlLocale("kk")).toBe("ru");
    expect(intlLocale("en")).toBe("en");
    expect(dateLabel("2026-10-18T13:00:00Z", { month: "long", timeZone: "UTC" })).toBe(russian);
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
