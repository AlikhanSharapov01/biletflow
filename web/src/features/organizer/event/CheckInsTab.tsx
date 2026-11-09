import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { downloadCheckInsCsv, listCheckIns } from "../../../api/admissionHistory";
import { listTicketTypes } from "../../../api/catalog";
import { describeError } from "../../../api/errors";
import type { EventView } from "../../../api/types";
import type { CheckInFilters } from "../../../api/types/admission";
import { Button, EmptyState, ErrorPanel, Loading, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { Pagination } from "../components/Pagination";
import { CheckInFilterForm } from "./checkins/CheckInFilterForm";
import { CheckInTable } from "./checkins/CheckInTable";
import { SyncConflictsPanel } from "./checkins/SyncConflictsPanel";

const LIMIT = 50;

// Organizer admission log with filters, paging, CSV export and the offline
// sync-conflict review (backend/ADMISSION_API.md, capability `attendees`).
export function CheckInsTab({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const [filters, setFilters] = useState<CheckInFilters>({});
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const types = useRequest(() => listTicketTypes(event.id), [event.id]);
  const log = useRequest(() => listCheckIns(event.id, filters, LIMIT, offset), [event.id, filters, offset]);

  const apply = (next: CheckInFilters) => {
    setFilters(next);
    setOffset(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCheckInsCsv(event.id, filters);
      notify(t("org.csv_downloaded"));
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack">
      <Panel>
        <PanelHeading
          title={t("org.checkin_history")}
          subtitle={t("org.checkin_hint")}
          trailing={
            <div className="row-actions">
              <StatusPill tone="neutral">{log.data?.total ?? 0}{" "}{t("word.checkins")}</StatusPill>
              <Button size="sm" disabled={exporting} onClick={() => void exportCsv()}>
                {exporting ? t("support.preparing") : t("org.csv_download")}
              </Button>
            </div>
          }
        />
        <CheckInFilterForm types={types.data ?? []} initial={filters} onApply={apply} />
        {log.loading ? <Loading label={t("org.checkin_loading")} /> : null}
        {log.error ? <ErrorPanel title={t("org.checkin_error")} message={log.error} onRetry={log.reload} /> : null}
        {log.data && !log.loading ? (
          log.data.items.length === 0 ? (
            <EmptyState>{t("org.no_checkins")}</EmptyState>
          ) : (
            <>
              <CheckInTable rows={log.data.items} />
              <Pagination total={log.data.total} limit={LIMIT} offset={offset} shown={log.data.items.length} onChange={setOffset} label={t("org.checkin_pages")} />
            </>
          )
        ) : null}
        <p className="form-intro">{t("org.csv_hint")}</p>
      </Panel>
      <SyncConflictsPanel event={event} onResolved={log.reload} />
    </div>
  );
}
