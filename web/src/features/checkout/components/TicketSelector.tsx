import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { EventView, TicketType } from "../../../api/types";
import type { PromoPreview } from "../../../api/types/promo";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { StatusPill } from "../../../components/ui/StatusPill";
import { priceLabel } from "../../../utils/format";
import { PAID_NOTE, ticketAvailability, totalQuantity, type Quantities } from "../utils/checkout";
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
                  <small className={availability.reason === PAID_NOTE ? "ticket-paid-note" : "ticket-reason"}>{availability.reason}</small>
                ) : null}
                {discount > 0 ? <small className="ticket-promo">Promo: about {priceLabel(discount)} off each</small> : null}
              </div>
              <span className="price">{priceLabel(type.price_minor)}</span>
              {availability.purchasable ? (
                <label className="qty-field">
                  <span className="visually-hidden">Quantity for {type.name}</span>
                  <select value={quantity} onChange={(e) => setQuantities((current) => ({ ...current, [type.id]: Number(e.target.value) }))}>
                    {Array.from({ length: availability.maxQuantity + 1 }, (_, count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <StatusPill tone="neutral">Unavailable</StatusPill>
              )}
            </div>
          );
        })}
      </div>
      {promoSlot}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" disabled={busy || selected === 0} onClick={onReserve}>
          {busy ? "Reserving…" : selected > 0 ? `Reserve ${selected} ticket${selected === 1 ? "" : "s"}` : "Reserve tickets"}
        </Button>
        <small className="form-intro">Tickets are held for 10 minutes while you add recipients.</small>
      </div>
    </div>
  );
}
