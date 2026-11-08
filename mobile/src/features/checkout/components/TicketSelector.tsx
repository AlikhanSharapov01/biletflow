import type { Dispatch, ReactNode, SetStateAction } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { EventView, TicketType } from "@/api/types";
import type { PromoPreview } from "@/api/types/promo";
import { PrimaryButton, StatusPill } from "@/components/ui";
import { colors, fonts, statusTones } from "@/theme";
import { priceLabel } from "@/utils/format";
import { PAID_NOTE, ticketAvailability, totalQuantity, type Quantities } from "../utils/checkout";
import { promoDiscountFor } from "../utils/promo";
import { checkoutStyles } from "./checkoutStyles";
import { FormMessage } from "@/components/ui/FormMessage";
import { QuantityStepper } from "./QuantityStepper";

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
    <View style={checkoutStyles.stack}>
      <View>
        {tickets.map((type, index) => {
          const availability = ticketAvailability(type, event);
          const quantity = quantities[type.id] ?? 0;
          const discount = promoDiscountFor(promo, type.id, type.price_minor);
          return (
            <View style={[styles.option, index > 0 && styles.divider]} key={type.id}>
              <View style={styles.copy}>
                <Text style={styles.name}>{type.name}</Text>
                {type.description ? <Text style={styles.small}>{type.description}</Text> : null}
                {availability.reason ? (
                  <Text style={[styles.small, availability.reason === PAID_NOTE ? styles.paidNote : styles.reason]}>{availability.reason}</Text>
                ) : null}
                {discount > 0 ? <Text style={[styles.small, styles.promo]}>Promo: about {priceLabel(discount)} off each</Text> : null}
                <Text style={checkoutStyles.price}>{priceLabel(type.price_minor)}</Text>
              </View>
              {availability.purchasable ? (
                <QuantityStepper
                  name={type.name}
                  value={quantity}
                  max={availability.maxQuantity}
                  onChange={(next) => setQuantities((current) => ({ ...current, [type.id]: next }))}
                />
              ) : (
                <StatusPill tone="neutral" label="Unavailable" />
              )}
            </View>
          );
        })}
      </View>
      {promoSlot}
      <FormMessage message={message} />
      <View style={checkoutStyles.actions}>
        <PrimaryButton
          label={busy ? "Reserving…" : selected > 0 ? `Reserve ${selected} ticket${selected === 1 ? "" : "s"}` : "Reserve tickets"}
          disabled={busy || selected === 0}
          onPress={onReserve}
        />
        <Text style={checkoutStyles.intro}>Tickets are held for 10 minutes while you add recipients.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  copy: { flex: 1, gap: 3 },
  name: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
  small: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  paidNote: { color: colors.muted },
  reason: { color: statusTones.pending.color },
  promo: { color: colors.green, fontWeight: "600" },
});
