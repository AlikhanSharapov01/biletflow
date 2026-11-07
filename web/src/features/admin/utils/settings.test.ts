import { describe, expect, it } from "vitest";
import { expectedVersion, settingValueError } from "./settings";

describe("admin settings", () => {
  it("expects the newest version, including a scheduled change", () => {
    expect(expectedVersion({ version: 0, pending: null })).toBe(0);
    expect(expectedVersion({ version: 2, pending: { version: 3, value: 5, effective_at: "" } })).toBe(3);
  });

  it("validates whole numbers inside the range", () => {
    const bounds = { minimum: 1, maximum: 60 };
    expect(settingValueError("10", bounds)).toBe("");
    expect(settingValueError("", bounds)).not.toBe("");
    expect(settingValueError("1.5", bounds)).not.toBe("");
    expect(settingValueError("61", bounds)).not.toBe("");
  });
});
