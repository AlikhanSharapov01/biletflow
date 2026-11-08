import { useState } from "react";
import { View } from "react-native";

import { listReports, resolveReport } from "@/api/admin";
import type { ReportStatus } from "@/api/types/admin";
import { EmptyState, ErrorPanel, LoadingState, Panel, PanelHeading, SegmentedTabs } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { ModerationDialog, type ModerationRequest } from "@/features/admin/components/ModerationDialog";
import { Pagination } from "@/features/admin/components/Pagination";
import { ReportRow } from "@/features/admin/components/ReportRow";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useRequest } from "@/hooks/useRequest";

type ReportView = ReportStatus | "all";
const LIMIT = 25;

const VIEWS: Array<{ id: ReportView; label: string }> = [
  { id: "open", label: "Open" },
  { id: "reviewing", label: "Reviewing" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

// Event reports from users, oldest first. Reports never suspend anything on
// their own; suspend the event from the Events section if needed.
export function AdminReportsPage() {
  const { notify } = useToast();
  const [view, setView] = useState<ReportView>("open");
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<ModerationRequest | null>(null);
  const reports = useRequest(() => listReports(view === "all" ? "" : view, LIMIT, offset), [view, offset]);

  function askResolution(id: string) {
    setPending({
      title: "Resolve report",
      message: "Resolution",
      confirmLabel: "Resolve report",
      run: async (resolution) => {
        await resolveReport(id, resolution);
        notify("Report resolved.");
        reports.reload();
      },
    });
  }

  return (
    <Panel>
      <PanelHeading title="Reports queue" />
      <SectionNote text="Open → reviewing → resolved. Resolution notes are visible to admins only." />
      <SegmentedTabs
        items={VIEWS}
        value={view}
        onChange={(next) => {
          setView(next);
          setOffset(0);
        }}
      />
      {reports.loading ? <LoadingState message="Loading reports…" /> : null}
      {reports.error ? (
        <ErrorPanel title="We couldn’t load reports." message={reports.error} onRetry={reports.reload} />
      ) : null}
      {reports.data && !reports.loading ? (
        reports.data.items.length === 0 ? (
          <EmptyState message="No reports here." />
        ) : (
          <View>
            {reports.data.items.map((report) => (
              <ReportRow key={report.id} report={report} onChanged={reports.reload} onResolve={() => askResolution(report.id)} />
            ))}
            <Pagination
              total={reports.data.total}
              limit={LIMIT}
              offset={offset}
              shown={reports.data.items.length}
              onChange={setOffset}
            />
          </View>
        )
      ) : null}
      <ModerationDialog request={pending} onClose={() => setPending(null)} />
    </Panel>
  );
}
