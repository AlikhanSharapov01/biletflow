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
  const { notify } = useToast();
  const events = useAdminSearch(searchEvents);
  const [openId, setOpenId] = useState("");

  return (
    <Panel>
      <PanelHeading title="Events" subtitle="Search by title, event id or organization id." />
      <AdminSearchForm
        label="Event search"
        placeholder="Event title or id"
        statusLabel="Moderation"
        statuses={[
          { value: "normal", label: "Normal" },
          { value: "suspended", label: "Suspended" },
        ]}
        onApply={events.apply}
      />
      <SearchResults noun="events" {...events} onPage={events.setOffset}>
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
                      {suspended ? <StatusPill tone="blocked">Suspended</StatusPill> : null}
                    </>
                  }
                  meta={`${dateLabel(event.starts_at)} · ${event.visibility} · capacity ${event.capacity}`}
                  note={`Event ${event.id} · organization ${event.organization_id}`}
                  actions={
                    <Button size="sm" variant={suspended ? "subtle" : "danger"} onClick={() => setOpenId(openId === event.id ? "" : event.id)}>
                      {openId === event.id ? "Close" : suspended ? "Reinstate" : "Suspend"}
                    </Button>
                  }
                >
                  {openId === event.id ? (
                    <ReasonForm
                      label={suspended ? "Reason for reinstating" : "Reason for suspending (closes sales and admission)"}
                      submitLabel={suspended ? "Reinstate event" : "Suspend event"}
                      danger={!suspended}
                      onCancel={() => setOpenId("")}
                      onSubmit={async (reason) => {
                        await moderateEvent(event.id, suspended ? "reinstate" : "suspend", reason);
                        notify(suspended ? "Event reinstated." : "Event suspended.");
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
