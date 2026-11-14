import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { attachmentDownloadLink } from "@/api/support";
import type { SupportAttachment } from "@/api/types/support";
import { useToast } from "@/context/ToastContext";
import { colors, fonts, radii } from "@/theme";

import { fileSizeLabel } from "../utils/attachments";
import { t, useLocale } from "@/i18n";

interface AttachmentListProps {
  caseId: string;
  attachments: SupportAttachment[];
}

// Files on a message. Each press asks for a fresh short-lived signed link
// (never cached) and opens it in the in-app browser, which can show, save or
// share the file.
export function AttachmentList({ caseId, attachments }: AttachmentListProps) {
  useLocale();
  const { notify } = useToast();
  const [busyId, setBusyId] = useState("");
  if (attachments.length === 0) return null;

  const open = async (attachment: SupportAttachment) => {
    setBusyId(attachment.id);
    try {
      const link = await attachmentDownloadLink(caseId, attachment.id);
      await WebBrowser.openBrowserAsync(link.url);
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusyId("");
    }
  };

  return (
    <View style={styles.list}>
      {attachments.map((attachment) => {
        const busy = busyId === attachment.id;
        return (
          <Pressable
            key={attachment.id}
            accessibilityRole="button"
            accessibilityLabel={t("support.download_file", { p0: attachment.original_filename })}
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void open(attachment)}
            style={({ pressed }) => [styles.file, pressed && styles.pressed]}
          >
            <Text style={styles.kind}>{attachment.mime_type === "application/pdf" ? "PDF" : "IMG"}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {attachment.original_filename}
            </Text>
            <Text style={styles.size}>{busy ? t("support.preparing") : fileSizeLabel(attachment.size_bytes)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, marginTop: 8 },
  file: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    backgroundColor: colors.paper,
  },
  pressed: { opacity: 0.6 },
  kind: { color: colors.dateTileInk, fontFamily: fonts.sans, fontSize: 10, fontWeight: "700" },
  name: { flex: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 13 },
  size: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11 },
});
