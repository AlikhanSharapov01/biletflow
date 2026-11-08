import { listOrganizations } from "@/api/organizations";
import { SelectField } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { FormMessage } from "@/components/ui/FormMessage";

interface PickerProps {
  value: string;
  onChange: (id: string) => void;
}

// Organizer platform cases are raised on behalf of one organization.
export function OrganizationPicker({ value, onChange }: PickerProps) {
  const organizations = useRequest(() => listOrganizations(), []);
  const items = organizations.data ?? [];
  const placeholder = organizations.loading
    ? "Loading organizations…"
    : items.length
      ? "Choose an organization"
      : "You are not part of an organization";
  return (
    <>
      <SelectField
        label="Organization"
        value={value}
        placeholder={placeholder}
        disabled={organizations.loading || items.length === 0}
        options={items.map((organization) => ({ value: organization.id, label: organization.name }))}
        onChange={onChange}
      />
      <FormMessage message={organizations.error ?? ""} />
    </>
  );
}
