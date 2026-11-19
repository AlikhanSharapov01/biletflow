import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError, errorCodeOf } from "@/api/errors";
import { getUpload, sendMessage, uploadAttachment } from "@/api/support";
import type { SupportMessage, SupportUploadedFile } from "@/api/types/support";
import { PrimaryButton, SubtleButton, TextField } from "@/components/ui";
import { colors, fonts } from "@/theme";

import { FormMessage } from "@/components/ui/FormMessage";
import {
  ACCEPTED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  attachmentProblem,
  attachmentType,
  fileSizeLabel,
} from "../utils/attachments";
import { createRetryKeys } from "../utils/retryKey";
import { PendingFiles, type PendingFile } from "./PendingFiles";
import { t, useLocale } from "@/i18n";

// How often a file waiting for its virus scan is asked about. The worker
// retries the scan at most a minute apart, so a few seconds is plenty.
export const SCAN_POLL_MS = 3000;

// What an upload's server status means for the file in the composer.
function fromUpload(uploaded: SupportUploadedFile): Partial<PendingFile> {
  switch (uploaded.status) {
    case "clean":
      return { status: "ready", fileId: uploaded.file_id };
    case "pending":
    case "quarantined":
      return { status: "checking", fileId: uploaded.file_id };
    case "rejected":
      return { status: "blocked", fileId: uploaded.file_id, error: t("mobile.support.blocked_hint") };
    default:
      // Deleted: it was not checked within its one-hour window.
      return { status: "failed", fileId: uploaded.file_id, error: t("mobile.support.check_expired") };
  }
}

interface ComposerProps {
  caseId: string;
  // Shown above the box, e.g. that replying reopens a resolved case.
  hint?: string;
  onSent: (message: SupportMessage) => void;
}

// Reply box. Files upload when picked (raw body), then their ids go with the
// message. A file the scanner has not judged yet is quarantined: it shows
// "Checking file…" and is polled until it is ready or blocked. A retry of the
// same text and files reuses its client_message_id.
export function Composer({ caseId, hint, onSent }: ComposerProps) {
  useLocale();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keys = useMemo(() => createRetryKeys(), []);
  const nextId = useRef(0);
  const uploading = files.some((file) => file.status === "uploading");
  const checking = files.filter((file) => file.status === "checking");
  const ready = files.filter((file) => file.status === "ready");
  const checkingIds = checking.map((file) => `${file.localId}:${file.fileId}`).join(",");

  const patch = (localId: string, change: Partial<PendingFile>) =>
    setFiles((current) => current.map((file) => (file.localId === localId ? { ...file, ...change } : file)));

  // Polls every quarantined file until the scanner decides. A failed poll
  // (network) is simply tried again on the next tick.
  useEffect(() => {
    if (!checkingIds) return;
    let active = true;
    const timer = setInterval(() => {
      for (const file of checking) {
        if (!file.fileId) continue;
        getUpload(caseId, file.fileId)
          .then((uploaded) => active && patch(file.localId, fromUpload(uploaded)))
          .catch((failure: unknown) => {
            if (active && errorCodeOf(failure) === "attachment_not_found") {
              patch(file.localId, { status: "failed", error: describeError(failure) });
            }
          });
      }
    }, SCAN_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // Restarts only when the set of files being checked changes.
  }, [caseId, checkingIds]);

  const pick = async () => {
    setError("");
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: [...ACCEPTED_ATTACHMENT_TYPES], multiple: true, copyToCacheDirectory: true });
    } catch (failure) {
      setError(describeError(failure));
      return;
    }
    if (result.canceled) return;
    const room = MAX_ATTACHMENTS_PER_MESSAGE - files.filter((file) => file.status !== "failed" && file.status !== "blocked").length;
    if (result.assets.length > room) setError(t("support.max_files", { p0: MAX_ATTACHMENTS_PER_MESSAGE }));
    for (const asset of result.assets.slice(0, Math.max(0, room))) {
      nextId.current += 1;
      const localId = `file-${nextId.current}`;
      const mimeType = attachmentType(asset.name, asset.mimeType);
      const problem = attachmentProblem({ name: asset.name, type: mimeType, size: asset.size });
      setFiles((current) => [
        ...current,
        { localId, name: asset.name, size: asset.size, status: problem ? "failed" : "uploading", error: problem ?? undefined },
      ]);
      if (problem) continue;
      uploadAttachment(caseId, { uri: asset.uri, name: asset.name, mimeType })
        .then((uploaded) => patch(localId, fromUpload(uploaded)))
        .catch((failure: unknown) =>
          patch(localId, {
            // An infected file is refused at once; say so as a block, not a failed upload.
            status: errorCodeOf(failure) === "attachment_infected" ? "blocked" : "failed",
            error: describeError(failure),
          }),
        );
    }
  };

  const submit = async () => {
    const text = body.trim();
    if (!text) {
      setError(ready.length ? t("support.files_message") : t("support.write_first"));
      return;
    }
    const payload = { body: text, attachment_ids: ready.map((file) => file.fileId ?? "") };
    setBusy(true);
    setError("");
    try {
      const message = await sendMessage(caseId, { ...payload, client_message_id: keys.keyFor(payload) });
      onSent(message);
      setBody("");
      setFiles([]);
      keys.reset();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.composer}>
      {hint ? <Text style={styles.note}>{hint}</Text> : null}
      <TextField label={t("support.reply")} accessibilityLabel={t("support.reply")} value={body} maxLength={5000} multiline onChangeText={setBody} />
      <PendingFiles files={files} onRemove={(localId) => setFiles((current) => current.filter((file) => file.localId !== localId))} />
      <FormMessage message={error} />
      <View style={styles.actions}>
        <PrimaryButton
          label={
            busy
              ? t("common.sending")
              : uploading
                ? t("support.uploading_files")
                : checking.length
                  ? t("mobile.support.checking_files")
                  : t("support.send")
          }
          disabled={busy || uploading || checking.length > 0}
          onPress={() => void submit()}
          style={styles.send}
        />
        <SubtleButton label={t("support.attach_file")} disabled={busy} onPress={() => void pick()} />
      </View>
      <Text style={styles.note}>{t("support.file_types_hint")} {t("mobile.support.size_each", { p0: fileSizeLabel(MAX_ATTACHMENT_BYTES) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  send: { flex: 1 },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
});
