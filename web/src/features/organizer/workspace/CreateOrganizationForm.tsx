import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { createOrganization } from "../../../api/organizations";
import type { Organization } from "../../../api/types";
import { Button, FormMessage, Panel, PanelHeading, TextField, useToast } from "../../../components/ui";
import { IDLE, text, type FormState } from "../utils/formState";

interface CreateOrganizationFormProps {
  defaultEmail: string;
  onCreated: (organization: Organization) => void;
}

export function CreateOrganizationForm({ defaultEmail, onCreated }: CreateOrganizationFormProps) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState({ ...IDLE, busy: true });
    try {
      const organization = await createOrganization({
        name: text(data, "name"),
        contact_email: text(data, "contact_email"),
        contact_phone: text(data, "contact_phone") || null,
      });
      notify(t("org.workspace_created"));
      onCreated(organization);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <PanelHeading title={t("org.create_workspace_title")} />
      <p className="form-intro">{t("org.setup_first")}</p>
      <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <TextField label={t("org.organization_name")} name="name" required maxLength={200} placeholder={t("org.organization_example")} />
        <TextField label={t("org.contact_email")} name="contact_email" type="email" defaultValue={defaultEmail} required maxLength={254} />
        <TextField label={t("org.contact_phone")} hint={t("common.optional")} name="contact_phone" maxLength={32} placeholder="+7 …" />
        <FormMessage message={state.message} success={state.success} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy}>{t("org.create_workspace")}{" "}</Button>
        </div>
      </form>
    </Panel>
  );
}
