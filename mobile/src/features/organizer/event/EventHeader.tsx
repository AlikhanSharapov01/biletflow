import type { EventView, Venue } from "@/api/types";
import { PageHeading, PrimaryButton, StatusPill, SubtleButton } from "@/components/ui";
import { dateLabel, statusLabel } from "@/utils/format";
import { publicationTone } from "@/utils/status";

interface EventHeaderProps {
  event: EventView;
  venue: Venue | undefined;
  busy: boolean;
  onOpenPublic: () => void;
  onTogglePublish: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
}

export function EventHeader({ event, venue, busy, onOpenPublic, onTogglePublish, onDuplicate, onCancel }: EventHeaderProps) {
  const published = event.publication_state === "published";
  const cancelled = event.publication_state === "cancelled";
  return (
    <PageHeading
      eyebrow={`Manage event · ${statusLabel(event.time_status)}${event.moderation_state !== "normal" ? " · suspended by moderation" : ""}`}
      title={event.title}
      subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
      actions={
        <>
          <StatusPill tone={publicationTone(event.publication_state)} label={statusLabel(event.publication_state)} />
          {!cancelled ? <PrimaryButton label={published ? "Unpublish" : "Publish"} disabled={busy} onPress={onTogglePublish} /> : null}
          <SubtleButton label="Public page" onPress={onOpenPublic} />
          <SubtleButton label="Duplicate" disabled={busy} onPress={onDuplicate} />
          {!cancelled ? <SubtleButton danger label="Cancel event" disabled={busy} onPress={onCancel} /> : null}
        </>
      }
    />
  );
}
