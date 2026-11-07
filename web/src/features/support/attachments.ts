// Client-side checks that mirror the backend defaults in SUPPORT_API.md
// (ATTACHMENT_MAX_BYTES 5 MiB, ATTACHMENT_MAX_PER_MESSAGE 5). The server
// remains the authority and its errors are still shown.
export const ACCEPTED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns a message when the file cannot be sent, or null when it looks fine.
export function attachmentProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!(ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: only PNG, JPEG and PDF files can be attached.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is ${fileSizeLabel(file.size)}; the limit is ${fileSizeLabel(MAX_ATTACHMENT_BYTES)}.`;
  }
  return null;
}
