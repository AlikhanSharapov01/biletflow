import { useParams } from "react-router";
import { getTicket } from "../../api/tickets";
import { Button, ErrorPanel, Loading, PageHeading, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../utils/format";
import { ticketTone } from "../../utils/status";
import { SupportLink } from "../support/components/SupportLink";
import { AdmissionPanel } from "./components/AdmissionPanel";
import { DeliveryPanel } from "./components/DeliveryPanel";
import { DownloadPdfButton } from "./components/DownloadPdfButton";
import { EntryConfirmationPanel } from "./components/EntryConfirmationPanel";
import { PrintableTicket } from "./components/PrintableTicket";

export function TicketPage() {
  const { ticketId = "" } = useParams();
  const ticket = useRequest(() => getTicket(ticketId), [ticketId]);

  if (ticket.loading) return <Loading label="Loading ticket…" />;
  if (ticket.error || !ticket.data) {
    return <ErrorPanel title="We couldn’t load this ticket." message={ticket.error ?? "Unknown error"} onRetry={ticket.reload} />;
  }
  const data = ticket.data;
  // The PDF is refused for refunded, cancelled and refund-pending tickets.
  const printable = Boolean(data.qr_payload) && (data.status === "valid" || data.status === "checked_in");

  return (
    <>
      <PageHeading
        back={{ to: "/tickets", label: "All tickets" }}
        eyebrow="Admission ticket"
        title={data.event_title}
        subtitle={`${dateLabel(data.event_starts_at)} · ${data.venue_name}`}
        actions={
          <>
            <StatusPill tone={ticketTone(data.status)}>{statusLabel(data.status)}</StatusPill>
            {printable ? <DownloadPdfButton ticketId={data.id} /> : null}
            <Button onClick={() => window.print()}>Print ticket</Button>
          </>
        }
      />
      <div className="stack">
        <PrintableTicket ticket={data} />
        <EntryConfirmationPanel ticket={data} />
        <div className="content-grid ticket-side-grid">
          <AdmissionPanel ticketId={data.id} />
          <DeliveryPanel ticketId={data.id} />
        </div>
        <div className="no-print">
          <SupportLink eventId={data.event_id} ticketId={data.id} />
        </div>
      </div>
    </>
  );
}
