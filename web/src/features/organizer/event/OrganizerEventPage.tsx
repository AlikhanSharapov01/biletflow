import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getEvent, listCategories, listVenues } from "../../../api/catalog";
import { cancelEvent, duplicateEvent, publishEvent, unpublishEvent } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import { Button, ButtonLink, ErrorPanel, Loading, PageHeading, StatusPill, TabPanel, Tabs, useToast, type TabItem } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";
import { publicationTone } from "../../../utils/status";
import { AnalyticsTab } from "./AnalyticsTab";
import { AttendeesTab } from "./AttendeesTab";
import { CampaignsTab } from "./CampaignsTab";
import { CheckInsTab } from "./CheckInsTab";
import { DetailsTab } from "./DetailsTab";
import { FinanceTab } from "./FinanceTab";
import { HistoryTab } from "./HistoryTab";
import { PaidSalesTab } from "./PaidSalesTab";
import { SeatingTab } from "./SeatingTab";
import { StaffTab } from "./StaffTab";
import { TicketTypesTab } from "./TicketTypesTab";

type Tab =
  | "details"
  | "tickets"
  | "seating"
  | "paid-sales"
  | "attendees"
  | "check-ins"
  | "staff"
  | "campaigns"
  | "analytics"
  | "finance"
  | "history";

const TABS: Array<TabItem<Tab>> = [
  { id: "details", label: "Details" },
  { id: "tickets", label: "Ticket types" },
  { id: "seating", label: "Seating" },
  { id: "paid-sales", label: "Paid sales" },
  { id: "attendees", label: "Attendees" },
  { id: "check-ins", label: "Check-ins" },
  { id: "staff", label: "Staff" },
  { id: "campaigns", label: "Campaigns" },
  { id: "analytics", label: "Analytics" },
  { id: "finance", label: "Finance" },
  { id: "history", label: "History" },
];

export function OrganizerEventPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);

  const page = useRequest(
    async () => {
      const [event, categories, venues] = await Promise.all([getEvent(eventId), listCategories(), listVenues()]);
      return { event, categories, venues };
    },
    [eventId],
  );

  if (page.loading) return <Loading label="Loading event…" />;
  if (page.error || !page.data) {
    return <ErrorPanel title="We couldn’t load this event." message={page.error ?? "Unknown error"} onRetry={page.reload} />;
  }
  const { event, categories, venues } = page.data;
  const venue = venues.find((item) => item.id === event.venue_id);
  const published = event.publication_state === "published";
  const cancelled = event.publication_state === "cancelled";

  const act = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      notify(done);
      page.reload();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this event? This cannot be undone.")) return;
    await act(() => cancelEvent(event.id), "Event cancelled.");
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await duplicateEvent(event.id);
      notify("Draft copied. Adjust its dates before publishing.");
      navigate(`/organizer/events/${encodeURIComponent(copy.id)}`);
      setTab("details");
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        back={{ to: "/organizer", label: "Organizer workspace" }}
        eyebrow={`Manage event · ${statusLabel(event.time_status)}${event.moderation_state !== "normal" ? " · suspended by moderation" : ""}`}
        title={event.title}
        subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
        actions={
          <>
            <StatusPill tone={publicationTone(event.publication_state)}>{statusLabel(event.publication_state)}</StatusPill>
            <ButtonLink to={`/events/${encodeURIComponent(event.id)}`}>Public page</ButtonLink>
            {!cancelled ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void act(() => (published ? unpublishEvent(event.id) : publishEvent(event.id)), published ? "Event unpublished." : "Event published.")}
              >
                {published ? "Unpublish" : "Publish"}
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void duplicate()}>
              Duplicate
            </Button>
            {!cancelled ? (
              <Button variant="danger" disabled={busy} onClick={() => void cancel()}>
                Cancel event
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs label="Event sections" items={TABS} value={tab} onChange={setTab} idPrefix="event-section" />
      <TabPanel idPrefix="event-section" active={tab}>
        {tab === "details" ? <DetailsTab key={event.updated_at} event={event} categories={categories} venues={venues} onSaved={page.reload} /> : null}
        {tab === "tickets" ? <TicketTypesTab event={event} /> : null}
        {tab === "seating" ? <SeatingTab event={event} /> : null}
        {tab === "paid-sales" ? <PaidSalesTab event={event} /> : null}
        {tab === "attendees" ? <AttendeesTab event={event} /> : null}
        {tab === "check-ins" ? <CheckInsTab event={event} /> : null}
        {tab === "staff" ? <StaffTab event={event} /> : null}
        {tab === "campaigns" ? <CampaignsTab event={event} /> : null}
        {tab === "analytics" ? <AnalyticsTab event={event} /> : null}
        {tab === "finance" ? <FinanceTab event={event} /> : null}
        {tab === "history" ? <HistoryTab event={event} /> : null}
      </TabPanel>
    </>
  );
}
