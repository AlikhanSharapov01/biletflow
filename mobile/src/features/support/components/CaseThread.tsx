import { StyleSheet, Text, View } from "react-native";

import type { SupportThreadItem } from "@/api/types/support";
import { colors, fonts } from "@/theme";
import { dateLabel } from "@/utils/format";

import { describeChange } from "../utils/supportLabels";
import { MessageBubble } from "./MessageBubble";

interface CaseThreadProps {
  items: SupportThreadItem[];
  viewerId: string;
}

// Messages and history in `seq` order; new items are announced politely.
export function CaseThread({ items, viewerId }: CaseThreadProps) {
  return (
    <View style={styles.thread} accessibilityLabel="Case messages" accessibilityLiveRegion="polite">
      {items.map((item) =>
        item.type === "message" ? (
          <MessageBubble key={`m-${item.seq}`} message={item} own={item.author.id === viewerId} />
        ) : (
          <View key={`c-${item.seq}`} style={styles.change}>
            <Text style={styles.changeText}>{describeChange(item)}</Text>
            {item.reason && item.reason !== "requester_reply" && item.reason !== "escalated" ? (
              <Text style={styles.reason}>“{item.reason}”</Text>
            ) : null}
            <Text style={styles.time}>{dateLabel(item.created_at)}</Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: 10 },
  change: { alignItems: "center", gap: 2, paddingVertical: 4 },
  changeText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", textAlign: "center" },
  reason: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, fontStyle: "italic", textAlign: "center" },
  time: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11 },
});
