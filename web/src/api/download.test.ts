import { describe, expect, it } from "vitest";
import { filenameFromDisposition } from "./files";

describe("filenameFromDisposition", () => {
  it("reads plain and encoded filenames", () => {
    expect(filenameFromDisposition('attachment; filename="biletflow-ticket-1.pdf"')).toBe("biletflow-ticket-1.pdf");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''event%20one.ics")).toBe("event one.ics");
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("inline")).toBeNull();
  });
});
