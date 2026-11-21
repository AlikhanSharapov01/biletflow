import { t, useLocale } from "../../../i18n";
import { getInspection } from "../../../api/admin";
import type { InspectionKind } from "../../../api/types/admin";
import { Button, ErrorPanel, Loading, Panel, PanelHeading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { RecordView } from "./RecordView";

interface InspectionDetailProps {
  kind: InspectionKind | "orders";
  recordId: string;
  title: string;
  onClose: () => void;
}

// Read-only detail of one inspected record. Inspecting never grants a role:
// any action stays with the owning module (ADMIN_API.md).
export function InspectionDetail({ kind, recordId, title, onClose }: InspectionDetailProps) {
  useLocale();
  const detail = useRequest(() => getInspection(kind, recordId), [kind, recordId]);
  return (
    <Panel>
      <PanelHeading
        title={title}
        subtitle={t("admin.inspect_read_only")}
        trailing={<Button size="sm" onClick={onClose}>{t("common.close")}</Button>}
      />
      <p className="cell-note">
        <code className="id-code">{recordId}</code>
      </p>
      {detail.loading ? <Loading label={t("admin.inspect_loading")} /> : null}
      {detail.error ? <ErrorPanel title={t("admin.inspect_error")} message={detail.error} onRetry={detail.reload} /> : null}
      {detail.data && !detail.loading ? <RecordView record={detail.data} /> : null}
    </Panel>
  );
}
