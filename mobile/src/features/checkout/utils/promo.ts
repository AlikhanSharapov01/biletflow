import type { PromoPreview } from "@/api/types/promo";
import { priceLabel } from "@/utils/format";

// A promo code from a campaign link or `?promo=` stays with its event while
// the app runs: it is stashed per event in a module-level store and read back
// when the event is opened again without the code.

export interface PromoStore {
  get(eventId: string): string | undefined;
  set(eventId: string, code: string): void;
  delete(eventId: string): void;
}

const memory = new Map<string, string>();

export const sessionPromoStore: PromoStore = {
  get: (eventId) => memory.get(eventId),
  set: (eventId, code) => void memory.set(eventId, code),
  delete: (eventId) => void memory.delete(eventId),
};

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function stashPromo(eventId: string, code: string, store: PromoStore = sessionPromoStore): void {
  try {
    if (code) store.set(eventId, code);
    else store.delete(eventId);
  } catch {
    // A failing store only means the code is not remembered.
  }
}

export function readStashedPromo(eventId: string, store: PromoStore = sessionPromoStore): string {
  try {
    return store.get(eventId) ?? "";
  } catch {
    return "";
  }
}

// Route param first (and remember it), otherwise whatever was stashed earlier.
export function initialPromo(eventId: string, fromRoute: string | null | undefined, store: PromoStore = sessionPromoStore): string {
  const code = normalizePromoCode(fromRoute ?? "");
  if (code) {
    stashPromo(eventId, code, store);
    return code;
  }
  return readStashedPromo(eventId, store);
}

export function promoSummary(preview: PromoPreview): string {
  const amount = preview.discount_kind === "percent" ? `${preview.discount_value}% off` : `${priceLabel(preview.discount_value)} off`;
  const scope = preview.eligible_ticket_type_ids.length > 0 ? "eligible tickets" : "every ticket";
  return `${preview.code}: ${amount} ${scope}`;
}

// Estimated discount on one ticket; the server's quote is authoritative.
export function promoDiscountFor(preview: PromoPreview | null, ticketTypeId: string, priceMinor: number): number {
  if (!preview || priceMinor <= 0) return 0;
  const eligible = preview.eligible_ticket_type_ids;
  if (eligible.length > 0 && !eligible.includes(ticketTypeId)) return 0;
  const raw = preview.discount_kind === "percent" ? Math.round((priceMinor * preview.discount_value) / 100) : preview.discount_value;
  return Math.min(priceMinor, Math.max(0, raw));
}
