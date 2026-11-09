import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { describeError } from "../../../api/errors";
import { getDelivery, resendDelivery } from "../../../api/tickets";
import type { TicketDelivery } from "../../../api/types/checkout";
import { Button, ErrorPanel, FactList, FormMessage, Loading, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";
import { deliveryLook, resendHint } from "../utils/ticketStatus";

// Email delivery of this ticket, with a rate-limited "Resend email".
export function DeliveryPanel({ ticketId }: { ticketId: string }) {
  useLocale();
  const loaded = useRequest(() => getDelivery(ticketId), [ticketId]);
  const [override, setOverride] = useState<TicketDelivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });
  const delivery = override ?? loaded.data;

  const resend = async () => {
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      setOverride(await resendDelivery(ticketId));
      setMessage({ text: t("tickets.resend_sent"), success: true });
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  const look = delivery ? deliveryLook(delivery.status) : null;

  return (
    <Panel className="no-print">
      <PanelHeading title={t("tickets.delivery")} trailing={look ? <StatusPill tone={look.tone}>{look.label}</StatusPill> : null} />
      {loaded.loading && !delivery ? <Loading label={t("tickets.checking_delivery")} /> : null}
      {loaded.error && !delivery ? <ErrorPanel title={t("tickets.delivery_error")} message={loaded.error} onRetry={loaded.reload} /> : null}
      {delivery ? (
        <>
          <FactList
            items={[
              { label: t("tickets.sent_to"), value: delivery.recipient_email },
              { label: t("tickets.last_delivered"), value: delivery.last_delivered_at ? dateLabel(delivery.last_delivered_at) : t("account.not_yet") },
              { label: t("tickets.resent"), value: t("tickets.resend_count", { p0: delivery.resend_count }) },
            ]}
          />
          {delivery.status === "failed" ? <p className="form-intro">{t("tickets.email_failed_hint")}</p> : null}
          <FormMessage message={message.text} success={message.success} />
          <div className="form-actions">
            <Button disabled={busy || !delivery.can_resend} onClick={() => void resend()}>
              {busy ? t("common.sending") : t("tickets.resend")}
            </Button>
            <Button variant="text" onClick={() => { setOverride(null); loaded.reload(); }}>{t("common.refresh")}</Button>
          </div>
          {resendHint(delivery) ? <small className="form-intro">{resendHint(delivery)}</small> : null}
        </>
      ) : null}
    </Panel>
  );
}
