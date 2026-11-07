import type { Dispatch, SetStateAction } from "react";
import type { Hold } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { TextField } from "../../../components/ui/Field";
import { priceLabel } from "../../../utils/format";
import type { RecipientValues } from "../utils/checkout";
import { HoldCountdown } from "./HoldCountdown";

interface RecipientFormProps {
  hold: Hold;
  typeName: (typeId: string) => string;
  recipients: RecipientValues;
  setRecipients: Dispatch<SetStateAction<RecipientValues>>;
  secondsLeft: number;
  busy: boolean;
  message: string;
  // Paid baskets continue to the simulated payment instead of confirming.
  paid: boolean;
  subtotalMinor: number;
  onConfirm: () => void;
  onRelease: () => void;
}

// Step two: one name and email per held place, then confirm.
export function RecipientForm({ hold, typeName, recipients, setRecipients, secondsLeft, busy, message, paid, subtotalMinor, onConfirm, onRelease }: RecipientFormProps) {
  return (
    <div className="checkout">
      <div className="checkout-head">
        <h3>Who is coming?</h3>
        <HoldCountdown secondsLeft={secondsLeft} />
      </div>
      <p className="form-intro">Each ticket is sent to its recipient by email. Recipients claim it by signing in with that email.</p>
      <div className="recipient-list">
        {hold.allocations.map((allocation, index) => {
          const value = recipients[allocation.id] ?? { name: "", email: "" };
          const change = (key: "name" | "email", next: string) =>
            setRecipients((current) => ({ ...current, [allocation.id]: { ...value, [key]: next } }));
          return (
            <fieldset className="recipient" key={allocation.id}>
              <legend>
                Ticket {index + 1} · {typeName(allocation.ticket_type_id)}
              </legend>
              <div className="form-grid">
                <TextField label="Name" value={value.name} maxLength={200} required onChange={(e) => change("name", e.target.value)} />
                <TextField label="Email" type="email" value={value.email} maxLength={254} required onChange={(e) => change("email", e.target.value)} />
              </div>
            </fieldset>
          );
        })}
      </div>
      {paid ? (
        <p className="form-intro">
          Ticket subtotal <strong>{priceLabel(subtotalMinor)}</strong>. The final total, including any discount, is quoted on the next step.
        </p>
      ) : null}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" disabled={busy} onClick={onConfirm}>
          {busy ? (paid ? "Preparing payment…" : "Confirming…") : paid ? "Continue to payment" : "Confirm registration"}
        </Button>
        <Button disabled={busy} onClick={onRelease}>
          Choose again
        </Button>
      </div>
    </div>
  );
}
