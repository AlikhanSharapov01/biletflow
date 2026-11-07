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
      notify("Organizer workspace created.");
      onCreated(organization);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <PanelHeading title="Create your organizer workspace" />
      <p className="form-intro">Set up an organization before creating events.</p>
      <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <TextField label="Organization name" name="name" required maxLength={200} placeholder="e.g. Northline Collective" />
        <TextField label="Contact email" name="contact_email" type="email" defaultValue={defaultEmail} required maxLength={254} />
        <TextField label="Contact phone" hint="Optional" name="contact_phone" maxLength={32} placeholder="+7 …" />
        <FormMessage message={state.message} success={state.success} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy}>
            Create workspace
          </Button>
        </div>
      </form>
    </Panel>
  );
}
