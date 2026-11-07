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
  const orders = useRequest(() => listOrders(), []);
  const items = orders.data ?? [];
  return (
    <SelectField
      label="Which order is this about?"
      hint={orders.error ? orders.error : undefined}
      value={value}
      required
      disabled={orders.loading}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{orders.loading ? "Loading your orders…" : items.length ? "Choose an order" : "No orders yet"}</option>
      {items.map((order) => (
        <option key={order.id} value={order.id}>
          {order.items[0]?.ticket?.event_title ?? "Event"} · placed {dateLabel(order.created_at, { dateStyle: "medium" })}
        </option>
      ))}
    </SelectField>
  );
}

// Organizer platform cases are raised on behalf of one organization.
export function OrganizationPicker({ value, onChange }: PickerProps) {
  const organizations = useRequest(() => listOrganizations(), []);
  const items = organizations.data ?? [];
  return (
    <SelectField
      label="Organization"
      hint={organizations.error ? organizations.error : undefined}
      value={value}
      required
      disabled={organizations.loading}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {organizations.loading ? "Loading organizations…" : items.length ? "Choose an organization" : "You are not part of an organization"}
      </option>
      {items.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </SelectField>
  );
}
