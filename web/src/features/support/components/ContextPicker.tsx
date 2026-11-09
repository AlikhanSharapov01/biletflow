import { t, useLocale } from "../../../i18n";
import { listOrders } from "../../../api/orders";
import { listOrganizations } from "../../../api/organizations";
import { SelectField } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";

interface PickerProps {
  value: string;
  onChange: (id: string) => void;
}

// Attendee cases need an event, order or ticket. Without one in the link, the
// person picks one of their own orders.
export function OrderPicker({ value, onChange }: PickerProps) {
  useLocale();
  const orders = useRequest(() => listOrders(), []);
  const items = orders.data ?? [];
  return (
    <SelectField
      label={t("support.order_question")}
      hint={orders.error ? orders.error : undefined}
      value={value}
      required
      disabled={orders.loading}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{orders.loading ? t("support.loading_orders") : items.length ? t("support.choose_order") : t("support.no_orders")}</option>
      {items.map((order) => (
        <option key={order.id} value={order.id}>
          {order.items[0]?.ticket?.event_title ?? t("common.event")}{" "}{t("common.placed_suffix")}{" "}{dateLabel(order.created_at, { dateStyle: "medium" })}
        </option>
      ))}
    </SelectField>
  );
}

// Organizer platform cases are raised on behalf of one organization.
export function OrganizationPicker({ value, onChange }: PickerProps) {
  useLocale();
  const organizations = useRequest(() => listOrganizations(), []);
  const items = organizations.data ?? [];
  return (
    <SelectField
      label={t("support.organization")}
      hint={organizations.error ? organizations.error : undefined}
      value={value}
      required
      disabled={organizations.loading}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {organizations.loading ? t("support.loading_organizations") : items.length ? t("support.choose_organization") : t("support.no_organization")}
      </option>
      {items.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </SelectField>
  );
}
