import { listStaff, revokeStaff } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import { listMembers } from "@/api/organizations";
import { EVENT_CAPABILITIES, type EventView, type MemberDetail } from "@/api/types";
import { confirmAction, EmptyState, ErrorPanel, ListRow, LoadingState, Panel, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel } from "@/utils/format";

import { SectionHeading } from "../components/SectionHeading";
import { StaffAssignForm } from "./staff/StaffAssignForm";

export function StaffTab({ event }: { event: EventView }) {
  const { notify } = useToast();
  const staff = useRequest(async () => {
    const [assignments, members] = await Promise.all([
      listStaff(event.id),
      listMembers(event.organization_id).catch((): MemberDetail[] => []),
    ]);
    return { assignments: assignments.filter((row) => !row.revoked_at), members };
  }, [event.id, event.organization_id]);

  const memberLabel = (id: string) => {
    const member = staff.data?.members.find((row) => row.id === id);
    return member ? `${member.display_name} · ${member.email}` : `Member ${id.slice(0, 8)}`;
  };

  const revoke = async (staffId: string) => {
    const confirmed = await confirmAction({ title: "Remove this staff assignment?", confirmLabel: "Remove", destructive: true });
    if (!confirmed) return;
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
    <>
      <Panel>
        <SectionHeading title="Event staff" subtitle="Members with the “Scan tickets” capability see this event in the mobile scanner app." />
        {staff.loading && !staff.data ? <LoadingState message="Loading staff…" /> : null}
        {staff.error ? <ErrorPanel title="We couldn’t load staff." message={staff.error} onRetry={staff.reload} /> : null}
        {staff.data ? (
          staff.data.assignments.length === 0 ? (
            <EmptyState message="No staff assigned yet. The workspace owner can always scan and manage this event." />
          ) : (
            staff.data.assignments.map((row) => (
              <ListRow
                key={row.id}
                icon="S"
                title={memberLabel(row.member_id)}
                meta={row.capabilities.map((capability) => EVENT_CAPABILITIES.find((item) => item.id === capability)?.label ?? capability).join(", ")}
                note={`Assigned ${dateLabel(row.created_at)}`}
                trailing={<SubtleButton danger label="Remove" onPress={() => void revoke(row.id)} />}
              />
            ))
          )
        ) : null}
      </Panel>
      <StaffAssignForm event={event} assignable={assignable} onAssigned={staff.reload} />
    </>
  );
}
