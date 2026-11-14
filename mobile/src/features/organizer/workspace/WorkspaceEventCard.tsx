import { StyleSheet, View } from "react-native";

import type { EventView, Venue } from "@/api/types";
import { DateTile, ListRow, StatusPill, SubtleButton } from "@/components/ui";
import { dateLabel, statusLabel } from "@/utils/format";
import { publicationTone } from "@/utils/status";
import { t, useLocale } from "@/i18n";

interface WorkspaceEventCardProps {
  event: EventView;
  venue: Venue | undefined;
  busy: boolean;
  onOpen: () => void;
  onTogglePublish: () => void;
  onDuplicate: () => void;
}

export function WorkspaceEventCard({ event, venue, busy, onOpen, onTogglePublish, onDuplicate }: WorkspaceEventCardProps) {
  useLocale();
  const published = event.publication_state === "published";
  return (
    <ListRow
      icon={<DateTile at={event.starts_at} timeZone={event.time_zone} />}
      title={event.title}
      meta={`${venue ? `${venue.name} · ${venue.city}` : t("org.venue_unavailable")} · ${dateLabel(event.starts_at)}`}
      onPress={onOpen}
      accessibilityLabel={t("mobile.org.manage_event_for", { p0: event.title })}
    >
      <View style={styles.footer}>
        <View style={styles.pills}>
          <StatusPill tone={publicationTone(event.publication_state)} label={statusLabel(event.publication_state)} />
          {event.moderation_state === "suspended" ? <StatusPill tone="blocked" label={t("org.suspended")} /> : null}
        </View>
        <View style={styles.actions}>
          <SubtleButton label={t("org.manage")} onPress={onOpen} />
          {event.publication_state !== "cancelled" && event.time_status !== "completed" ? (
            <SubtleButton label={published ? t("organizer.unpublish") : t("organizer.publish")} disabled={busy} onPress={onTogglePublish} />
          ) : null}
          <SubtleButton label={t("organizer.duplicate")} disabled={busy} onPress={onDuplicate} />
        </View>
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
