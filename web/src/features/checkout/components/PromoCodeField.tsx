import { t, translate, useLocale } from "../../../i18n";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { previewPromo } from "../../../api/promo";
import type { PromoPreview } from "../../../api/types/promo";
import { Button } from "../../../components/ui";
import { normalizePromoCode, promoSummary, stashPromo } from "../utils/promo";

interface PromoCodeFieldProps {
  eventId: string;
  initialCode: string;
  applied: PromoPreview | null;
  onApplied: (preview: PromoPreview | null) => void;
}

type Note = { kind: "error" | "info" | "success"; text: string } | null;

// Preview a code; the hold response is authoritative for basket pricing.
export function PromoCodeField({ eventId, initialCode, applied, onApplied }: PromoCodeFieldProps) {
  useLocale();
  const inputId = useId();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const tried = useRef(false);

  const check = async (value: string) => {
    const normalized = normalizePromoCode(value);
    if (!normalized) return;
    setBusy(true);
    setNote(null);
    try {
      const preview = await previewPromo(eventId, normalized);
      onApplied(preview);
      stashPromo(eventId, preview.code);
      setNote({ kind: "success", text: promoSummary(preview) });
    } catch (failure) {
      onApplied(null);
      setNote({ kind: "error", text: describeError(failure) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialCode && !tried.current) {
      tried.current = true;
      void check(initialCode);
    }
    // Runs once for a code from the link or the sign-in stash.
  }, [initialCode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void check(code);
  };

  const remove = () => {
    onApplied(null);
    stashPromo(eventId, "");
    setCode("");
    setNote(null);
  };

  return (
    <form className="promo-field" onSubmit={submit}>
      <div className="field">
        <label htmlFor={inputId}>
        <span className="field-label">{t("checkout.promo_code")} <small>{t("common.optional")}</small>
        </span>
        </label>
        <span className="promo-row">
          <input id={inputId} value={code} maxLength={32} autoComplete="off" disabled={busy || Boolean(applied)} onChange={(e) => setCode(e.target.value)} />
          {applied ? (
            <Button size="sm" onClick={remove}>{t("common.remove")}</Button>
          ) : (
            <Button size="sm" type="submit" disabled={busy || !code.trim()}>
              {busy ? t("checkout.checking") : t("common.apply")}
            </Button>
          )}
        </span>
      </div>
      {note ? (
        <p className={`promo-note ${note.kind}`} role="status">
          {note.kind === "success" && applied ? promoSummary(applied) : translate(note.text)}
        </p>
      ) : null}
    </form>
  );
}
