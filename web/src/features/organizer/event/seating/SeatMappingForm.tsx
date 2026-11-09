import { t, useLocale } from "../../../../i18n";
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
  useLocale();
  const { notify } = useToast();
  const categories = priceCategories(layout.seats);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [state, setState] = useState({ busy: false, message: "" });

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
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
      <PanelHeading
        title={t("org.seat_setup", { p0: layout.name })}
        subtitle={t("org.seat_mapping_hint")}
        trailing={<StatusPill tone="pending">{layout.seats.length}{" "}{t("org.seats_to_create")}</StatusPill>}
      />
      {types.length === 0 ? <p className="form-intro">{t("org.add_types_first")}</p> : null}
      <form className="form-stack" onSubmit={(formEvent) => void submit(formEvent)}>
        <div className="form-grid">
          {categories.map((category) => {
            const count = layout.seats.filter((seat) => seat.price_category === category).length;
            return (
              <SelectField
                key={category}
                label={t("org.section_seats", { p0: statusLabel(category), p1: count })}
                value={mapping[category] ?? ""}
                onChange={(e) => setMapping((current) => ({ ...current, [category]: e.target.value }))}
                required
              >
                <option value="">{t("org.choose_ticket_type")}</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} · {priceLabel(type.price_minor)} · {type.quantity_limit}{" "}{t("word.available")}</option>
                ))}
              </SelectField>
            );
          })}
        </div>
        <p className="form-intro">{t("org.seats_fit_limits")}</p>
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy || types.length === 0}>{t("org.create_seats")}</Button>
        </div>
      </form>
    </Panel>
  );
}
