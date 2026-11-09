import { t, useLocale } from "../../../i18n";
import type { EventView, Venue } from "../../../api/types";
import { Button, ButtonLink, EventCard, StatusPill } from "../../../components/ui";
import { dateLabel, statusLabel } from "../../../utils/format";
import { publicationTone } from "../../../utils/status";

interface WorkspaceEventCardProps {
  event: EventView;
  venue: Venue | undefined;
  busy: boolean;
  onTogglePublish: () => void;
  onDuplicate: () => void;
}

export function WorkspaceEventCard({ event, venue, busy, onTogglePublish, onDuplicate }: WorkspaceEventCardProps) {
  useLocale();
  const published = event.publication_state === "published";
  const path = `/organizer/events/${encodeURIComponent(event.id)}`;
  return (
    <EventCard
      date={event.starts_at}
      title={event.title}
      to={path}
      meta={`${venue ? `${venue.name} · ${venue.city}` : t("org.venue_unavailable")} · ${dateLabel(event.starts_at)}`}
      footer={
        <>
          <span className="row-actions">
            <StatusPill tone={publicationTone(event.publication_state)}>{statusLabel(event.publication_state)}</StatusPill>
            {event.moderation_state === "suspended" ? <StatusPill tone="blocked">{t("org.suspended")}</StatusPill> : null}
          </span>
          <div className="row-actions">
            <ButtonLink size="sm" to={path}>{t("org.manage")}{" "}</ButtonLink>
            {event.publication_state !== "cancelled" && event.time_status !== "completed" ? (
              <Button size="sm" disabled={busy} onClick={onTogglePublish}>
                {published ? t("organizer.unpublish") : t("organizer.publish")}
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={onDuplicate}>{t("organizer.duplicate")}</Button>
          </div>
        </>
      }
    />
  );
}
