// @vitest-environment node
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("requires new interface literals to use the translation catalog", () => {
  expect(() => execFileSync(process.execPath, ["scripts/audit-strings.mjs", "--check"], { encoding: "utf8", stdio: "pipe" })).not.toThrow();
});
