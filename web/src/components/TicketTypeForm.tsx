import { useState, type FormEvent } from "react";
import type { EventView, TicketType, TicketTypeInput } from "../api/types";
import { ticketTypeFormValues, toTicketTypeInput, type TicketTypeFormValues } from "../utils/eventForm";
import { FormMessage } from "./Feedback";

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
    <form className="live-form" onSubmit={(formEvent) => void handleSubmit(formEvent)}>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={values.name} onChange={(e) => update("name", e.target.value)} required maxLength={200} placeholder="e.g. General admission" />
        </label>
        <label className="field">
          <span>Kind</span>
          <select value={values.kind} onChange={(e) => update("kind", e.target.value as TicketTypeFormValues["kind"])}>
            <option value="free">Free</option>
            <option value="paid">Paid (checkout not available yet)</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <input value={values.description} onChange={(e) => update("description", e.target.value)} maxLength={5000} placeholder="Optional" />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Price (KZT)</span>
          <input type="number" min={0} step="0.01" value={values.kind === "paid" ? values.price : "0"} onChange={(e) => update("price", e.target.value)} disabled={values.kind !== "paid"} />
        </label>
        <label className="field">
          <span>Quantity</span>
          <input type="number" min={0} max={event.capacity} value={values.quantity_limit} onChange={(e) => update("quantity_limit", e.target.value)} required placeholder={`Up to ${event.capacity}`} />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Per-order limit</span>
          <input type="number" min={1} max={100} value={values.per_order_limit} onChange={(e) => update("per_order_limit", e.target.value)} required />
        </label>
        <label className="field checkbox-field">
          <input type="checkbox" checked={values.is_hidden} onChange={(e) => update("is_hidden", e.target.checked)} />
          <span>Hidden from attendees</span>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Sales open</span>
          <input type="datetime-local" value={values.sales_open_at} onChange={(e) => update("sales_open_at", e.target.value)} />
        </label>
        <label className="field">
          <span>Sales close</span>
          <input type="datetime-local" value={values.sales_close_at} onChange={(e) => update("sales_close_at", e.target.value)} />
        </label>
      </div>
      <p className="form-intro">Blank sales windows follow the event’s registration window.</p>
      <FormMessage message={message} />
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button className="subtle-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
