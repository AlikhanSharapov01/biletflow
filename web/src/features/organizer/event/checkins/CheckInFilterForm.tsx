import { useState, type FormEvent } from "react";
import type { TicketType } from "../../../../api/types";
import type { CheckInFilters } from "../../../../api/types/admission";
import { Button, FormMessage, SelectField, TextField } from "../../../../components/ui";

interface CheckInFilterFormProps {
  types: TicketType[];
  initial: CheckInFilters;
  onApply: (filters: CheckInFilters) => void;
}

// Draft filters are applied together, so the log reloads once per change.
export function CheckInFilterForm({ types, initial, onApply }: CheckInFilterFormProps) {
  const [draft, setDraft] = useState<CheckInFilters>(initial);
  const [message, setMessage] = useState("");
  const set = <K extends keyof CheckInFilters>(key: K, value: CheckInFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = draft.q?.trim() ?? "";
    if (q.length === 1) {
      setMessage("Type at least two letters of the attendee’s name.");
      return;
    }
    if (draft.from && draft.to && draft.to < draft.from) {
      setMessage("“To” must be after “From”.");
      return;
    }
    setMessage("");
    onApply({ ...draft, q });
  };

  const reset = () => {
    setDraft({});
    setMessage("");
    onApply({});
  };

  return (
    <form className="filter-bar" onSubmit={submit} aria-label="Check-in filters">
      <TextField label="Attendee" hint="Name, 2+ letters" value={draft.q ?? ""} onChange={(e) => set("q", e.target.value)} maxLength={100} />
      <TextField label="From" type="datetime-local" value={draft.from ?? ""} onChange={(e) => set("from", e.target.value)} />
      <TextField label="To" type="datetime-local" value={draft.to ?? ""} onChange={(e) => set("to", e.target.value)} />
      <SelectField label="Source" value={draft.source ?? ""} onChange={(e) => set("source", e.target.value as CheckInFilters["source"])}>
        <option value="">Any source</option>
        <option value="online">Online scan</option>
        <option value="offline_sync">Offline sync</option>
      </SelectField>
      <SelectField label="State" value={draft.state ?? ""} onChange={(e) => set("state", e.target.value as CheckInFilters["state"])}>
        <option value="">Any state</option>
        <option value="current">Admitted</option>
        <option value="reversed">Reversed</option>
      </SelectField>
      <SelectField label="Ticket type" value={draft.ticket_type_id ?? ""} onChange={(e) => set("ticket_type_id", e.target.value)}>
        <option value="">All ticket types</option>
        {types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </SelectField>
      <div className="filter-actions">
        <Button variant="primary" size="sm" type="submit">
          Apply
        </Button>
        <Button size="sm" onClick={reset}>
          Reset
        </Button>
      </div>
      <FormMessage message={message} />
    </form>
  );
}
