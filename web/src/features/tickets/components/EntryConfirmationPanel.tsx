import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { describeError } from "../../../api/errors";
import { requestEntryConfirmation } from "../../../api/tickets";
import type { EntryConfirmation, IssuedTicket } from "../../../api/types/checkout";
import { Button, FormMessage, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useCountdown } from "../../../hooks/useCountdown";
import { formatCountdown } from "../../../utils/format";
import { EntryQr } from "./EntryQr";

// At the gate the scanner needs the ticket QR plus proof that its holder is
// signed in right now: a two-minute token (QR) or its 8-digit code.
export function EntryConfirmationPanel({ ticket }: { ticket: IssuedTicket }) {
  useLocale();
  const [confirmation, setConfirmation] = useState<EntryConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const secondsLeft = useCountdown(confirmation?.expires_at ?? null);
  const expired = Boolean(confirmation) && secondsLeft === 0;

  if (!ticket.qr_payload) return null;

  const request = async () => {
    setBusy(true);
    setMessage("");
    try {
      setConfirmation(await requestEntryConfirmation(ticket.id));
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const usable = ticket.status === "valid";

  return (
    <Panel className="entry-panel no-print">
      <PanelHeading
        title={t("tickets.entry_confirmation")}
        subtitle={t("tickets.entry_instructions")}
        trailing={confirmation ? <StatusPill tone={expired ? "neutral" : "positive"}>{expired ? t("tickets.expired") : t("common.active")}</StatusPill> : null}
      />
      {confirmation && !expired ? (
        <div className="entry-grid">
          <EntryQr token={confirmation.token} />
          <div className="entry-copy">
            <span className="field-label">{t("tickets.entry_code")}</span>
            <strong className="entry-code" aria-label={t("tickets.entry_code_label", { p0: confirmation.code.split("").join(" ") })}>
              {confirmation.code.slice(0, 4)} {confirmation.code.slice(4)}
            </strong>
            <span className="countdown" role="timer" aria-live="off">{t("tickets.expires_in")}{" "}{formatCountdown(secondsLeft)}
            </span>
            <small className="form-intro">{t("tickets.printed_code_hint")}</small>
          </div>
        </div>
      ) : null}
      {expired ? <p className="form-intro">{t("tickets.entry_expired")}</p> : null}
      {!usable ? <p className="form-intro">{t("tickets.entry_valid_only")}</p> : null}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant={confirmation && !expired ? "subtle" : "primary"} disabled={busy || !usable} onClick={() => void request()}>
          {busy ? t("tickets.requesting") : confirmation ? t("tickets.refresh_confirmation") : t("tickets.confirm_entry")}
        </Button>
      </div>
    </Panel>
  );
}
