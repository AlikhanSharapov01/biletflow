import { t, useLocale } from "../../../i18n";
import type { Dispatch, SetStateAction } from "react";
import type { Hold } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { TextField } from "../../../components/ui/Field";
import { priceLabel } from "../../../utils/format";
import type { RecipientValues } from "../utils/checkout";
import { HoldCountdown } from "./HoldCountdown";
import { PriceSummary } from "./PriceSummary";

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
  useLocale();
  return (
    <div className="checkout">
      <div className="checkout-head">
        <h3>{t("checkout.who_coming")}</h3>
        <HoldCountdown secondsLeft={secondsLeft} />
      </div>
      <p className="form-intro">{t("checkout.recipient_hint")}</p>
      <div className="recipient-list">
        {hold.allocations.map((allocation, index) => {
          const value = recipients[allocation.id] ?? { name: "", email: "" };
          const change = (key: "name" | "email", next: string) =>
            setRecipients((current) => ({ ...current, [allocation.id]: { ...value, [key]: next } }));
          return (
            <fieldset className="recipient" key={allocation.id}>
              <legend>{t("common.ticket")} {index + 1} · {typeName(allocation.ticket_type_id)}
              </legend>
              <div className="form-grid">
                <TextField label={t("person.name")} value={value.name} maxLength={200} required onChange={(e) => change("name", e.target.value)} />
                <TextField label={t("common.email")} type="email" value={value.email} maxLength={254} required onChange={(e) => change("email", e.target.value)} />
              </div>
            </fieldset>
          );
        })}
      </div>
      {hold.pricing ? <PriceSummary pricing={hold.pricing} /> : paid ? (
        <p className="form-intro">{t("checkout.ticket_subtotal")} <strong>{priceLabel(subtotalMinor)}</strong>{t("checkout.final_quote_hint")}{" "}</p>
      ) : null}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" disabled={busy} onClick={onConfirm}>
          {busy ? (paid ? t("checkout.preparing_payment") : t("checkout.confirming")) : paid ? t("checkout.continue_payment") : t("checkout.confirm_registration")}
        </Button>
        <Button disabled={busy} onClick={onRelease}>{t("checkout.choose_again")}{" "}</Button>
      </div>
    </div>
  );
}
