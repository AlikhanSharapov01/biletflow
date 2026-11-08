import { useLocalSearchParams, useRouter } from "expo-router";

import { getTicket } from "@/api/tickets";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, StatusPill, SubtleButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, statusLabel } from "@/utils/format";
import { ticketTone } from "@/utils/status";

import { SupportLink } from "../support/components/SupportLink";
import { AdmissionPanel } from "./components/AdmissionPanel";
import { DeliveryPanel } from "./components/DeliveryPanel";
import { DownloadPdfButton } from "./components/DownloadPdfButton";
import { EntryConfirmationPanel } from "./components/EntryConfirmationPanel";
import { TicketPass } from "./components/TicketPass";
import { isPrintable } from "./utils/ticketStatus";

// One ticket: its QR, the entry confirmation for the gate, admission and
// email delivery. "Download PDF" also covers printing through the share sheet.
export function TicketScreen() {
  const { ticketId = "" } = useLocalSearchParams<{ ticketId: string }>();
  const router = useRouter();
  const ticket = useRequest(() => getTicket(ticketId), [ticketId]);
  const data = ticket.data;

  return (
    <ScrollScreen backLabel="Tickets" onRefresh={ticket.reload} refreshing={ticket.loading && data !== null}>
      {ticket.loading && !data ? <LoadingState message="Loading ticket…" /> : null}
      {ticket.error && !data ? (
        <ErrorPanel title="We couldn’t load this ticket." message={ticket.error} onRetry={ticket.reload} />
      ) : null}
      {data ? (
        <>
          <PageHeading
            eyebrow="Admission ticket"
            title={data.event_title}
            subtitle={`${dateLabel(data.event_starts_at)} · ${data.venue_name}`}
            actions={
              <>
                <StatusPill tone={ticketTone(data.status)} label={statusLabel(data.status)} />
                {isPrintable(data) ? <DownloadPdfButton ticketId={data.id} /> : null}
                <SubtleButton
                  label="Event page"
                  onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: data.event_id } })}
                />
              </>
            }
          />
          <TicketPass ticket={data} />
          <EntryConfirmationPanel ticket={data} />
          <AdmissionPanel ticketId={data.id} />
          <DeliveryPanel ticketId={data.id} />
          <SupportLink eventId={data.event_id} ticketId={data.id} />
        </>
      ) : null}
    </ScrollScreen>
  );
}
