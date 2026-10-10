import type { AssignedEvent } from "@/api/scanner";

// Fictional demo events standing in for GET /scanner/events until the backend
// ships BF-11 (see docs/BiletFlow_Backend_Requirements.md). Times are
// relative to now so the "active" event is always mid-admission.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const DEMO_HALL = {
  name: "Almaty Demo Hall",
  address: "12 Abay Avenue",
  city: "Almaty",
};

export function mockAssignedEvents(): AssignedEvent[] {
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Campus Spring Concert",
      venue: DEMO_HALL,
      starts_at: at(-0.5 * HOUR),
      ends_at: at(3 * HOUR),
      time_zone: "Asia/Almaty",
      admission_opens_at: at(-1.5 * HOUR),
      admission_closes_at: at(3 * HOUR),
      time_status: "active",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      title: "Startup Pitch Night",
      venue: DEMO_HALL,
      starts_at: at(3 * DAY),
      ends_at: at(3 * DAY + 2 * HOUR),
      time_zone: "Asia/Almaty",
      admission_opens_at: at(3 * DAY - HOUR),
      admission_closes_at: at(3 * DAY + 2 * HOUR),
      time_status: "upcoming",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      title: "Autumn Theatre Evening",
      venue: DEMO_HALL,
      starts_at: at(-DAY - 3 * HOUR),
      ends_at: at(-DAY),
      time_zone: "Asia/Almaty",
      admission_opens_at: at(-DAY - 4 * HOUR),
      admission_closes_at: at(-DAY),
      time_status: "completed",
    },
  ];
}
