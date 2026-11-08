import type { EventView, Venue } from "@/api/types";
import { FactList } from "@/components/ui";
import { dateLabel } from "@/utils/format";

const VISIBILITY_LABEL = { public: "Public event", unlisted: "Unlisted event", private: "Private event" } as const;

// The "Details" panel on the event page.
export function EventFacts({ event, venue }: { event: EventView; venue: Venue | null }) {
  return (
    <FactList
      items={[
        { label: "Venue", value: venue ? `${venue.name}, ${venue.address}, ${venue.city}` : "Venue details unavailable" },
        { label: "Time zone", value: event.time_zone },
        { label: "Registration", value: `${dateLabel(event.registration_opens_at)} – ${dateLabel(event.registration_closes_at)}` },
        { label: "Doors", value: `${dateLabel(event.admission_opens_at)} – ${dateLabel(event.admission_closes_at)}` },
        {
          label: "Capacity",
          value: `${event.capacity} · ${event.seating_mode === "assigned" ? "Assigned seating" : "General admission"}`,
        },
        { label: "Visibility", value: VISIBILITY_LABEL[event.visibility] },
        { label: "Refunds", value: event.refund_allowed ? `Allowed until ${dateLabel(event.refund_cutoff_at)}` : "Not offered" },
      ]}
    />
  );
}
