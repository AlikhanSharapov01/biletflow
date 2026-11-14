import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/api/errors";
import { updateSeat } from "@/api/seating";
import type { EventView, TicketType } from "@/api/types";
import type { SeatAvailability } from "@/api/types/seating";
import { Panel, PrimaryButton, SelectField, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { priceLabel, statusLabel } from "@/utils/format";

import { CheckboxField } from "../../components/CheckboxField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";
import { SectionHeading } from "../../components/SectionHeading";
import { seatEditable, seatName } from "../../utils/seating";
import { t, useLocale } from "@/i18n";

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

  const save = async () => {
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

  const tone = seat.status === "available" ? "positive" : seat.status === "blocked" ? "blocked" : "neutral";
  return (
    <Panel>
      <SectionHeading
        title={seatName(seat)}
        subtitle={seat.is_accessible ? t("org.seat_accessible") : undefined}
        trailing={<StatusPill tone={tone} label={statusLabel(seat.status)} />}
      />
      <View style={formStyles.stack}>
        {!editable ? <Intro>{t("org.seat_locked_hint")}</Intro> : null}
        <SelectField
          label={t("org.ticket_type")}
          value={typeId}
          options={types.map((type) => ({ value: type.id, label: `${type.name} · ${priceLabel(type.price_minor)}` }))}
          onChange={setTypeId}
          disabled={!editable}
        />
        <CheckboxField label={t("org.seat_blocked")} checked={blocked} onChange={setBlocked} disabled={!editable} />
        {seat.paid_activation_required ? <Intro>{t("org.paid_seats_hint")}</Intro> : null}
        <FormMessage message={state.message} />
        <View style={formStyles.actions}>
          <PrimaryButton label={t("org.save_seat")} onPress={() => void save()} disabled={!editable} loading={state.busy} />
          <SubtleButton label={t("common.close")} onPress={onClose} />
        </View>
      </View>
    </Panel>
  );
}
