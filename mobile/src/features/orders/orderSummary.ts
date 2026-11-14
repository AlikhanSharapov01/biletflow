import type { Order } from "@/api/types/checkout";
import { t } from "@/i18n";

// Orders carry their event only through the issued tickets (web orders/orderSummary.ts).
export function orderTitle(order: Order): string {
  return order.items[0]?.ticket?.event_title ?? t("common.event");
}

export function orderStart(order: Order): string | null {
  return order.items[0]?.ticket?.event_starts_at ?? null;
}
