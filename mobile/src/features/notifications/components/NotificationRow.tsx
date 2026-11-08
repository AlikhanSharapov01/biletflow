import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppNotification } from "@/api/types/notifications";
import { colors, fonts, radii } from "@/theme";
import { dateLabel } from "@/utils/format";

interface NotificationRowProps {
  notification: AppNotification;
  busy: boolean;
  onOpen: (notification: AppNotification) => void;
}

const KIND_GLYPH: Record<string, string> = {
  event_updated: "E",
  event_cancelled: "E",
  ticket_delivered: "T",
  support_reply: "S",
  support_status: "S",
};

// One inbox entry. Unread items are bold with a dot; pressing the row marks
// it read and opens its target.
export function NotificationRow({ notification, busy, onOpen }: NotificationRowProps) {
  const unread = !notification.read_at;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Unread: " : ""}${notification.title}`}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={() => onOpen(notification)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, busy && styles.busy]}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>{KIND_GLYPH[notification.kind] ?? "N"}</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          {unread ? <View style={styles.dot} /> : null}
          <Text style={[styles.title, unread && styles.unreadTitle]}>{notification.title}</Text>
        </View>
        <Text style={styles.body}>{notification.body}</Text>
        <Text style={styles.time}>{dateLabel(notification.created_at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  pressed: { opacity: 0.6 },
  busy: { opacity: 0.55 },
  icon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.input,
    backgroundColor: colors.dateTile,
  },
  iconText: { color: colors.dateTileInk, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" },
  copy: { flex: 1, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral },
  title: { flex: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "500" },
  unreadTitle: { fontWeight: "700" },
  body: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  time: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12 },
});
