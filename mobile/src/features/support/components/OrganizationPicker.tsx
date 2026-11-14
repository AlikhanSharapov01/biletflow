import { listOrganizations } from "@/api/organizations";
import { SelectField } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";

interface PickerProps {
  value: string;
  onChange: (id: string) => void;
}

// Organizer platform cases are raised on behalf of one organization.
export function OrganizationPicker({ value, onChange }: PickerProps) {
  useLocale();
  const organizations = useRequest(() => listOrganizations(), []);
  const items = organizations.data ?? [];
  const placeholder = organizations.loading
    ? t("support.loading_organizations")
    : items.length
      ? t("support.choose_organization")
      : t("support.no_organization");
  return (
    <>
      <SelectField
        label={t("support.organization")}
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
