import { useState, type FormEvent } from "react";
import type { TicketType } from "../../../../api/types";
import type { Campaign, CampaignInput } from "../../../../api/types/campaigns";
import { Button, FormMessage, SelectField, TextField } from "../../../../components/ui";
import { campaignFormValues, toCampaignInput, type CampaignFormValues } from "../../utils/campaignForm";

interface CampaignFormProps {
  types: TicketType[];
  initial?: Campaign;
  submitLabel: string;
  disabled?: boolean;
  busy: boolean;
  message: string;
  onSubmit: (input: CampaignInput) => Promise<void>;
  onInvalid: (error: string) => void;
  onCancel?: () => void;
}

export function CampaignForm({ types, initial, submitLabel, disabled = false, busy, message, onSubmit, onInvalid, onCancel }: CampaignFormProps) {
  const [values, setValues] = useState<CampaignFormValues>(() => campaignFormValues(initial));
  const update = <K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const toggleType = (id: string) =>
    update("eligible_ticket_type_ids", values.eligible_ticket_type_ids.includes(id) ? values.eligible_ticket_type_ids.filter((item) => item !== id) : [...values.eligible_ticket_type_ids, id]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = toCampaignInput(values);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    await onSubmit(result.input);
    if (!initial) setValues(campaignFormValues());
  };

  return (
    <form className="form-stack" onSubmit={(event) => void submit(event)} aria-disabled={disabled}>
      <fieldset className="plain-fieldset" disabled={disabled}>
        <div className="form-stack">
          <TextField label="Campaign name" value={values.name} onChange={(e) => update("name", e.target.value)} required maxLength={200} placeholder="e.g. Early bird" />
          <div className="form-grid">
            <SelectField label="Discount" value={values.discount_kind} onChange={(e) => update("discount_kind", e.target.value as CampaignFormValues["discount_kind"])}>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off (KZT)</option>
            </SelectField>
            <TextField
              label={values.discount_kind === "percent" ? "Percent" : "Amount (KZT)"}
              type="number"
              min={values.discount_kind === "percent" ? 1 : 0}
              max={values.discount_kind === "percent" ? 100 : undefined}
              step={values.discount_kind === "percent" ? 1 : "0.01"}
              value={values.value}
              onChange={(e) => update("value", e.target.value)}
              required
            />
          </div>
          <div className="form-grid">
            <TextField label="Starts" type="datetime-local" value={values.starts_at} onChange={(e) => update("starts_at", e.target.value)} required />
            <TextField label="Ends" type="datetime-local" value={values.ends_at} onChange={(e) => update("ends_at", e.target.value)} required />
          </div>
          <div className="form-grid">
            <TextField label="Redemption limit" hint="Blank = no limit" type="number" min={1} value={values.max_redemptions} onChange={(e) => update("max_redemptions", e.target.value)} />
            <TextField label="Promo code" hint="Optional" value={values.code} onChange={(e) => update("code", e.target.value.toUpperCase())} maxLength={32} placeholder="EARLYBIRD" />
          </div>
          <fieldset className="capability-grid">
            <legend>Eligible ticket types (none selected = all)</legend>
            {types.length === 0 ? <p className="form-intro">No ticket types yet.</p> : null}
            {types.map((type) => (
              <label className="capability" key={type.id}>
                <input type="checkbox" checked={values.eligible_ticket_type_ids.includes(type.id)} onChange={() => toggleType(type.id)} />
                <span>
                  <strong>{type.name}</strong>
                  <small>{type.kind === "paid" ? "Paid" : "Free"}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </fieldset>
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={disabled || busy}>
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}
