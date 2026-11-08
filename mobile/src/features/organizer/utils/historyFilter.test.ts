import type { HistoryEntry } from "@/api/types";
import { NO_FILTER, actionGroup, actionGroups, filterHistory } from "./historyFilter";

const entry = (id: string, action: string, created_at: string) => ({ id, action, created_at }) as HistoryEntry;
const rows = [
  entry("a", "event.published", "2026-11-01T12:00:00"),
  entry("b", "admission.checked_in", "2026-11-03T12:00:00"),
  entry("c", "admission.reversed", "2026-11-05T12:00:00"),
];

describe("history filter", () => {
  it("groups actions by their prefix", () => {
    expect(actionGroup("paid_sales.activation_started")).toBe("paid_sales");
    expect(actionGroups(rows)).toEqual(["admission", "event"]);
  });

  it("filters by inclusive local dates and action group", () => {
    expect(filterHistory(rows, NO_FILTER)).toHaveLength(3);
    expect(filterHistory(rows, { ...NO_FILTER, from: "2026-11-03" }).map((row) => row.id)).toEqual(["b", "c"]);
    expect(filterHistory(rows, { ...NO_FILTER, to: "2026-11-03" }).map((row) => row.id)).toEqual(["a", "b"]);
    expect(filterHistory(rows, { ...NO_FILTER, group: "event" }).map((row) => row.id)).toEqual(["a"]);
  });
});
