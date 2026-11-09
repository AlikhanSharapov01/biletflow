import { getLocale, t } from "../../i18n";
// Client-side checks that mirror the backend defaults in SUPPORT_API.md
// (ATTACHMENT_MAX_BYTES 5 MiB, ATTACHMENT_MAX_PER_MESSAGE 5). The server
// remains the authority and its errors are still shown.
export const ACCEPTED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return t("support.bytes", { p0: bytes });
  if (bytes < 1024 * 1024) return t("support.kilobytes", { p0: Math.round(bytes / 1024) });
  return t("support.megabytes", { p0: new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / (1024 * 1024)) });
}

// Returns a message when the file cannot be sent, or null when it looks fine.
export function attachmentProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!(ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return t("support.file_type_error", { p0: file.name });
  }
  if (file.size === 0) return t("support.empty_file", { p0: file.name });
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return t("support.file_too_large", { p0: file.name, p1: fileSizeLabel(file.size), p2: fileSizeLabel(MAX_ATTACHMENT_BYTES) });
  }
  return null;
}
