import { readLocalInput, toLocalInput } from "./dateInput";

describe("date inputs", () => {
  it("reads a space or a T between date and time", () => {
    const withSpace = readLocalInput("2026-11-05 19:00");
    expect(withSpace).not.toBeNull();
    expect(withSpace).toBe(readLocalInput("2026-11-05T19:00"));
    expect(readLocalInput("")).toBeNull();
    expect(readLocalInput("tomorrow")).toBeNull();
  });

  it("shows an ISO time back with a space", () => {
    const iso = readLocalInput("2026-11-05 19:00");
    expect(toLocalInput(iso)).toBe("2026-11-05 19:00");
    expect(toLocalInput(null)).toBe("");
  });
});
