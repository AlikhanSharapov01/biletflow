import type { EventView, Venue } from "@/api/types";
import { FactList } from "@/components/ui";
import { dateLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

const VISIBILITY_LABEL = { get public() { return t("event.public"); }, get unlisted() { return t("event.unlisted"); }, get private() { return t("event.private"); } } as const;

// The "Details" panel on the event page.
export function EventFacts({ event, venue }: { event: EventView; venue: Venue | null }) {
  useLocale();
  return (
    <FactList
      items={[
        { label: t("event.venue"), value: venue ? `${venue.name}, ${venue.address}, ${venue.city}` : t("discover.venue_missing") },
        { label: t("event.time_zone"), value: event.time_zone },
        { label: t("event.registration"), value: `${dateLabel(event.registration_opens_at)} – ${dateLabel(event.registration_closes_at)}` },
        { label: t("event.doors"), value: `${dateLabel(event.admission_opens_at)} – ${dateLabel(event.admission_closes_at)}` },
        {
          label: t("event.capacity"),
          value: `${event.capacity} · ${event.seating_mode === "assigned" ? t("event.assigned_seating") : t("checkout.general_admission")}`,
        },
        { label: t("event.visibility"), value: VISIBILITY_LABEL[event.visibility] },
        { label: t("event.refunds"), value: event.refund_allowed ? t("event.allowed_until", { p0: dateLabel(event.refund_cutoff_at) }) : t("event.not_offered") },
      ]}
    />
  );
}
