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
      setMessage({ text: "A new ticket email is on its way.", success: true });
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  const look = delivery ? deliveryLook(delivery.status) : null;

  return (
    <Panel className="no-print">
      <PanelHeading title="Email delivery" trailing={look ? <StatusPill tone={look.tone}>{look.label}</StatusPill> : null} />
      {loaded.loading && !delivery ? <Loading label="Checking delivery…" /> : null}
      {loaded.error && !delivery ? <ErrorPanel title="We couldn’t check delivery." message={loaded.error} onRetry={loaded.reload} /> : null}
      {delivery ? (
        <>
          <FactList
            items={[
              { label: "Sent to", value: delivery.recipient_email },
              { label: "Last delivered", value: delivery.last_delivered_at ? dateLabel(delivery.last_delivered_at) : "Not yet" },
              { label: "Re-sent", value: `${delivery.resend_count} of 5 times` },
            ]}
          />
          {delivery.status === "failed" ? <p className="form-intro">The email could not be delivered. Your ticket still works here.</p> : null}
          <FormMessage message={message.text} success={message.success} />
          <div className="form-actions">
            <Button disabled={busy || !delivery.can_resend} onClick={() => void resend()}>
              {busy ? "Sending…" : "Resend email"}
            </Button>
            <Button variant="text" onClick={() => { setOverride(null); loaded.reload(); }}>
              Refresh
            </Button>
          </div>
          {resendHint(delivery) ? <small className="form-intro">{resendHint(delivery)}</small> : null}
        </>
      ) : null}
    </Panel>
  );
}
