import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { Link } from "react-router";
import { moderateEvent, searchEvents } from "../../../api/admin";
import { Button, ListRow, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { dateLabel, statusLabel } from "../../../utils/format";
import { publicationTone } from "../../../utils/status";
import { AdminSearchForm } from "../components/AdminSearchForm";
import { ReasonForm } from "../components/ReasonForm";
import { SearchResults } from "../components/SearchResults";
import { useAdminSearch } from "../hooks/useAdminSearch";

// Suspension closes sales and admission; it never cancels, refunds or voids
// tickets — those stay explicit business actions.
export function AdminEventsPage() {
  useLocale();
  const { notify } = useToast();
  const events = useAdminSearch(searchEvents);
  const [openId, setOpenId] = useState("");

  return (
    <Panel>
      <PanelHeading title={t("common.events")} subtitle={t("admin.event_search_hint")} />
      <AdminSearchForm
        label={t("admin.event_search")}
        placeholder={t("admin.event_search_placeholder")}
        statusLabel={t("admin.moderation")}
        statuses={[
          { value: "normal", label: t("admin.normal") },
          { value: "suspended", label: t("org.suspended") },
        ]}
        onApply={events.apply}
      />
      <SearchResults noun={t("word.events")} {...events} onPage={events.setOffset}>
        {(items) => (
          <div className="list">
            {items.map((event) => {
              const suspended = event.moderation_state === "suspended";
              return (
                <ListRow
                  key={event.id}
                  icon="E"
                  title={
                    <>
                      <Link to={`/events/${encodeURIComponent(event.id)}`}>{event.title}</Link>
                      <StatusPill tone={publicationTone(event.publication_state)}>{statusLabel(event.publication_state)}</StatusPill>
                      {suspended ? <StatusPill tone="blocked">{t("org.suspended")}</StatusPill> : null}
                    </>
                  }
                  meta={t("admin.capacity_meta", { p0: dateLabel(event.starts_at), p1: event.visibility, p2: event.capacity })}
                  note={t("admin.event_org", { p0: event.id, p1: event.organization_id })}
                  actions={
                    <Button size="sm" variant={suspended ? "subtle" : "danger"} onClick={() => setOpenId(openId === event.id ? "" : event.id)}>
                      {openId === event.id ? t("common.close") : suspended ? t("admin.reinstate") : t("admin.suspend")}
                    </Button>
                  }
                >
                  {openId === event.id ? (
                    <ReasonForm
                      label={suspended ? t("admin.reason_reinstate") : t("admin.reason_suspend_event")}
                      submitLabel={suspended ? t("admin.reinstate_event") : t("admin.suspend_event")}
                      danger={!suspended}
                      onCancel={() => setOpenId("")}
                      onSubmit={async (reason) => {
                        await moderateEvent(event.id, suspended ? "reinstate" : "suspend", reason);
                        notify(suspended ? t("admin.event_reinstated") : t("admin.event_suspended"));
                        setOpenId("");
                        events.reload();
                      }}
                    />
                  ) : null}
                </ListRow>
              );
            })}
          </div>
        )}
      </SearchResults>
    </Panel>
  );
}
