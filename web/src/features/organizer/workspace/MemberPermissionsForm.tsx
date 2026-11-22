import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { setMemberPermissions } from "../../../api/organizations";
import { ORG_CAPABILITIES, type MemberDetail, type OrgCapability } from "../../../api/types";
import { Button, FormMessage, useToast } from "../../../components/ui";

interface MemberPermissionsFormProps {
  organizationId: string;
  member: MemberDetail;
  onSaved: () => void;
  onCancel: () => void;
}

// Owner-only editor for one member's organization-wide permissions.
// Event-level permissions are granted per event on the Staff tab.
export function MemberPermissionsForm({ organizationId, member, onSaved, onCancel }: MemberPermissionsFormProps) {
  useLocale();
  const { notify } = useToast();
  const [selected, setSelected] = useState<OrgCapability[]>(member.capabilities);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const toggle = (capability: OrgCapability) =>
    setSelected((current) => (current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await setMemberPermissions(organizationId, member.id, selected);
      notify(t("org.permissions_saved", { p0: member.display_name }));
      onSaved();
    } catch (failure) {
      setMessage(describeError(failure));
      setBusy(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <fieldset className="capability-grid">
        <legend>{t("org.workspace_permissions", { p0: member.display_name })}</legend>
        {ORG_CAPABILITIES.map((capability) => (
          <label className="capability" key={capability.id}>
            <input type="checkbox" checked={selected.includes(capability.id)} onChange={() => toggle(capability.id)} />
            <span>
              <strong>{capability.label}</strong>
              <small>{capability.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" size="sm" type="submit" busy={busy}>{t("common.save")}</Button>
        <Button size="sm" aria-disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}
