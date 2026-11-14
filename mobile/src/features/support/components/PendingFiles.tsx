import { StyleSheet, Text, View } from "react-native";

import { TextButton } from "@/components/ui";
import { colors, fonts } from "@/theme";

import { fileSizeLabel } from "../utils/attachments";
import { t, useLocale } from "@/i18n";

export interface PendingFile {
  localId: string;
  name: string;
  size?: number;
  status: "uploading" | "ready" | "failed";
  fileId?: string;
  error?: string;
}

interface PendingFilesProps {
  files: PendingFile[];
  onRemove: (localId: string) => void;
}

function fileNote(file: PendingFile): string {
  if (file.status === "uploading") return t("support.uploading");
  if (file.status === "failed") return file.error ?? t("mobile.support.upload_failed");
  return file.size !== undefined ? fileSizeLabel(file.size) : t("mobile.support.ready");
}

// Files picked for the next message, uploaded as soon as they are chosen.
export function PendingFiles({ files, onRemove }: PendingFilesProps) {
  useLocale();
  if (files.length === 0) return null;
  return (
    <View style={styles.list} accessibilityLabel={t("support.files_to_send")}>
      {files.map((file) => (
        <View key={file.localId} style={styles.file}>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={[styles.note, file.status === "failed" && styles.failed]}>{fileNote(file)}</Text>
          </View>
          <TextButton label={t("common.remove")} onPress={() => onRemove(file.localId)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  info: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "600" },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12 },
  failed: { color: colors.error },
});
