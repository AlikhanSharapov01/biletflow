import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./files";
import { downloadAnalyticsCsv } from "./analytics";

vi.mock("./files", () => ({ downloadFile: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe("downloadAnalyticsCsv", () => {
  it("calls export.csv with the JSON report's filters plus the bucket", async () => {
    await downloadAnalyticsCsv("e 1", { ticket_type_id: "t1", campaign_id: "" }, "hour");
    expect(downloadFile).toHaveBeenCalledWith("/api/v1/events/e%201/analytics/export.csv", "analytics-e 1.csv", {
      from: undefined,
      to: undefined,
      ticket_type_id: "t1",
      campaign_id: undefined,
      bucket: "hour",
    });
  });
});
