import { isoToLocalInput, localInputToIso } from "@/utils/format";

// Phones have no datetime-local input, so dates are typed as
// "YYYY-MM-DD HH:mm". A space or a "T" between date and time both work.
export const DATE_TIME_HINT = "YYYY-MM-DD HH:mm";
export const DATE_HINT = "YYYY-MM-DD";

export function readLocalInput(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  return localInputToIso(text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T"));
}

export function toLocalInput(value: string | null | undefined): string {
  return isoToLocalInput(value).replace("T", " ");
}
