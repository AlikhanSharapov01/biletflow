import { describe, expect, it, vi } from "vitest";
import { consumeHashToken, dateLabel, firstName, formatCountdown, initials, isoToLocalInput, localInputToIso, priceLabel, seatLabel, tengeToMinor } from "./format";

describe("dateLabel", () => {
  it("returns a placeholder for missing or invalid input", () => {
    expect(dateLabel(null)).toBe("Not available");
    expect(dateLabel("not a date")).toBe("Not available");
  });

  it("formats a valid ISO date", () => {
    expect(dateLabel("2026-10-18T13:00:00Z", { year: "numeric", timeZone: "UTC" })).toBe("2026");
  });
});

describe("money", () => {
  it("labels zero as free and converts tiyn to tenge", () => {
    expect(priceLabel(0)).toBe("Free");
    expect(priceLabel(850000)).toBe("₸8500.00");
  });

  it("converts tenge input to minor units and rejects garbage", () => {
    expect(tengeToMinor("8500")).toBe(850000);
    expect(tengeToMinor("12.345")).toBe(1235);
    expect(tengeToMinor("abc")).toBe(0);
    expect(tengeToMinor(-5)).toBe(0);
  });
});

describe("names", () => {
  it("builds two-letter initials", () => {
    expect(initials("Aida Sarsen")).toBe("AS");
    expect(initials("  Timur  ")).toBe("T");
    expect(initials("")).toBe("");
  });

  it("takes the first name", () => {
    expect(firstName("Aida Sarsen")).toBe("Aida");
  });
});

describe("datetime-local round trip", () => {
  it("rejects unparsable values", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("2026-10-18T19:30")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("round-trips through the local input format", () => {
    const iso = localInputToIso("2026-10-18T19:30");
    expect(iso).not.toBeNull();
    expect(isoToLocalInput(iso)).toBe("2026-10-18T19:30");
    expect(isoToLocalInput(null)).toBe("");
  });
});

describe("labels", () => {
  it("describes seats and general admission", () => {
    expect(seatLabel(null)).toBe("General admission");
    expect(seatLabel({ section_label: "A", row_label: "2", seat_label: "7" })).toBe("Section A · Row 2 · Seat 7");
  });

  it("formats countdowns as m:ss", () => {
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(59.6)).toBe("0:59");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("consumeHashToken", () => {
  it("reads the token once and strips the fragment", () => {
    const history = { replaceState: vi.fn() } as unknown as History;
    const token = consumeHashToken({ href: "http://localhost:5173/verify-email?x=1#token=abc.def", hash: "#token=abc.def" } as Location, history);
    expect(token).toBe("abc.def");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/verify-email?x=1");
  });

  it("returns an empty string and leaves history alone without a token", () => {
    const history = { replaceState: vi.fn() } as unknown as History;
    expect(consumeHashToken({ href: "http://localhost:5173/verify-email", hash: "" } as Location, history)).toBe("");
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
