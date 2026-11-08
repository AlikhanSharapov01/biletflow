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

interface SeatMappingFormProps {
  event: EventView;
  layout: VenueLayoutDetail;
  types: TicketType[];
  onConfigured: () => void;
}

// One-time setup: every price category of the layout needs a ticket type.
export function SeatMappingForm({ event, layout, types, onConfigured }: SeatMappingFormProps) {
  const { notify } = useToast();
  const categories = priceCategories(layout.seats);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [state, setState] = useState({ busy: false, message: "" });
  const options = types.map((type) => ({
    value: type.id,
    label: `${type.name} · ${priceLabel(type.price_minor)} · ${type.quantity_limit} available`,
  }));

  const submit = async () => {
    if (categories.some((category) => !mapping[category])) {
      setState({ busy: false, message: "Choose a ticket type for every price category." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      const result = await configureSeats(event.id, mapping);
      notify(`${result.configured_seats} seats configured.`);
      onConfigured();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <Panel>
      <SectionHeading
        title={`Set up seats · ${layout.name}`}
        subtitle="Map each price category of this predefined layout to one of the event’s ticket types. Seats are created once; you can block or retarget single seats afterwards."
        trailing={<StatusPill tone="pending" label={`${layout.seats.length} seats to create`} />}
      />
      <View style={formStyles.stack}>
        {types.length === 0 ? <Intro>Add ticket types first, in the Ticket types tab.</Intro> : null}
        {categories.map((category) => {
          const count = layout.seats.filter((seat) => seat.price_category === category).length;
          return (
            <SelectField
              key={category}
              label={`${statusLabel(category)} · ${count} seats`}
              value={mapping[category] ?? ""}
              placeholder="Choose ticket type"
              options={options}
              onChange={(value) => setMapping((current) => ({ ...current, [category]: value }))}
            />
          );
        })}
        <Intro>Unblocked seats must fit the event capacity and each ticket type’s quantity. Raise limits first if needed.</Intro>
        <FormMessage message={state.message} />
        <PrimaryButton label="Create seats" onPress={() => void submit()} disabled={types.length === 0} loading={state.busy} />
      </View>
    </Panel>
  );
}
