import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError, isNotImplemented } from "../../../api/errors";
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

// Checks a code with the (planned) preview endpoint. Only an accepted code is
// sent with the hold; while the endpoint is missing nothing is sent.
export function PromoCodeField({ eventId, initialCode, applied, onApplied }: PromoCodeFieldProps) {
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
      setNote(isNotImplemented(failure) ? { kind: "info", text: "Promo codes are coming soon. Your code was not applied." } : { kind: "error", text: describeError(failure) });
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
      <label className="field">
        <span className="field-label">
          Promo code <small>Optional</small>
        </span>
        <span className="promo-row">
          <input value={code} maxLength={64} autoComplete="off" disabled={Boolean(applied)} onChange={(e) => setCode(e.target.value)} />
          {applied ? (
            <Button size="sm" onClick={remove}>
              Remove
            </Button>
          ) : (
            <Button size="sm" type="submit" disabled={busy || !code.trim()}>
              {busy ? "Checking…" : "Apply"}
            </Button>
          )}
        </span>
      </label>
      {note ? (
        <p className={`promo-note ${note.kind}`} role="status">
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
