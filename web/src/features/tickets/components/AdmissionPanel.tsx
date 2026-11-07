import { getAdmission } from "../../../api/tickets";
import { Button, ErrorPanel, FactList, Loading, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";
import { admissionSummary } from "../utils/ticketStatus";

// "Am I checked in?" from GET /tickets/{id}/admission.
export function AdmissionPanel({ ticketId }: { ticketId: string }) {
  const admission = useRequest(() => getAdmission(ticketId), [ticketId]);
  const summary = admission.data ? admissionSummary(admission.data) : null;

  return (
    <Panel className="no-print">
      <PanelHeading
        title="Admission"
        trailing={summary ? <StatusPill tone={summary.tone}>{summary.label}</StatusPill> : null}
      />
      {admission.loading && !admission.data ? <Loading label="Checking admission…" /> : null}
      {admission.error ? <ErrorPanel title="We couldn’t check admission." message={admission.error} onRetry={admission.reload} /> : null}
      {admission.data && summary ? (
        <>
          <p className="form-intro">{summary.detail}</p>
          <FactList
            items={[
              { label: "Doors", value: `${dateLabel(admission.data.admission_window.opens_at)} – ${dateLabel(admission.data.admission_window.closes_at)}` },
              ...(admission.data.checked_in_at ? [{ label: "Checked in", value: dateLabel(admission.data.checked_in_at) }] : []),
              ...(admission.data.reversed_at ? [{ label: "Reversed", value: dateLabel(admission.data.reversed_at) }] : []),
            ]}
          />
          <div className="form-actions">
            <Button variant="text" onClick={admission.reload}>
              Refresh
            </Button>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
