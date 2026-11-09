import { t, useLocale } from "../../../i18n";
import { fileSizeLabel } from "../attachments";

export interface PendingFile {
  localId: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "failed";
  fileId?: string;
  error?: string;
}

interface PendingFilesProps {
  files: PendingFile[];
  onRemove: (localId: string) => void;
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
            {file.status === "uploading" ? t("support.uploading") : file.status === "failed" ? file.error : fileSizeLabel(file.size)}
          </small>
          <button type="button" className="text-button" onClick={() => onRemove(file.localId)} aria-label={t("support.remove_file", { p0: file.name })}>{t("common.remove")}</button>
        </li>
      ))}
    </ul>
  );
}
