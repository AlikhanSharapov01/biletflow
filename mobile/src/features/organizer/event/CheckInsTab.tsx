import { useState } from "react";
import { View } from "react-native";

import { downloadCheckInsCsv, listCheckIns } from "@/api/admissionHistory";
import { listTicketTypes } from "@/api/catalog";
import { describeError } from "@/api/errors";
import type { EventView } from "@/api/types";
import type { CheckInFilters } from "@/api/types/admission";
import { EmptyState, ErrorPanel, LoadingState, Panel, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";

import { formStyles } from "../components/formStyles";
import { Intro } from "../components/Intro";
import { Pagination } from "../components/Pagination";
import { SectionHeading } from "../components/SectionHeading";
import { CheckInFilterForm } from "./checkins/CheckInFilterForm";
import { CheckInRow } from "./checkins/CheckInRow";
import { SyncConflictsPanel } from "./checkins/SyncConflictsPanel";
import { t, useLocale } from "@/i18n";

const LIMIT = 50;

// Organizer admission log with filters, paging, CSV export (shared through
// the share sheet) and the offline sync-conflict review.
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
    <>
      <Panel>
        <SectionHeading
          title={t("org.checkin_history")}
          subtitle={t("org.checkin_hint")}
          trailing={<StatusPill tone="neutral" label={t("mobile.org.checkin_count", { p0: log.data?.total ?? 0 })} />}
        />
        <View style={[formStyles.actions, { marginBottom: 8 }]}>
          <SubtleButton label={exporting ? t("support.preparing") : t("org.csv_download")} disabled={exporting} onPress={() => void exportCsv()} />
        </View>
        <CheckInFilterForm types={types.data ?? []} onApply={apply} />
        {log.loading ? <LoadingState message={t("org.checkin_loading")} /> : null}
        {log.error ? <ErrorPanel title={t("org.checkin_error")} message={log.error} onRetry={log.reload} /> : null}
        {log.data && !log.loading ? (
          log.data.items.length === 0 ? (
            <EmptyState message={t("org.no_checkins")} />
          ) : (
            <>
              {log.data.items.map((row) => (
                <CheckInRow key={row.check_in_id} row={row} />
              ))}
              <Pagination total={log.data.total} limit={LIMIT} offset={offset} shown={log.data.items.length} onChange={setOffset} />
            </>
          )
        ) : null}
        <Intro style={{ marginTop: 12 }}>{t("org.csv_hint")}</Intro>
      </Panel>
      <SyncConflictsPanel event={event} onResolved={log.reload} />
    </>
  );
}
