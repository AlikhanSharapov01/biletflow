import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { updateOrganization } from "../../../api/organizations";
import type { Organization } from "../../../api/types";
import { Button, FormMessage, Panel, PanelHeading, TextField, useToast } from "../../../components/ui";
import { IDLE, text, type FormState } from "../utils/formState";

interface OrganizationProfilePanelProps {
  organization: Organization;
  onSaved: (organization: Organization) => void;
}

// The organizer's public contact profile (SRS 4.1). Saving needs the
// `manage_profile` permission; the server refuses anyone else. Payout
// details live with paid-sales activation on each event.
export function OrganizationProfilePanel({ organization, onSaved }: OrganizationProfilePanelProps) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState({ ...IDLE, busy: true });
    try {
      const saved = await updateOrganization(organization.id, {
        name: text(data, "name"),
        contact_email: text(data, "contact_email"),
        contact_phone: text(data, "contact_phone") || null,
      });
      notify(t("org.profile_saved"));
      setState(IDLE);
      onSaved(saved);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <PanelHeading title={t("org.profile_title")} subtitle={t("org.profile_hint")} />
      <form key={organization.id} className="form-stack" onSubmit={(event) => void submit(event)}>
        <TextField label={t("org.organization_name")} name="name" defaultValue={organization.name} required maxLength={200} />
        <TextField label={t("org.contact_email")} name="contact_email" type="email" defaultValue={organization.contact_email} required maxLength={254} />
        <TextField label={t("org.contact_phone")} hint={t("common.optional")} name="contact_phone" defaultValue={organization.contact_phone ?? ""} maxLength={32} />
        <FormMessage message={state.message} success={state.success} />
        <div className="form-actions">
          <Button variant="primary" type="submit" busy={state.busy}>{t("org.save_changes")}</Button>
        </div>
      </form>
    </Panel>
  );
}
