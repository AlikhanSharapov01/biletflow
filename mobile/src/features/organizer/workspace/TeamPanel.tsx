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

interface TeamPanelProps {
  organization: Organization;
  isOwner: boolean;
}

export function TeamPanel({ organization, isOwner }: TeamPanelProps) {
  const { notify } = useToast();
  const team = useRequest(
    async () => {
      const [members, invitations] = await Promise.all([listMembers(organization.id), listInvitations(organization.id)]);
      return { members, invitations: invitations.filter((item) => !item.accepted_at && !item.revoked_at) };
    },
    [organization.id],
  );

  const remove = async (label: string, action: () => Promise<unknown>) => {
    const confirmed = await confirmAction({ title: `Remove ${label}?`, confirmLabel: "Remove", destructive: true });
    if (!confirmed) return;
    try {
      await action();
      notify("Removed.");
      team.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <Panel>
      <SectionHeading title="Team" subtitle="Invite staff by email, then assign them to events with the capabilities they need." />
      {team.loading ? <LoadingState message="Loading team…" /> : null}
      {team.error ? <Intro>{`${team.error} Only the owner and staff managers can see the team.`}</Intro> : null}
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
                note={owner ? "All permissions" : member.capabilities.length ? member.capabilities.map(statusLabel).join(", ") : "No workspace permissions"}
                trailing={
                  <View style={styles.trailing}>
                    {owner ? <StatusPill label="Owner" /> : null}
                    {!active ? <StatusPill tone="neutral" label="Revoked" /> : null}
                    {!owner && active && isOwner ? (
                      <SubtleButton danger label="Remove" onPress={() => void remove(member.display_name, () => revokeMember(organization.id, member.id))} />
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
              meta={`Expires ${dateLabel(invitation.expires_at)}`}
              trailing={
                <View style={styles.trailing}>
                  <StatusPill tone="pending" label="Invited" />
                  <SubtleButton
                    danger
                    label="Revoke"
                    onPress={() => void remove(`the invitation for ${invitation.email}`, () => revokeInvitation(organization.id, invitation.id))}
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
