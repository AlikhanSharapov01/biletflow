import { describe, expect, it } from "vitest";
import { ADMIN_PATHS, ADMIN_SECTIONS } from "./adminPaths";

describe("admin paths", () => {
  it("keeps every admin route under /admin", () => {
    for (const path of Object.values(ADMIN_PATHS)) {
      expect(path === "/admin" || path.startsWith("/admin/")).toBe(true);
    }
  });

  it("links every admin page except the root exactly once, with a label", () => {
    const linked = ADMIN_SECTIONS.map((section) => section.to);
    const pages = Object.entries(ADMIN_PATHS)
      .filter(([key]) => key !== "root")
      .map(([, path]) => path);
    expect(new Set(linked).size).toBe(linked.length);
    expect([...linked].sort()).toEqual([...pages].sort());
    for (const section of ADMIN_SECTIONS) expect(section.label.trim()).not.toBe("");
  });
});
