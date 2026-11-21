import { ApiError } from "../../api/errors";
import { getUpload } from "../../api/support";
import type { SupportUploadStatus, SupportUploadedFile } from "../../api/types/support";

// Malware-scan state of an uploaded support file (SUPPORT_API.md, "Attachments").
// A quarantined (or still pending) file waits for the worker's scan and cannot
// be linked yet; a clean file is ready; a rejected or deleted file is blocked
// and never becomes linkable or downloadable.
export type ScanState = "checking" | "ready" | "blocked";

export const SCAN_POLL_MS = 3000;

export function scanState(status: SupportUploadStatus): ScanState {
  if (status === "clean") return "ready";
  if (status === "pending" || status === "quarantined") return "checking";
  return "blocked";
}

interface PollOptions {
  intervalMs?: number;
  now?: () => number;
}

// Polls GET /cases/{case_id}/uploads/{file_id} until the file leaves the
// checking state. A file still unscanned when its link window ends
// (`expires_at`) is reported as blocked: the backend deletes it. Temporary
// failures keep polling; a 404 (the upload is gone) is reported as blocked.
// Returns a function that stops polling.
export function pollUpload(
  caseId: string,
  upload: SupportUploadedFile,
  onDone: (state: Exclude<ScanState, "checking">) => void,
  { intervalMs = SCAN_POLL_MS, now = Date.now }: PollOptions = {},
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiresAt = Date.parse(upload.expires_at);

  const finish = (state: Exclude<ScanState, "checking">) => {
    if (stopped) return;
    stopped = true;
    onDone(state);
  };

  const tick = async () => {
    if (stopped) return;
    if (Number.isFinite(expiresAt) && now() >= expiresAt) return finish("blocked");
    try {
      const current = await getUpload(caseId, upload.file_id);
      const state = scanState(current.status);
      if (state !== "checking") return finish(state);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) return finish("blocked");
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };

  timer = setTimeout(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
