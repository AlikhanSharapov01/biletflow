import { t, useLocale } from "../../../i18n";
import { confirmAction } from "../../../components/ui/ActionDialog";
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
  useLocale();
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
      notify(t("org.invitation_sent", { p0: email }));
      form.reset();
      setState(IDLE);
      team.reload();
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  const remove = async (label: string, action: () => Promise<unknown>) => {
    if (!await confirmAction(t("org.remove_confirm", { p0: label }))) return;
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
      <PanelHeading title={t("organizer.team")} subtitle={t("org.team_hint")} />
      {team.loading ? <Loading label={t("org.loading_team")} /> : null}
      {team.error ? <p className="form-intro">{team.error}{" "}{t("org.team_owner_only")}</p> : null}
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
                      {owner ? <StatusPill>{t("organizer.owner")}</StatusPill> : null}
                      {!active ? <StatusPill tone="neutral">{t("organizer.revoked")}</StatusPill> : null}
                    </>
                  }
                  meta={member.email}
                  note={owner ? t("organizer.all_permissions") : member.capabilities.length ? member.capabilities.map(statusLabel).join(", ") : t("organizer.no_permissions")}
                  actions={
                    !owner && active && isOwner ? (
                      <Button variant="danger" size="sm" onClick={() => void remove(member.display_name, () => revokeMember(organization.id, member.id))}>{t("common.remove")}</Button>
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
                    {invitation.email} <StatusPill tone="pending">{t("organizer.invited")}</StatusPill>
                  </>
                }
                meta={t("account.expires_at", { p0: dateLabel(invitation.expires_at) })}
                actions={
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void remove(t("org.invitation_for", { p0: invitation.email }), () => revokeInvitation(organization.id, invitation.id))}
                  >{t("organizer.revoke")}</Button>
                }
              />
            ))}
          </div>
          <form className="form-stack invite-form" onSubmit={(event) => void invite(event)}>
            <TextField label={t("organizer.invite_email")} name="email" type="email" required maxLength={254} placeholder="colleague@example.com" />
            <FormMessage message={state.message} />
            <div className="form-actions">
              <Button type="submit" disabled={state.busy}>{t("organizer.send_invitation")}</Button>
            </div>
          </form>
        </>
      ) : null}
    </Panel>
  );
}
