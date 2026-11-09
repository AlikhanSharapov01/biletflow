import { t } from "../../i18n";
import type { Order } from "../../api/types";

// Orders carry their event only through the issued tickets.
export function orderTitle(order: Order): string {
  return order.items[0]?.ticket?.event_title ?? t("common.event");
}

export function orderStart(order: Order): string | null {
  return order.items[0]?.ticket?.event_starts_at ?? null;
}
