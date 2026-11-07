import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { inviteMember, listInvitations, listMembers, revokeInvitation, revokeMember } from "../../../api/organizations";
import type { Organization } from "../../../api/types";
import { Button, FormMessage, ListRow, Loading, Panel, PanelHeading, StatusPill, TextField, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";
import { IDLE, text, type FormState } from "../utils/formState";

interface TeamPanelProps {
  organization: Organization;
  isOwner: boolean;
}

export function TeamPanel({ organization, isOwner }: TeamPanelProps) {
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);
  const team = useRequest(
    async () => {
      const [members, invitations] = await Promise.all([listMembers(organization.id), listInvitations(organization.id)]);
      return { members, invitations: invitations.filter((item) => !item.accepted_at && !item.revoked_at) };
    },
    [organization.id],
  );

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = text(new FormData(form), "email");
    setState({ ...IDLE, busy: true });
    try {
      await inviteMember(organization.id, email);
      notify(`Invitation emailed to ${email}.`);
      form.reset();
      setState(IDLE);
      team.reload();
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  const remove = async (label: string, action: () => Promise<unknown>) => {
    if (!window.confirm(`Remove ${label}?`)) return;
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
      <PanelHeading title="Team" subtitle="Invite staff by email, then assign them to events with the capabilities they need." />
      {team.loading ? <Loading label="Loading team…" /> : null}
      {team.error ? <p className="form-intro">{team.error} Only the owner and staff managers can see the team.</p> : null}
      {team.data ? (
        <>
          <div className="list">
            {team.data.members.map((member) => {
              const owner = member.user_id === organization.owner_user_id;
              const active = member.status === "active" && !member.revoked_at;
              return (
                <ListRow
                  key={member.id}
                  icon={owner ? "★" : "M"}
                  title={
                    <>
                      {member.display_name}
                      {owner ? <StatusPill>Owner</StatusPill> : null}
                      {!active ? <StatusPill tone="neutral">Revoked</StatusPill> : null}
                    </>
                  }
                  meta={member.email}
                  note={owner ? "All permissions" : member.capabilities.length ? member.capabilities.map(statusLabel).join(", ") : "No workspace permissions"}
                  actions={
                    !owner && active && isOwner ? (
                      <Button variant="danger" size="sm" onClick={() => void remove(member.display_name, () => revokeMember(organization.id, member.id))}>
                        Remove
                      </Button>
                    ) : null
                  }
                />
              );
            })}
            {team.data.invitations.map((invitation) => (
              <ListRow
                key={invitation.id}
                icon="✉"
                title={
                  <>
                    {invitation.email} <StatusPill tone="pending">Invited</StatusPill>
                  </>
                }
                meta={`Expires ${dateLabel(invitation.expires_at)}`}
                actions={
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void remove(`the invitation for ${invitation.email}`, () => revokeInvitation(organization.id, invitation.id))}
                  >
                    Revoke
                  </Button>
                }
              />
            ))}
          </div>
          <form className="form-stack invite-form" onSubmit={(event) => void invite(event)}>
            <TextField label="Invite by email" name="email" type="email" required maxLength={254} placeholder="colleague@example.com" />
            <FormMessage message={state.message} />
            <div className="form-actions">
              <Button type="submit" disabled={state.busy}>
                Send invitation
              </Button>
            </div>
          </form>
        </>
      ) : null}
    </Panel>
  );
}
