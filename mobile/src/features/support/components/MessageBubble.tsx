import { StyleSheet, Text, View } from "react-native";

import type { SupportMessage } from "@/api/types/support";
import { colors, fonts, radii } from "@/theme";
import { dateLabel } from "@/utils/format";

import { AttachmentList } from "./AttachmentList";
import { t, useLocale } from "@/i18n";

interface MessageBubbleProps {
  message: SupportMessage;
  own: boolean;
}

// One chat bubble: own messages on the right, everyone else on the left with
// their name and a "Support" tag for staff replies.
export function MessageBubble({ message, own }: MessageBubbleProps) {
  useLocale();
  return (
    <View style={[styles.row, own && styles.ownRow]}>
      <View style={[styles.bubble, own && styles.ownBubble]}>
        <View style={styles.meta}>
          <Text style={styles.author}>{own ? t("support.you") : message.author.display_name}</Text>
          {message.author_role === "support" && !own ? <Text style={styles.role}>{t("nav.support")}</Text> : null}
          <Text style={styles.time}>{dateLabel(message.created_at)}</Text>
        </View>
        <Text style={styles.body} selectable>
          {message.body}
        </Text>
        <AttachmentList caseId={message.case_id} attachments={message.attachments} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "flex-start" },
  ownRow: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "88%",
    padding: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.sidebar,
  },
  ownBubble: { borderColor: colors.activeNav, backgroundColor: colors.note },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 },
  author: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
  role: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    overflow: "hidden",
    backgroundColor: colors.activeNav,
    color: colors.greenDark,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: "700",
  },
  time: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11 },
  body: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
});
