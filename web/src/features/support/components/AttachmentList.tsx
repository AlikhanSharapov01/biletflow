import { useState } from "react";
import { describeError } from "../../../api/errors";
import { attachmentDownloadLink } from "../../../api/support";
import type { SupportAttachment } from "../../../api/types/support";
import { useToast } from "../../../components/ui";
import { fileSizeLabel } from "../attachments";

interface AttachmentListProps {
  caseId: string;
  attachments: SupportAttachment[];
}

// Files on a message. Each click asks for a fresh short-lived signed link
// (never cached); the server answers with Content-Disposition: attachment, so
// following it downloads the file without leaving the page.
export function AttachmentList({ caseId, attachments }: AttachmentListProps) {
  const { notify } = useToast();
  const [busyId, setBusyId] = useState("");
  if (attachments.length === 0) return null;

  const download = async (attachment: SupportAttachment) => {
    setBusyId(attachment.id);
    try {
      const link = await attachmentDownloadLink(caseId, attachment.id);
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.rel = "noopener";
      anchor.download = attachment.original_filename;
      anchor.click();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusyId("");
    }
  };

  return (
    <ul className="support-files">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <button
            type="button"
            className="support-file"
            disabled={busyId === attachment.id}
            onClick={() => void download(attachment)}
            aria-label={`Download ${attachment.original_filename}`}
          >
            <span aria-hidden="true">{attachment.mime_type === "application/pdf" ? "PDF" : "IMG"}</span>
            <span className="support-file-name">{attachment.original_filename}</span>
            <small>{busyId === attachment.id ? "Preparing…" : fileSizeLabel(attachment.size_bytes)}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
