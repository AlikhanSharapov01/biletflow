import { t } from "../../../../i18n";
import { fileSizeLabel } from "../../../support/attachments";

// Event images accept PNG and JPEG only: the backend's fixed IMAGE_TYPES in
// event_image_service.py. The size limit is the platform's current
// `upload_max_bytes`; null (settings unknown) leaves the size to the server.
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;

export function imageProblem(file: Pick<File, "type" | "size">, maxBytes: number | null): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return t("org.image_types_error");
  if (file.size === 0) return t("org.image_empty");
  if (maxBytes !== null && file.size > maxBytes) return t("org.image_size_error", { p0: fileSizeLabel(maxBytes) });
  return null;
}

// Moves one id a step up or down and returns the new order, or null when
// it is already at that end.
export function movedOrder(ids: string[], imageId: string, step: -1 | 1): string[] | null {
  const from = ids.indexOf(imageId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
