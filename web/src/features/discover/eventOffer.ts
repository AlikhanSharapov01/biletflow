import type { EventView } from "../../api/types";
import { t } from "../../i18n";
import { priceLabel } from "../../utils/format";

export type EventOfferKind = "ended" | "sales_ended" | "sold_out" | "none" | "free" | "from";

// What a card says about buying tickets. Checked in order: the event is over, sales
// are closed, nothing is left, no public ticket type exists, then the price. A price
// of 0 means the cheapest ticket on sale is free; paid types may still exist.
export function eventOffer(event: EventView): { kind: EventOfferKind; label: string } {
  if (event.time_status === "completed") return { kind: "ended", label: t("discover.offer_ended") };
  if (Date.now() >= Date.parse(event.registration_closes_at)) return { kind: "sales_ended", label: t("discover.offer_sales_ended") };
  if (event.sold_out) return { kind: "sold_out", label: t("discover.offer_sold_out") };
  if (event.price_from_minor === null) return { kind: "none", label: t("discover.offer_none") };
  if (event.price_from_minor === 0) return { kind: "free", label: t("common.free") };
  return { kind: "from", label: t("discover.offer_from", { price: priceLabel(event.price_from_minor) }) };
}
