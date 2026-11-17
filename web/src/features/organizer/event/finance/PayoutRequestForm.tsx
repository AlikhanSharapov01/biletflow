import { t, useLocale } from "../../../../i18n";
import { useMemo, useState, type FormEvent } from "react";
import { describeError } from "../../../../api/errors";
import { requestPayout } from "../../../../api/finance";
import type { EventFinance } from "../../../../api/types/finance";
import { Button, FormMessage, TextField, useToast } from "../../../../components/ui";
import { moneyLabel, tengeToMinor } from "../../../../utils/format";
import { createRetryKeys } from "../../../support/retryKey";

interface PayoutRequestFormProps {
  finance: EventFinance;
  onRequested: () => void;
}

// Reserves a simulated payout. The payable maximum is the server's estimate;
// the server re-checks the balance and refuses an overdraft (409).
export function PayoutRequestForm({ finance, onRequested }: PayoutRequestFormProps) {
  useLocale();
  const { notify } = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // A retry of the same amount reuses its Idempotency-Key, so a lost answer
  // can never reserve the same payout twice.
  const keys = useMemo(() => createRetryKeys(), []);
  const max = finance.estimated_payout_minor;
  const money = (minor: number) => moneyLabel(minor, finance.currency);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minor = tengeToMinor(amount);
    if (minor <= 0) {
      setMessage(t("org.payout_amount_positive"));
      return;
    }
    if (minor > max) {
      setMessage(t("org.payout_amount_max", { p0: money(max) }));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await requestPayout(finance.event_id, minor, keys.keyFor({ event: finance.event_id, minor }));
      keys.reset();
      setAmount("");
      notify(t("org.payout_requested", { p0: money(minor) }));
      onRequested();
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  if (max <= 0) return <p className="form-intro">{t("org.payout_nothing_payable")}</p>;

  return (
    <form className="form-stack payout-form" onSubmit={(event) => void submit(event)}>
      <TextField
        label={t("org.payout_amount", { p0: finance.currency })}
        hint={t("org.payout_amount_hint", { p0: money(max) })}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        required
      />
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={busy}>{busy ? t("common.sending") : t("org.request_payout")}</Button>
        <Button variant="text" type="button" disabled={busy} onClick={() => setAmount(String(max / 100))}>{t("org.payout_use_max")}</Button>
      </div>
    </form>
  );
}
