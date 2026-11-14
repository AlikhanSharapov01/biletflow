import { t } from "@/i18n";

// Client-side checks that mirror the backend defaults in SUPPORT_API.md
// (ATTACHMENT_MAX_BYTES 5 MiB, ATTACHMENT_MAX_PER_MESSAGE 5). The server
// remains the authority and its errors are still shown.
export const ACCEPTED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return t("support.bytes", { p0: bytes });
  if (bytes < 1024 * 1024) return t("support.kilobytes", { p0: Math.round(bytes / 1024) });
  return t("support.megabytes", { p0: (bytes / (1024 * 1024)).toFixed(1) });
}

export interface PickedFileInfo {
  name: string;
  type: string;
  // Unknown on some devices; the server then checks the size.
  size?: number;
}

// The document picker sometimes leaves out the type; guess it from the name.
export function attachmentType(name: string, mimeType?: string | null): string {
  if (mimeType) return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "pdf") return "application/pdf";
  return "application/octet-stream";
}

// Returns a message when the file cannot be sent, or null when it looks fine.
export function attachmentProblem(file: PickedFileInfo): string | null {
  if (!(ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return t("support.file_type_error", { p0: file.name });
  }
  if (file.size === 0) return t("support.empty_file", { p0: file.name });
  if (file.size !== undefined && file.size > MAX_ATTACHMENT_BYTES) {
    return t("support.file_too_large", { p0: file.name, p1: fileSizeLabel(file.size), p2: fileSizeLabel(MAX_ATTACHMENT_BYTES) });
  }
  return null;
}
