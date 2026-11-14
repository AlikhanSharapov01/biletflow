import type { EventView, Venue } from "@/api/types";
import { PageHeading, PrimaryButton, StatusPill, SubtleButton } from "@/components/ui";
import { dateLabel, statusLabel } from "@/utils/format";
import { publicationTone } from "@/utils/status";
import { t, useLocale } from "@/i18n";

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
  useLocale();
  const published = event.publication_state === "published";
  const cancelled = event.publication_state === "cancelled";
  return (
    <PageHeading
      eyebrow={t("org.manage_event", { p0: statusLabel(event.time_status), p1: event.moderation_state !== "normal" ? ` ${t("org.moderation_suffix")}` : "" })}
      title={event.title}
      subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
      actions={
        <>
          <StatusPill tone={publicationTone(event.publication_state)} label={statusLabel(event.publication_state)} />
          {!cancelled ? <PrimaryButton label={published ? t("organizer.unpublish") : t("organizer.publish")} disabled={busy} onPress={onTogglePublish} /> : null}
          <SubtleButton label={t("organizer.public_page")} onPress={onOpenPublic} />
          <SubtleButton label={t("organizer.duplicate")} disabled={busy} onPress={onDuplicate} />
          {!cancelled ? <SubtleButton danger label={t("organizer.cancel_event")} disabled={busy} onPress={onCancel} /> : null}
        </>
      }
    />
  );
}
