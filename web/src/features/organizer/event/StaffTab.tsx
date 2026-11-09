import { t, useLocale } from "../../../i18n";
import { confirmAction } from "../../../components/ui/ActionDialog";
import { listStaff, revokeStaff } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import { listMembers } from "../../../api/organizations";
import { EVENT_CAPABILITIES, type EventView } from "../../../api/types";
import { Button, EmptyState, ErrorPanel, ListRow, Loading, Panel, PanelHeading, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";
import { StaffAssignForm } from "./StaffAssignForm";

export function StaffTab({ event }: { event: EventView }) {
  useLocale();
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
    return member ? `${member.display_name} · ${member.email}` : t("org.member_id", { p0: id.slice(0, 8) });
  };

  const revoke = async (staffId: string) => {
    if (!await confirmAction(t("organizer.remove_staff_confirm"))) return;
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
    <div className="stack">
      <Panel>
        <PanelHeading title={t("organizer.event_staff")} subtitle={t("org.staff_hint")} />
        {staff.loading ? <Loading label={t("org.staff_loading")} /> : null}
        {staff.error ? <ErrorPanel title={t("org.staff_error")} message={staff.error} onRetry={staff.reload} /> : null}
        {staff.data ? (
          staff.data.assignments.length === 0 ? (
            <EmptyState>{t("org.no_staff")}</EmptyState>
          ) : (
            <div className="list">
              {staff.data.assignments.map((row) => (
                <ListRow
                  key={row.id}
                  icon="S"
                  title={memberLabel(row.member_id)}
                  meta={row.capabilities.map((capability) => EVENT_CAPABILITIES.find((item) => item.id === capability)?.label ?? capability).join(", ")}
                  note={t("org.assigned_date", { p0: dateLabel(row.created_at) })}
                  actions={
                    <Button variant="danger" size="sm" onClick={() => void revoke(row.id)}>{t("common.remove")}</Button>
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
