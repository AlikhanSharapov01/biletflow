import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AssignedEvent } from "@/api/types/scanner";
import { DateTile, StatusPill } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE } from "@/features/scanner/assignedEventStatus";
import { colors, fonts, radii } from "@/theme";
import { formatEventWindow } from "@/utils/eventTime";

// One row of the check-in desk; ended events are shown but can't be opened.
export function AssignedEventCard({
  event,
  onPress,
}: {
  event: AssignedEvent;
  onPress: () => void;
}) {
  const ended = event.time_status === "completed";
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        ended && styles.cardDisabled,
      ]}
      disabled={ended}
      onPress={onPress}
    >
      <DateTile at={event.starts_at} timeZone={event.time_zone} />
      <View style={styles.cardCopy}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {event.venue.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatEventWindow(event.starts_at, event.ends_at, event.time_zone)}
        </Text>
        <View style={styles.pill}>
          <StatusPill
            label={STATUS_LABEL[event.time_status]}
            tone={STATUS_TONE[event.time_status]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.paper,
  },
  cardPressed: {
    borderColor: "#9bb9a5",
    backgroundColor: "#f0f5eb",
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: "#929b94",
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  pill: {
    marginTop: 6,
  },
});
