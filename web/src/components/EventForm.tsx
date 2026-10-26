import { useState, type FormEvent } from "react";
import type { Category, EventInput, EventView, Venue } from "../api/types";
import { eventFormValues, toEventInput, type EventFormValues } from "../utils/eventForm";
import { FormMessage } from "./Feedback";

interface EventFormProps {
  initial?: EventView;
  categories: Category[];
  venues: Venue[];
  submitLabel: string;
  busy: boolean;
  message: string;
  success?: boolean;
  onSubmit: (input: EventInput) => Promise<void>;
  onInvalid: (error: string) => void;
}

// One form for creating a draft and for editing an existing event. Window
// fields may stay blank; see utils/eventForm.ts for how they are derived.
export function EventForm({ initial, categories, venues, submitLabel, busy, message, success = false, onSubmit, onInvalid }: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>(() => eventFormValues(initial));
  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = toEventInput(values, initial);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    await onSubmit(result.input);
    if (!initial) setValues(eventFormValues());
  };

  return (
    <form className="live-form" onSubmit={(event) => void handleSubmit(event)}>
      <label className="field">
        <span>Event title</span>
        <input value={values.title} onChange={(e) => update("title", e.target.value)} required maxLength={200} placeholder="Give your event a name" />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea value={values.description} onChange={(e) => update("description", e.target.value)} rows={3} maxLength={20000} placeholder="What should guests know?" />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Category</span>
          <select value={values.category_id} onChange={(e) => update("category_id", e.target.value)} required>
            <option value="">Choose category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Venue</span>
          <select value={values.venue_id} onChange={(e) => update("venue_id", e.target.value)} required>
            <option value="">Choose venue</option>
            {venues.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.city}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Visibility</span>
          <select value={values.visibility} onChange={(e) => update("visibility", e.target.value as EventFormValues["visibility"])}>
            <option value="public">Public · listed in discovery</option>
            <option value="unlisted">Unlisted · link only</option>
            <option value="private">Private · invited accounts</option>
          </select>
        </label>
        <label className="field">
          <span>Capacity</span>
          <input type="number" min={0} max={100000} value={values.capacity} onChange={(e) => update("capacity", e.target.value)} required />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Starts</span>
          <input type="datetime-local" value={values.starts_at} onChange={(e) => update("starts_at", e.target.value)} required />
        </label>
        <label className="field">
          <span>Ends</span>
          <input type="datetime-local" value={values.ends_at} onChange={(e) => update("ends_at", e.target.value)} required />
        </label>
      </div>
      <details className="form-details" open={Boolean(initial)}>
        <summary>Registration, admission and refund windows</summary>
        <p className="form-intro">Leave a window blank to derive it: registration opens now and closes at the start; admission runs from start to end.</p>
        <div className="form-grid">
          <label className="field">
            <span>Registration opens</span>
            <input type="datetime-local" value={values.registration_opens_at} onChange={(e) => update("registration_opens_at", e.target.value)} />
          </label>
          <label className="field">
            <span>Registration closes</span>
            <input type="datetime-local" value={values.registration_closes_at} onChange={(e) => update("registration_closes_at", e.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Admission opens</span>
            <input type="datetime-local" value={values.admission_opens_at} onChange={(e) => update("admission_opens_at", e.target.value)} />
          </label>
          <label className="field">
            <span>Admission closes</span>
            <input type="datetime-local" value={values.admission_closes_at} onChange={(e) => update("admission_closes_at", e.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label className="field checkbox-field">
            <input type="checkbox" checked={values.refund_allowed} onChange={(e) => update("refund_allowed", e.target.checked)} />
            <span>Refunds allowed</span>
          </label>
          <label className="field">
            <span>Refund cutoff</span>
            <input type="datetime-local" value={values.refund_cutoff_at} onChange={(e) => update("refund_cutoff_at", e.target.value)} disabled={!values.refund_allowed} />
          </label>
        </div>
        <label className="field">
          <span>Time zone (IANA)</span>
          <input value={values.time_zone} onChange={(e) => update("time_zone", e.target.value)} maxLength={64} placeholder="Asia/Almaty" />
        </label>
      </details>
      <FormMessage message={message} success={success} />
      <button className="primary-button" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
