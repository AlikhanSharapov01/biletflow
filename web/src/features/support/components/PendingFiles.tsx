import { t, useLocale } from "../../../i18n";
import { fileSizeLabel } from "../attachments";

export interface PendingFile {
  localId: string;
  name: string;
  size: number;
  // checking: stored but quarantined until the malware scan answers;
  // blocked: the scan rejected it (or it expired unscanned), never sent.
  status: "uploading" | "checking" | "ready" | "blocked" | "failed";
  fileId?: string;
  error?: string;
}

interface PendingFilesProps {
  files: PendingFile[];
  onRemove: (localId: string) => void;
}

function fileStatusLabel(file: PendingFile): string {
  switch (file.status) {
    case "uploading":
      return t("support.uploading");
    case "checking":
      return t("support.scan_checking");
    case "blocked":
      return file.error ?? t("support.scan_blocked");
    case "failed":
      return file.error ?? "";
    default:
      return `${t("support.scan_ready")} · ${fileSizeLabel(file.size)}`;
  }
}

// Files picked for the next message, uploaded as soon as they are chosen.
export function PendingFiles({ files, onRemove }: PendingFilesProps) {
  useLocale();
  if (files.length === 0) return null;
  return (
    <ul className="support-pending" aria-label={t("support.files_to_send")}>
      {files.map((file) => (
        <li key={file.localId} className={`support-pending-file ${file.status}`}>
          <span className="support-file-name">{file.name}</span>
          <small>
            {fileStatusLabel(file)}
          </small>
          <button type="button" className="text-button" onClick={() => onRemove(file.localId)} aria-label={t("support.remove_file", { p0: file.name })}>{t("common.remove")}</button>
        </li>
      ))}
    </ul>
  );
}
