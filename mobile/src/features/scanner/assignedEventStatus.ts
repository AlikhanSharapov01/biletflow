import type { AssignedEvent } from "@/api/types/scanner";
import type { StatusTone } from "@/theme";

type TimeStatus = AssignedEvent["time_status"];

const STATUS_ORDER: Record<TimeStatus, number> = {
  active: 0,
  upcoming: 1,
  completed: 2,
};

export const STATUS_LABEL: Record<TimeStatus, string> = {
  active: "Happening now",
  upcoming: "Upcoming",
  completed: "Ended",
};

export const STATUS_TONE: Record<TimeStatus, StatusTone> = {
  active: "positive",
  upcoming: "pending",
  completed: "neutral",
};

// Events happening now first, then upcoming, then ended ones.
export function sortForScanning(events: AssignedEvent[]): AssignedEvent[] {
  return [...events].sort(
    (a, b) =>
      STATUS_ORDER[a.time_status] - STATUS_ORDER[b.time_status] ||
      a.starts_at.localeCompare(b.starts_at)
  );
}
