import { getLocale, t } from "../../i18n";
import { intlLocale } from "../../utils/intlLocale";
// Client-side pre-checks for support attachments. The size limit is the
// platform's current `upload_max_bytes` (GET /settings/public), passed in by
// the caller. The per-message count is fixed by the backend (SUPPORT_API.md).
// File types are not pre-checked: the picker only offers the accepted types,
// and anything else is sent so the user sees the backend's own answer
// (415 unsupported_media_type, 422 attachment_rejected or attachment_infected).
export const ACCEPTED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return t("support.bytes", { p0: bytes });
  if (bytes < 1024 * 1024) return t("support.kilobytes", { p0: Math.round(bytes / 1024) });
  return t("support.megabytes", { p0: new Intl.NumberFormat(intlLocale(getLocale()), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / (1024 * 1024)) });
}

// Returns a message when the file cannot be sent, or null when it looks fine.
// Without a known limit (settings not loaded) only the server checks the size.
export function attachmentProblem(file: Pick<File, "name" | "type" | "size">, maxBytes: number | null): string | null {
  if (file.size === 0) return t("support.empty_file", { p0: file.name });
  if (maxBytes !== null && file.size > maxBytes) {
    return t("support.file_too_large", { p0: file.name, p1: fileSizeLabel(file.size), p2: fileSizeLabel(maxBytes) });
  }
  return null;
}
