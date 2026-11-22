import { t, useLocale } from "../../../i18n";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { sendMessage, uploadAttachment } from "../../../api/support";
import type { SupportMessage } from "../../../api/types/support";
import { Button, FormMessage, TextAreaField } from "../../../components/ui";
import { usePublicSettings } from "../../../hooks/usePublicSettings";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS_PER_MESSAGE, attachmentProblem, fileSizeLabel } from "../attachments";
import { createRetryKeys } from "../retryKey";
import { pollUpload, scanState } from "../uploadScan";
import { PendingFiles, type PendingFile } from "./PendingFiles";

interface ComposerProps {
  caseId: string;
  // Shown above the box, e.g. that replying reopens a resolved case.
  hint?: string;
  onSent: (message: SupportMessage) => void;
}

// Reply box. Files upload when picked (raw body), then their ids go with the
// message. A quarantined upload shows "Checking file…" and is polled until
// its scan makes it ready or blocked; only ready files are sent. A retry of the same text and files reuses its client_message_id.
export function Composer({ caseId, hint, onSent }: ComposerProps) {
  useLocale();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keys = useMemo(() => createRetryKeys(), []);
  const maxBytes = usePublicSettings()?.upload_max_bytes ?? null;
  const picker = useRef<HTMLInputElement | null>(null);
  const polls = useRef(new Map<string, () => void>());
  const uploading = files.some((file) => file.status === "uploading");
  const checking = files.some((file) => file.status === "checking");
  const ready = files.filter((file) => file.status === "ready");

  const patch = (localId: string, change: Partial<PendingFile>) =>
    setFiles((current) => current.map((file) => (file.localId === localId ? { ...file, ...change } : file)));

  useEffect(() => {
    const active = polls.current;
    return () => {
      for (const stop of active.values()) stop();
      active.clear();
    };
  }, []);

  const stopPolling = (localId: string) => {
    polls.current.get(localId)?.();
    polls.current.delete(localId);
  };

  const removeFile = (localId: string) => {
    stopPolling(localId);
    setFiles((current) => current.filter((file) => file.localId !== localId));
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    const room = MAX_ATTACHMENTS_PER_MESSAGE - files.filter((file) => file.status !== "failed" && file.status !== "blocked").length;
    if (picked.length > room) setError(t("support.max_files", { p0: MAX_ATTACHMENTS_PER_MESSAGE }));
    for (const file of picked.slice(0, Math.max(0, room))) {
      const localId = crypto.randomUUID();
      const problem = attachmentProblem(file, maxBytes);
      setFiles((current) => [
        ...current,
        { localId, name: file.name, size: file.size, status: problem ? "failed" : "uploading", error: problem ?? undefined },
      ]);
      if (problem) continue;
      uploadAttachment(caseId, file)
        .then((uploaded) => {
          const state = scanState(uploaded.status);
          patch(localId, { status: state, fileId: uploaded.file_id });
          if (state !== "checking") return;
          polls.current.set(localId, pollUpload(caseId, uploaded, (done) => {
            polls.current.delete(localId);
            patch(localId, { status: done });
          }));
        })
        .catch((failure: unknown) => patch(localId, { status: "failed", error: describeError(failure) }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <form className="support-composer" onSubmit={(event) => void handleSubmit(event)}>
      {hint ? <p className="field-note">{hint}</p> : null}
      <TextAreaField label={t("support.reply")} value={body} maxLength={5000} rows={3} onChange={(event) => setBody(event.target.value)} />
      <PendingFiles files={files} onRemove={removeFile} />
      {error ? <FormMessage message={error} /> : null}
      <div className="form-actions">
        <Button variant="primary" type="submit" busy={busy || uploading || checking}>
          {busy ? t("common.sending") : uploading ? t("support.uploading_files") : checking ? t("support.checking_files") : t("support.send")}
        </Button>
        <Button onClick={() => picker.current?.click()} disabled={busy}>{t("support.attach_file")}{" "}</Button>
        {maxBytes !== null ? <span className="field-note">{t("support.file_types_hint")}{" "}{fileSizeLabel(maxBytes)}{" "}{t("word.each")}</span> : null}
        <input ref={picker} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={handlePick} />
      </div>
    </form>
  );
}
