import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/api/errors";
import { configureSeats } from "@/api/seating";
import type { EventView, TicketType } from "@/api/types";
import type { VenueLayoutDetail } from "@/api/types/seating";
import { Panel, PrimaryButton, SelectField, StatusPill } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { priceLabel, statusLabel } from "@/utils/format";

import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";
import { SectionHeading } from "../../components/SectionHeading";
import { priceCategories } from "../../utils/seating";
import { t, useLocale } from "@/i18n";

interface SeatMappingFormProps {
  event: EventView;
  layout: VenueLayoutDetail;
  types: TicketType[];
  onConfigured: () => void;
}

// One-time setup: every price category of the layout needs a ticket type.
export function SeatMappingForm({ event, layout, types, onConfigured }: SeatMappingFormProps) {
  useLocale();
  const { notify } = useToast();
  const categories = priceCategories(layout.seats);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [state, setState] = useState({ busy: false, message: "" });
  const options = types.map((type) => ({
    value: type.id,
    label: t("mobile.org.mapping_meta", { p0: type.name, p1: priceLabel(type.price_minor), p2: type.quantity_limit }),
  }));

  const submit = async () => {
    if (categories.some((category) => !mapping[category])) {
      setState({ busy: false, message: t("org.choose_type_per_category") });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      const result = await configureSeats(event.id, mapping);
      notify(t("org.seats_configured", { p0: result.configured_seats }));
      onConfigured();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <Panel>
      <SectionHeading
        title={t("org.seat_setup", { p0: layout.name })}
        subtitle={t("org.seat_mapping_hint")}
        trailing={<StatusPill tone="pending" label={t("mobile.org.seats_to_create", { p0: layout.seats.length })} />}
      />
      <View style={formStyles.stack}>
        {types.length === 0 ? <Intro>{t("org.add_types_first")}</Intro> : null}
        {categories.map((category) => {
          const count = layout.seats.filter((seat) => seat.price_category === category).length;
          return (
            <SelectField
              key={category}
              label={t("org.section_seats", { p0: statusLabel(category), p1: count })}
              value={mapping[category] ?? ""}
              placeholder={t("org.choose_ticket_type")}
              options={options}
              onChange={(value) => setMapping((current) => ({ ...current, [category]: value }))}
            />
          );
        })}
        <Intro>{t("org.seats_fit_limits")}</Intro>
        <FormMessage message={state.message} />
        <PrimaryButton label={t("org.create_seats")} onPress={() => void submit()} disabled={types.length === 0} loading={state.busy} />
      </View>
    </Panel>
  );
}
