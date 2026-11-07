import { describe, expect, it } from "vitest";
import type { EventView } from "../../../api/types";
import { defaultGroup, eventGroup, groupEvents } from "./eventGroups";

const event = (id: string, publication_state: string, time_status: string, starts_at: string) =>
  ({ id, publication_state, time_status, starts_at }) as EventView;

describe("event groups", () => {
  it("puts cancelled first, then follows the time status", () => {
    expect(eventGroup(event("1", "cancelled", "upcoming", ""))).toBe("cancelled");
    expect(eventGroup(event("2", "published", "active", ""))).toBe("active");
    expect(eventGroup(event("3", "draft", "upcoming", ""))).toBe("upcoming");
    expect(eventGroup(event("4", "unpublished", "completed", ""))).toBe("completed");
  });

  it("sorts upcoming soonest first and completed newest first", () => {
    const groups = groupEvents([
      event("late", "draft", "upcoming", "2026-12-02T00:00:00Z"),
      event("soon", "published", "upcoming", "2026-11-10T00:00:00Z"),
      event("old", "published", "completed", "2026-01-01T00:00:00Z"),
      event("recent", "published", "completed", "2026-10-01T00:00:00Z"),
    ]);
    expect(groups.upcoming.map((item) => item.id)).toEqual(["soon", "late"]);
    expect(groups.completed.map((item) => item.id)).toEqual(["recent", "old"]);
    expect(defaultGroup(groups)).toBe("upcoming");
    expect(defaultGroup(groupEvents([]))).toBe("upcoming");
  });
});
