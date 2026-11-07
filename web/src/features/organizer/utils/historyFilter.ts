import type { HistoryEntry } from "../../../api/types";

// The history API has no filters, so the loaded page is filtered in the
// browser. Action groups are the part before the first dot, e.g. "admission".

export interface HistoryFilter {
  // Local dates "YYYY-MM-DD", inclusive.
  from: string;
  to: string;
  group: string;
}

export const NO_FILTER: HistoryFilter = { from: "", to: "", group: "" };

export function actionGroup(action: string): string {
  return action.split(".")[0] ?? action;
}

export function actionGroups(entries: HistoryEntry[]): string[] {
  return [...new Set(entries.map((entry) => actionGroup(entry.action)))].sort();
}

function localDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function filterHistory(entries: HistoryEntry[], filter: HistoryFilter): HistoryEntry[] {
  return entries.filter((entry) => {
    const day = localDay(entry.created_at);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.group && actionGroup(entry.action) !== filter.group) return false;
    return true;
  });
}
