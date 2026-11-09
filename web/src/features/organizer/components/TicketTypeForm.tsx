import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import type { EventView, TicketType, TicketTypeInput } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { CheckboxField, SelectField, TextField } from "../../../components/ui/Field";
import { ticketTypeFormValues, toTicketTypeInput, type TicketTypeFormValues } from "../utils/eventForm";

interface TicketTypeFormProps {
  event: EventView;
  initial?: TicketType;
  submitLabel: string;
  busy: boolean;
  message: string;
  onSubmit: (input: TicketTypeInput) => Promise<void>;
  onInvalid: (error: string) => void;
  onCancel?: () => void;
}

export function TicketTypeForm({ event, initial, submitLabel, busy, message, onSubmit, onInvalid, onCancel }: TicketTypeFormProps) {
  useLocale();
  const [values, setValues] = useState<TicketTypeFormValues>(() => ticketTypeFormValues(initial));
  const update = <K extends keyof TicketTypeFormValues>(key: K, value: TicketTypeFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const result = toTicketTypeInput(values, event);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    await onSubmit(result.input);
    if (!initial) setValues(ticketTypeFormValues());
  };

  return (
    <form className="form-stack" onSubmit={(formEvent) => void handleSubmit(formEvent)}>
      <div className="form-grid">
        <TextField label={t("common.name")} value={values.name} onChange={(e) => update("name", e.target.value)} required maxLength={200} placeholder={t("org.ticket_example")} />
        <SelectField label={t("org.kind")} value={values.kind} onChange={(e) => update("kind", e.target.value as TicketTypeFormValues["kind"])}>
          <option value="free">{t("common.free")}</option>
          <option value="paid">{t("org.paid_kind")}</option>
        </SelectField>
      </div>
      <TextField label={t("common.description")} value={values.description} onChange={(e) => update("description", e.target.value)} maxLength={5000} placeholder={t("common.optional")} />
      <div className="form-grid">
        <TextField
          label={t("org.price_kzt")}
          type="number"
          min={0}
          step="0.01"
          value={values.kind === "paid" ? values.price : "0"}
          onChange={(e) => update("price", e.target.value)}
          disabled={values.kind !== "paid"}
        />
        <TextField
          label={t("common.quantity")}
          type="number"
          min={0}
          max={event.capacity}
          value={values.quantity_limit}
          onChange={(e) => update("quantity_limit", e.target.value)}
          required
          placeholder={t("org.up_to", { p0: event.capacity })}
        />
      </div>
      <div className="form-grid">
        <TextField label={t("org.per_order_limit")} type="number" min={1} max={100} value={values.per_order_limit} onChange={(e) => update("per_order_limit", e.target.value)} required />
        <CheckboxField label={t("org.hidden_attendees")} checked={values.is_hidden} onChange={(e) => update("is_hidden", e.target.checked)} />
      </div>
      <div className="form-grid">
        <TextField label={t("org.sales_open")} type="datetime-local" value={values.sales_open_at} onChange={(e) => update("sales_open_at", e.target.value)} />
        <TextField label={t("org.sales_close")} type="datetime-local" value={values.sales_close_at} onChange={(e) => update("sales_close_at", e.target.value)} />
      </div>
      <p className="form-intro">{t("org.sales_window_hint")}</p>
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>{t("common.cancel")}</Button> : null}
      </div>
    </form>
  );
}
