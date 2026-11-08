import type { EventView } from "@/api/types";

export type EventGroup = "active" | "upcoming" | "completed" | "cancelled";

export const EVENT_GROUPS: Array<{ id: EventGroup; label: string; empty: string }> = [
  { id: "active", label: "Active", empty: "Nothing is happening right now." },
  { id: "upcoming", label: "Upcoming", empty: "No upcoming events. Create a draft to get started." },
  { id: "completed", label: "Completed", empty: "No finished events yet." },
  { id: "cancelled", label: "Cancelled", empty: "No cancelled events." },
];

// Cancellation wins over time; otherwise the server's derived time status.
export function eventGroup(event: Pick<EventView, "publication_state" | "time_status">): EventGroup {
  if (event.publication_state === "cancelled") return "cancelled";
  if (event.time_status === "active") return "active";
  if (event.time_status === "completed") return "completed";
  return "upcoming";
}

export function groupEvents(events: EventView[]): Record<EventGroup, EventView[]> {
  const groups: Record<EventGroup, EventView[]> = { active: [], upcoming: [], completed: [], cancelled: [] };
  for (const event of events) groups[eventGroup(event)].push(event);
  // Upcoming and active soonest first; finished and cancelled most recent first.
  groups.active.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  groups.upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  groups.completed.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  groups.cancelled.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return groups;
}

// Opens the most relevant non-empty group.
export function defaultGroup(groups: Record<EventGroup, EventView[]>): EventGroup {
  return EVENT_GROUPS.find((group) => groups[group.id].length > 0)?.id ?? "upcoming";
}
