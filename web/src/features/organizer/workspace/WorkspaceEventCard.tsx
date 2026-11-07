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
  const published = event.publication_state === "published";
  const path = `/organizer/events/${encodeURIComponent(event.id)}`;
  return (
    <EventCard
      date={event.starts_at}
      title={event.title}
      to={path}
      meta={`${venue ? `${venue.name} · ${venue.city}` : "Venue unavailable"} · ${dateLabel(event.starts_at)}`}
      footer={
        <>
          <span className="row-actions">
            <StatusPill tone={publicationTone(event.publication_state)}>{statusLabel(event.publication_state)}</StatusPill>
            {event.moderation_state === "suspended" ? <StatusPill tone="blocked">Suspended</StatusPill> : null}
          </span>
          <div className="row-actions">
            <ButtonLink size="sm" to={path}>
              Manage
            </ButtonLink>
            {event.publication_state !== "cancelled" && event.time_status !== "completed" ? (
              <Button size="sm" disabled={busy} onClick={onTogglePublish}>
                {published ? "Unpublish" : "Publish"}
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={onDuplicate}>
              Duplicate
            </Button>
          </div>
        </>
      }
    />
  );
}
