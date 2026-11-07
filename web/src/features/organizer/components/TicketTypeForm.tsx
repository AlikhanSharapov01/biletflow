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
        <TextField label="Name" value={values.name} onChange={(e) => update("name", e.target.value)} required maxLength={200} placeholder="e.g. General admission" />
        <SelectField label="Kind" value={values.kind} onChange={(e) => update("kind", e.target.value as TicketTypeFormValues["kind"])}>
          <option value="free">Free</option>
          <option value="paid">Paid (checkout not available yet)</option>
        </SelectField>
      </div>
      <TextField label="Description" value={values.description} onChange={(e) => update("description", e.target.value)} maxLength={5000} placeholder="Optional" />
      <div className="form-grid">
        <TextField
          label="Price (KZT)"
          type="number"
          min={0}
          step="0.01"
          value={values.kind === "paid" ? values.price : "0"}
          onChange={(e) => update("price", e.target.value)}
          disabled={values.kind !== "paid"}
        />
        <TextField
          label="Quantity"
          type="number"
          min={0}
          max={event.capacity}
          value={values.quantity_limit}
          onChange={(e) => update("quantity_limit", e.target.value)}
          required
          placeholder={`Up to ${event.capacity}`}
        />
      </div>
      <div className="form-grid">
        <TextField label="Per-order limit" type="number" min={1} max={100} value={values.per_order_limit} onChange={(e) => update("per_order_limit", e.target.value)} required />
        <CheckboxField label="Hidden from attendees" checked={values.is_hidden} onChange={(e) => update("is_hidden", e.target.checked)} />
      </div>
      <div className="form-grid">
        <TextField label="Sales open" type="datetime-local" value={values.sales_open_at} onChange={(e) => update("sales_open_at", e.target.value)} />
        <TextField label="Sales close" type="datetime-local" value={values.sales_close_at} onChange={(e) => update("sales_close_at", e.target.value)} />
      </div>
      <p className="form-intro">Blank sales windows follow the event’s registration window.</p>
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}
