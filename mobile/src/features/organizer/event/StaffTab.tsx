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
import { t, useLocale } from "@/i18n";

export function StaffTab({ event }: { event: EventView }) {
  useLocale();
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
    return member ? `${member.display_name} · ${member.email}` : t("org.member_id", { p0: id.slice(0, 8) });
  };

  const revoke = async (staffId: string) => {
    const confirmed = await confirmAction({ title: t("organizer.remove_staff_confirm"), confirmLabel: t("common.remove"), destructive: true });
    if (!confirmed) return;
    try {
      await revokeStaff(event.id, staffId);
      notify(t("org.assignment_removed"));
      staff.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  const assignable = staff.data?.members.filter((member) => member.status === "active" && !member.revoked_at) ?? [];

  return (
    <>
      <Panel>
        <SectionHeading title={t("organizer.event_staff")} subtitle={t("org.staff_hint")} />
        {staff.loading && !staff.data ? <LoadingState message={t("org.staff_loading")} /> : null}
        {staff.error ? <ErrorPanel title={t("org.staff_error")} message={staff.error} onRetry={staff.reload} /> : null}
        {staff.data ? (
          staff.data.assignments.length === 0 ? (
            <EmptyState message={t("org.no_staff")} />
          ) : (
            staff.data.assignments.map((row) => (
              <ListRow
                key={row.id}
                icon="S"
                title={memberLabel(row.member_id)}
                meta={row.capabilities.map((capability) => EVENT_CAPABILITIES.find((item) => item.id === capability)?.label ?? capability).join(", ")}
                note={t("org.assigned_date", { p0: dateLabel(row.created_at) })}
                trailing={<SubtleButton danger label={t("common.remove")} onPress={() => void revoke(row.id)} />}
              />
            ))
          )
        ) : null}
      </Panel>
      <StaffAssignForm event={event} assignable={assignable} onAssigned={staff.reload} />
    </>
  );
}
