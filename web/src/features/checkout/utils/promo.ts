import { t } from "../../../i18n";
import type { PromoPreview } from "../../../api/types/promo";
import { priceLabel } from "../../../utils/format";

// A promo code from `?promo=` survives the trip through sign-in: it is stashed
// per event in sessionStorage and read back when the URL no longer has it.

const KEY_PREFIX = "biletflow:promo:";

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function stashPromo(eventId: string, code: string, storage: Storage | null = safeStorage()): void {
  try {
    if (code) storage?.setItem(KEY_PREFIX + eventId, code);
    else storage?.removeItem(KEY_PREFIX + eventId);
  } catch {
    // Storage disabled (private mode, quota): the code just isn't remembered.
  }
}

export function readStashedPromo(eventId: string, storage: Storage | null = safeStorage()): string {
  try {
    return storage?.getItem(KEY_PREFIX + eventId) ?? "";
  } catch {
    return "";
  }
}

// URL first (and remember it), otherwise whatever was stashed before sign-in.
export function initialPromo(eventId: string, fromUrl: string | null, storage: Storage | null = safeStorage()): string {
  const code = normalizePromoCode(fromUrl ?? "");
  if (code) {
    stashPromo(eventId, code, storage);
    return code;
  }
  return readStashedPromo(eventId, storage);
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function promoSummary(preview: PromoPreview): string {
  const amount = preview.discount_kind === "percent" ? t("checkout.percent_off", { p0: preview.discount_value }) : t("checkout.amount_off", { p0: priceLabel(preview.discount_value) });
  const scope = preview.eligible_ticket_type_ids.length > 0 ? t("checkout.eligible_tickets") : t("checkout.every_ticket");
  return `${preview.code}: ${amount} ${scope}${preview.discount_kind === "fixed" ? (" " + t("checkout.once_per_order")) : ""}`;
}

// Estimated discount on one ticket; the server's quote is authoritative.
export function promoDiscountFor(preview: PromoPreview | null, ticketTypeId: string, priceMinor: number): number {
  if (!preview || priceMinor <= 0) return 0;
  const eligible = preview.eligible_ticket_type_ids;
  if (eligible.length > 0 && !eligible.includes(ticketTypeId)) return 0;
  // A fixed discount applies once to the basket, then the server apportions it.
  // It cannot be estimated for one ticket independently of the basket.
  if (preview.discount_kind === "fixed") return 0;
  const raw = Math.round((priceMinor * preview.discount_value) / 100);
  return Math.min(priceMinor, Math.max(0, raw));
}
