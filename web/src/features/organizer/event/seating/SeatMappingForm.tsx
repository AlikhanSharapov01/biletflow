import { useState, type FormEvent } from "react";
import { describeError } from "../../../../api/errors";
import { configureSeats } from "../../../../api/seating";
import type { EventView, TicketType } from "../../../../api/types";
import type { VenueLayoutDetail } from "../../../../api/types/seating";
import { Button, FormMessage, Panel, PanelHeading, SelectField, StatusPill, useToast } from "../../../../components/ui";
import { priceLabel, statusLabel } from "../../../../utils/format";
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

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
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
      <PanelHeading
        title={`Set up seats · ${layout.name}`}
        subtitle="Map each price category of this predefined layout to one of the event’s ticket types. Seats are created once; you can block or retarget single seats afterwards."
        trailing={<StatusPill tone="pending">{layout.seats.length} seats to create</StatusPill>}
      />
      {types.length === 0 ? <p className="form-intro">Add ticket types first, in the Ticket types tab.</p> : null}
      <form className="form-stack" onSubmit={(formEvent) => void submit(formEvent)}>
        <div className="form-grid">
          {categories.map((category) => {
            const count = layout.seats.filter((seat) => seat.price_category === category).length;
            return (
              <SelectField
                key={category}
                label={`${statusLabel(category)} · ${count} seats`}
                value={mapping[category] ?? ""}
                onChange={(e) => setMapping((current) => ({ ...current, [category]: e.target.value }))}
                required
              >
                <option value="">Choose ticket type</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} · {priceLabel(type.price_minor)} · {type.quantity_limit} available
                  </option>
                ))}
              </SelectField>
            );
          })}
        </div>
        <p className="form-intro">Unblocked seats must fit the event capacity and each ticket type’s quantity. Raise limits first if needed.</p>
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy || types.length === 0}>
            Create seats
          </Button>
        </div>
      </form>
    </Panel>
  );
}
