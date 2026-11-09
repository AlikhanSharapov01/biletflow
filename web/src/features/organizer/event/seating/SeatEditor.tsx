import { t, useLocale } from "../../../../i18n";
import { useState, type FormEvent } from "react";
import { describeError } from "../../../../api/errors";
import { updateSeat } from "../../../../api/seating";
import type { EventView, TicketType } from "../../../../api/types";
import type { SeatAvailability } from "../../../../api/types/seating";
import { Button, CheckboxField, FormMessage, Panel, PanelHeading, SelectField, StatusPill, useToast } from "../../../../components/ui";
import { priceLabel, statusLabel } from "../../../../utils/format";
import { seatEditable, seatName } from "../../utils/seating";

interface SeatEditorProps {
  event: EventView;
  seat: SeatAvailability;
  types: TicketType[];
  onSaved: () => void;
  onClose: () => void;
}

export function SeatEditor({ event, seat, types, onSaved, onClose }: SeatEditorProps) {
  useLocale();
  const { notify } = useToast();
  const [blocked, setBlocked] = useState(seat.is_blocked);
  const [typeId, setTypeId] = useState(seat.ticket_type_id);
  const [state, setState] = useState({ busy: false, message: "" });
  const editable = seatEditable(seat);

  const save = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setState({ busy: true, message: "" });
    try {
      await updateSeat(event.id, seat.id, { is_blocked: blocked, ticket_type_id: typeId === seat.ticket_type_id ? null : typeId });
      notify(t("org.seat_updated"));
      setState({ busy: false, message: "" });
      onSaved();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <Panel>
      <PanelHeading
        title={seatName(seat)}
        subtitle={seat.is_accessible ? t("org.seat_accessible") : undefined}
        trailing={<StatusPill tone={seat.status === "available" ? "positive" : seat.status === "blocked" ? "blocked" : "neutral"}>{statusLabel(seat.status)}</StatusPill>}
      />
      {!editable ? <p className="form-intro">{t("org.seat_locked_hint")}</p> : null}
      <form className="form-stack" onSubmit={(formEvent) => void save(formEvent)}>
        <div className="form-grid">
          <SelectField label={t("org.ticket_type")} value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={!editable}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} · {priceLabel(type.price_minor)}
              </option>
            ))}
          </SelectField>
          <CheckboxField label={t("org.seat_blocked")} checked={blocked} onChange={(e) => setBlocked(e.target.checked)} disabled={!editable} />
        </div>
        {seat.paid_activation_required ? <p className="form-intro">{t("org.paid_seats_hint")}</p> : null}
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={!editable || state.busy}>{t("org.save_seat")}</Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </form>
    </Panel>
  );
}
