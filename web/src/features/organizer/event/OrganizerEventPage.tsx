import { t, useLocale } from "../../../i18n";
import { confirmAction } from "../../../components/ui/ActionDialog";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
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
type Group = "setup" | "sales" | "event-day" | "results";

const DEFAULT_TAB: Tab = "details";

const SECTIONS: Record<Tab, TabItem<Tab>> = {
  details: { id: "details", get label() { return t("common.details"); } },
  tickets: { id: "tickets", get label() { return t("organizer.ticket_types"); } },
  seating: { id: "seating", get label() { return t("organizer.seating"); } },
  staff: { id: "staff", get label() { return t("organizer.staff"); } },
  "paid-sales": { id: "paid-sales", get label() { return t("organizer.paid_sales"); } },
  campaigns: { id: "campaigns", get label() { return t("organizer.campaigns"); } },
  attendees: { id: "attendees", get label() { return t("organizer.attendees"); } },
  "check-ins": { id: "check-ins", get label() { return t("organizer.check_ins"); } },
  analytics: { id: "analytics", get label() { return t("organizer.analytics"); } },
  finance: { id: "finance", get label() { return t("organizer.finance"); } },
  history: { id: "history", get label() { return t("organizer.history"); } },
};

const GROUPS: Array<{ id: Group; label: () => string; tabs: Tab[] }> = [
  { id: "setup", label: () => t("organizer.group_setup"), tabs: ["details", "tickets", "seating", "staff"] },
  { id: "sales", label: () => t("organizer.group_sales"), tabs: ["paid-sales", "campaigns"] },
  { id: "event-day", label: () => t("organizer.group_event_day"), tabs: ["attendees", "check-ins"] },
  { id: "results", label: () => t("organizer.group_results"), tabs: ["analytics", "finance", "history"] },
];

function parseTab(value: string | null): Tab | null {
  return value !== null && Object.hasOwn(SECTIONS, value) ? (value as Tab) : null;
}

export function OrganizerEventPage() {
  useLocale();
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const parsedTab = parseTab(requestedTab);
  const tab = parsedTab ?? DEFAULT_TAB;
  const group = GROUPS.find((item) => item.tabs.includes(tab)) ?? GROUPS[0]!;

  // The URL is the single source of truth; a missing or unknown value is rewritten in place.
  useEffect(() => {
    if (parsedTab) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", DEFAULT_TAB);
      return next;
    }, { replace: true });
  }, [parsedTab, requestedTab, setSearchParams]);

  const selectTab = (next: Tab) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set("tab", next);
      return params;
    }, { replace: true });
  };
  const [busy, setBusy] = useState(false);

  const page = useRequest(
    async () => {
      const [event, categories, venues] = await Promise.all([getEvent(eventId), listCategories(), listVenues()]);
      return { event, categories, venues };
    },
    [eventId],
  );

  if (page.loading) return <Loading label={t("org.loading_event")} />;
  if (page.error || !page.data) {
    return <ErrorPanel title={t("event.load_error")} message={page.error ?? t("errors.unknown")} onRetry={page.reload} />;
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
    if (!await confirmAction(t("organizer.cancel_event_confirm"))) return;
    await act(() => cancelEvent(event.id), t("org.event_cancelled"));
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await duplicateEvent(event.id);
      notify(t("org.draft_copied"));
      navigate(`/organizer/events/${encodeURIComponent(copy.id)}`);
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        back={{ to: "/organizer", label: t("nav.workspace") }}
        eyebrow={t("org.manage_event", { p0: statusLabel(event.time_status), p1: event.moderation_state !== "normal" ? (" " + t("org.moderation_suffix")) : "" })}
        title={event.title}
        subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
        actions={
          <>
            <StatusPill tone={publicationTone(event.publication_state)}>{statusLabel(event.publication_state)}</StatusPill>
            <ButtonLink to={`/events/${encodeURIComponent(event.id)}`}>{t("organizer.public_page")}</ButtonLink>
            {!cancelled ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void act(() => (published ? unpublishEvent(event.id) : publishEvent(event.id)), published ? t("org.event_unpublished") : t("org.event_published"))}
              >
                {published ? t("organizer.unpublish") : t("organizer.publish")}
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void duplicate()}>{t("organizer.duplicate")}</Button>
            {!cancelled ? (
              <Button variant="danger" disabled={busy} onClick={() => void cancel()}>{t("organizer.cancel_event")}</Button>
            ) : null}
          </>
        }
      />
      <Tabs
        label={t("organizer.event_stages")}
        items={GROUPS.map((item) => ({ id: item.id, label: item.label() }))}
        value={group.id}
        onChange={(id) => selectTab(GROUPS.find((item) => item.id === id)?.tabs[0] ?? DEFAULT_TAB)}
        idPrefix="event-group"
      />
      <TabPanel idPrefix="event-group" active={group.id}>
        <Tabs label={t("organizer.event_sections")} items={group.tabs.map((id) => SECTIONS[id])} value={tab} onChange={selectTab} idPrefix="event-section" />
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
      </TabPanel>
    </>
  );
}
