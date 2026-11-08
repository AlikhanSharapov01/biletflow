import { formatCountdown, localInputToIso, tokenFromLink } from "@/utils/format";

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
