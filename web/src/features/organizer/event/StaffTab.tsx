import { listStaff, revokeStaff } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import { listMembers } from "../../../api/organizations";
import { EVENT_CAPABILITIES, type EventView } from "../../../api/types";
import { Button, EmptyState, ErrorPanel, ListRow, Loading, Panel, PanelHeading, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";
import { StaffAssignForm } from "./StaffAssignForm";

export function StaffTab({ event }: { event: EventView }) {
  const { notify } = useToast();
  const staff = useRequest(
    async () => {
      const [assignments, members] = await Promise.all([
        listStaff(event.id),
        listMembers(event.organization_id).catch(() => []),
      ]);
      return { assignments: assignments.filter((row) => !row.revoked_at), members };
    },
    [event.id, event.organization_id],
  );

  const memberLabel = (id: string) => {
    const member = staff.data?.members.find((row) => row.id === id);
    return member ? `${member.display_name} · ${member.email}` : `Member ${id.slice(0, 8)}`;
  };

  const revoke = async (staffId: string) => {
    if (!window.confirm("Remove this staff assignment?")) return;
    try {
      await revokeStaff(event.id, staffId);
      notify("Assignment removed.");
      staff.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  const assignable = staff.data?.members.filter((member) => member.status === "active" && !member.revoked_at) ?? [];

  return (
    <div className="stack">
      <Panel>
        <PanelHeading title="Event staff" subtitle="Members with the “Scan tickets” capability see this event in the mobile scanner app." />
        {staff.loading ? <Loading label="Loading staff…" /> : null}
        {staff.error ? <ErrorPanel title="We couldn’t load staff." message={staff.error} onRetry={staff.reload} /> : null}
        {staff.data ? (
          staff.data.assignments.length === 0 ? (
            <EmptyState>No staff assigned yet. The workspace owner can always scan and manage this event.</EmptyState>
          ) : (
            <div className="list">
              {staff.data.assignments.map((row) => (
                <ListRow
                  key={row.id}
                  icon="S"
                  title={memberLabel(row.member_id)}
                  meta={row.capabilities.map((capability) => EVENT_CAPABILITIES.find((item) => item.id === capability)?.label ?? capability).join(", ")}
                  note={`Assigned ${dateLabel(row.created_at)}`}
                  actions={
                    <Button variant="danger" size="sm" onClick={() => void revoke(row.id)}>
                      Remove
                    </Button>
                  }
                />
              ))}
            </div>
          )
        ) : null}
      </Panel>
      <StaffAssignForm event={event} assignable={assignable} onAssigned={staff.reload} />
    </div>
  );
}
