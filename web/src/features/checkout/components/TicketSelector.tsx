import { quantityLabel, t, useLocale } from "../../../i18n";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { EventView, TicketType } from "../../../api/types";
import type { PromoPreview } from "../../../api/types/promo";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { StatusPill } from "../../../components/ui/StatusPill";
import { priceLabel } from "../../../utils/format";
import { ticketAvailability, totalQuantity, type Quantities } from "../utils/checkout";
import { promoDiscountFor } from "../utils/promo";

interface TicketSelectorProps {
  event: EventView;
  tickets: TicketType[];
  quantities: Quantities;
  setQuantities: Dispatch<SetStateAction<Quantities>>;
  busy: boolean;
  message: string;
  promo: PromoPreview | null;
  promoSlot?: ReactNode;
  onReserve: () => void;
}

// Step one: choose a quantity per ticket type, then reserve them.
export function TicketSelector({ event, tickets, quantities, setQuantities, busy, message, promo, promoSlot, onReserve }: TicketSelectorProps) {
  useLocale();
  const selected = totalQuantity(quantities);

  return (
    <div className="checkout">
      <div className="ticket-options">
        {tickets.map((type) => {
          const availability = ticketAvailability(type, event);
          const quantity = quantities[type.id] ?? 0;
          const discount = promoDiscountFor(promo, type.id, type.price_minor);
          return (
            <div className="ticket-option" key={type.id}>
              <div className="ticket-option-copy">
                <strong>{type.name}</strong>
                {type.description ? <small>{type.description}</small> : null}
                {availability.reason ? (
                  <small className={availability.reason === t("checkout.paid_note") ? "ticket-paid-note" : "ticket-reason"}>{availability.reason}</small>
                ) : null}
                {discount > 0 ? <small className="ticket-promo">{t("checkout.promo_estimate")}{" "}{priceLabel(discount)}{" "}{t("checkout.off_each")}</small> : null}
              </div>
              <span className="price">{priceLabel(type.price_minor)}</span>
              {availability.purchasable ? (
                <label className="qty-field">
                  <span className="visually-hidden">{t("checkout.quantity_for")}{" "}{type.name}</span>
                  <select value={quantity} onChange={(e) => setQuantities((current) => ({ ...current, [type.id]: Number(e.target.value) }))}>
                    {Array.from({ length: availability.maxQuantity + 1 }, (_, count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <StatusPill tone="neutral">{t("checkout.unavailable")}</StatusPill>
              )}
            </div>
          );
        })}
      </div>
      {promoSlot}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" disabled={busy || selected === 0} onClick={onReserve}>
          {busy ? t("checkout.reserving") : selected > 0 ? t("checkout.reserve_count", { items: quantityLabel("ticket", selected) }) : t("checkout.reserve_tickets")}
        </Button>
        <small className="form-intro">{t("checkout.hold_hint")}</small>
      </div>
    </div>
  );
}
