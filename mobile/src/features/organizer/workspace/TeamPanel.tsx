import { StyleSheet, View } from "react-native";

import { describeError } from "@/api/errors";
import { listInvitations, listMembers, revokeInvitation, revokeMember } from "@/api/organizations";
import type { Organization } from "@/api/types";
import { confirmAction, ListRow, LoadingState, Panel, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, statusLabel } from "@/utils/format";

import { Intro } from "../components/Intro";
import { SectionHeading } from "../components/SectionHeading";
import { InviteForm } from "./InviteForm";
import { t, useLocale } from "@/i18n";

interface TeamPanelProps {
  organization: Organization;
  isOwner: boolean;
}

export function TeamPanel({ organization, isOwner }: TeamPanelProps) {
  useLocale();
  const { notify } = useToast();
  const team = useRequest(
    async () => {
      const [members, invitations] = await Promise.all([listMembers(organization.id), listInvitations(organization.id)]);
      return { members, invitations: invitations.filter((item) => !item.accepted_at && !item.revoked_at) };
    },
    [organization.id],
  );

  const remove = async (label: string, action: () => Promise<unknown>) => {
    const confirmed = await confirmAction({ title: t("org.remove_confirm", { p0: label }), confirmLabel: t("common.remove"), destructive: true });
    if (!confirmed) return;
    try {
      await action();
      notify(t("org.removed"));
      team.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <Panel>
      <SectionHeading title={t("organizer.team")} subtitle={t("org.team_hint")} />
      {team.loading ? <LoadingState message={t("org.loading_team")} /> : null}
      {team.error ? <Intro>{t("mobile.org.team_hidden", { p0: team.error })}</Intro> : null}
      {team.data && !team.loading ? (
        <>
          {team.data.members.map((member) => {
            const owner = member.user_id === organization.owner_user_id;
            const active = member.status === "active" && !member.revoked_at;
            return (
              <ListRow
                key={member.id}
                icon={owner ? "★" : "M"}
                title={member.display_name}
                meta={member.email}
                note={owner ? t("organizer.all_permissions") : member.capabilities.length ? member.capabilities.map(statusLabel).join(", ") : t("organizer.no_permissions")}
                trailing={
                  <View style={styles.trailing}>
                    {owner ? <StatusPill label={t("organizer.owner")} /> : null}
                    {!active ? <StatusPill tone="neutral" label={t("organizer.revoked")} /> : null}
                    {!owner && active && isOwner ? (
                      <SubtleButton danger label={t("common.remove")} onPress={() => void remove(member.display_name, () => revokeMember(organization.id, member.id))} />
                    ) : null}
                  </View>
                }
              />
            );
          })}
          {team.data.invitations.map((invitation) => (
            <ListRow
              key={invitation.id}
              icon="✉"
              title={invitation.email}
              meta={t("account.expires_at", { p0: dateLabel(invitation.expires_at) })}
              trailing={
                <View style={styles.trailing}>
                  <StatusPill tone="pending" label={t("organizer.invited")} />
                  <SubtleButton
                    danger
                    label={t("organizer.revoke")}
                    onPress={() => void remove(t("org.invitation_for", { p0: invitation.email }), () => revokeInvitation(organization.id, invitation.id))}
                  />
                </View>
              }
            />
          ))}
          <InviteForm organizationId={organization.id} onInvited={team.reload} />
        </>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end", gap: 6 },
});
