import { listOrders } from "@/api/orders";
import { SelectField } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel } from "@/utils/format";

import { FormMessage } from "@/components/ui/FormMessage";

interface PickerProps {
  value: string;
  onChange: (id: string) => void;
}

// Attendee cases need an event, order or ticket. Without one in the link, the
// person picks one of their own orders.
export function OrderPicker({ value, onChange }: PickerProps) {
  const orders = useRequest(() => listOrders(), []);
  const items = orders.data ?? [];
  const placeholder = orders.loading ? "Loading your orders…" : items.length ? "Choose an order" : "No orders yet";
  return (
    <>
      <SelectField
        label="Which order is this about?"
        value={value}
        placeholder={placeholder}
        disabled={orders.loading || items.length === 0}
        options={items.map((order) => ({
          value: order.id,
          label: `${order.items[0]?.ticket?.event_title ?? "Event"} · placed ${dateLabel(order.created_at, { dateStyle: "medium" })}`,
        }))}
        onChange={onChange}
      />
      <FormMessage message={orders.error ?? ""} />
    </>
  );
}
