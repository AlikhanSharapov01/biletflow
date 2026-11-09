import { t, useLocale } from "../../../i18n";
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
  useLocale();
  const { notify } = useToast();
  const [view, setView] = useState<View>("open");
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState("");
  const reports = useRequest(() => listReports(view === "all" ? "" : view, LIMIT, offset), [view, offset]);

  const review = async (id: string) => {
    try {
      await reviewReport(id);
      notify(t("admin.review_started"));
      reports.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <Panel>
      <PanelHeading title={t("admin.reports_queue")} subtitle={t("admin.report_hint")} />
      <Tabs
        label={t("admin.report_status")}
        items={[
          { id: "open", label: t("support.open") },
          { id: "reviewing", label: t("admin.reviewing") },
          { id: "resolved", label: t("support.resolved") },
          { id: "all", label: t("common.all") },
        ]}
        value={view}
        onChange={(next) => {
          setView(next);
          setOffset(0);
        }}
      />
      {reports.loading ? <Loading label={t("admin.loading_reports")} /> : null}
      {reports.error ? <ErrorPanel title={t("admin.reports_error")} message={reports.error} onRetry={reports.reload} /> : null}
      {reports.data && !reports.loading ? (
        reports.data.items.length === 0 ? (
          <EmptyState>{t("admin.no_reports")}</EmptyState>
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
                      <Link to={`/events/${encodeURIComponent(report.event_id)}`}>{t("common.event")} {report.event_id.slice(0, 8)}</Link>{" "}{t("admin.reported_suffix")}{" "}{dateLabel(report.created_at)}
                      {report.resolution ? (" " + t("admin.resolved_suffix", { p0: report.resolution })) : ""}
                    </>
                  }
                  actions={
                    report.status === "resolved" ? null : (
                      <>
                        {report.status === "open" ? (
                          <Button size="sm" onClick={() => void review(report.id)}>{t("admin.start_review")}</Button>
                        ) : null}
                        <Button size="sm" variant="primary" onClick={() => setOpenId(openId === report.id ? "" : report.id)}>
                          {openId === report.id ? t("common.close") : t("org.resolve")}
                        </Button>
                      </>
                    )
                  }
                >
                  {openId === report.id ? (
                    <ReasonForm
                      label={t("admin.resolution")}
                      submitLabel={t("admin.resolve_report")}
                      maxLength={2000}
                      onCancel={() => setOpenId("")}
                      onSubmit={async (resolution) => {
                        await resolveReport(report.id, resolution);
                        notify(t("admin.report_resolved"));
                        setOpenId("");
                        reports.reload();
                      }}
                    />
                  ) : null}
                </ListRow>
              ))}
            </div>
            <Pagination total={reports.data.total} limit={LIMIT} offset={offset} shown={reports.data.items.length} onChange={setOffset} label={t("admin.report_pages")} />
          </>
        )
      ) : null}
    </Panel>
  );
}
