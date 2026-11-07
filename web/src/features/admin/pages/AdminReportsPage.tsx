import { useState } from "react";
import { Link } from "react-router";
import { listReports, resolveReport, reviewReport } from "../../../api/admin";
import { describeError } from "../../../api/errors";
import type { ReportStatus } from "../../../api/types/admin";
import { Button, EmptyState, ErrorPanel, ListRow, Loading, Panel, PanelHeading, StatusPill, Tabs, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";
import { Pagination } from "../../organizer/components/Pagination";
import { ReasonForm } from "../components/ReasonForm";

type View = ReportStatus | "all";
const LIMIT = 25;

// Event reports from users, oldest first. Reports never suspend anything on
// their own; suspend the event from the Events page if needed.
export function AdminReportsPage() {
  const { notify } = useToast();
  const [view, setView] = useState<View>("open");
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState("");
  const reports = useRequest(() => listReports(view === "all" ? "" : view, LIMIT, offset), [view, offset]);

  const review = async (id: string) => {
    try {
      await reviewReport(id);
      notify("Report marked as in review.");
      reports.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <Panel>
      <PanelHeading title="Reports queue" subtitle="Open → reviewing → resolved. Resolution notes are visible to admins only." />
      <Tabs
        label="Report status"
        items={[
          { id: "open", label: "Open" },
          { id: "reviewing", label: "Reviewing" },
          { id: "resolved", label: "Resolved" },
          { id: "all", label: "All" },
        ]}
        value={view}
        onChange={(next) => {
          setView(next);
          setOffset(0);
        }}
      />
      {reports.loading ? <Loading label="Loading reports…" /> : null}
      {reports.error ? <ErrorPanel title="We couldn’t load reports." message={reports.error} onRetry={reports.reload} /> : null}
      {reports.data && !reports.loading ? (
        reports.data.items.length === 0 ? (
          <EmptyState>No reports here.</EmptyState>
        ) : (
          <>
            <div className="list">
              {reports.data.items.map((report) => (
                <ListRow
                  key={report.id}
                  icon="!"
                  title={
                    <>
                      {statusLabel(report.category)}
                      <StatusPill tone={report.status === "resolved" ? "neutral" : report.status === "reviewing" ? "pending" : "blocked"}>{report.status}</StatusPill>
                    </>
                  }
                  meta={report.description}
                  note={
                    <>
                      <Link to={`/events/${encodeURIComponent(report.event_id)}`}>Event {report.event_id.slice(0, 8)}</Link> · reported {dateLabel(report.created_at)}
                      {report.resolution ? ` · resolved: ${report.resolution}` : ""}
                    </>
                  }
                  actions={
                    report.status === "resolved" ? null : (
                      <>
                        {report.status === "open" ? (
                          <Button size="sm" onClick={() => void review(report.id)}>
                            Start review
                          </Button>
                        ) : null}
                        <Button size="sm" variant="primary" onClick={() => setOpenId(openId === report.id ? "" : report.id)}>
                          {openId === report.id ? "Close" : "Resolve"}
                        </Button>
                      </>
                    )
                  }
                >
                  {openId === report.id ? (
                    <ReasonForm
                      label="Resolution"
                      submitLabel="Resolve report"
                      maxLength={2000}
                      onCancel={() => setOpenId("")}
                      onSubmit={async (resolution) => {
                        await resolveReport(report.id, resolution);
                        notify("Report resolved.");
                        setOpenId("");
                        reports.reload();
                      }}
                    />
                  ) : null}
                </ListRow>
              ))}
            </div>
            <Pagination total={reports.data.total} limit={LIMIT} offset={offset} shown={reports.data.items.length} onChange={setOffset} label="Report pages" />
          </>
        )
      ) : null}
    </Panel>
  );
}
