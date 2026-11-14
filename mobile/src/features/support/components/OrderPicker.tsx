import { listOrders } from "@/api/orders";
import { SelectField } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel } from "@/utils/format";

import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";

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
  const placeholder = orders.loading ? t("support.loading_orders") : items.length ? t("support.choose_order") : t("support.no_orders");
  return (
    <>
      <SelectField
        label={t("support.order_question")}
        value={value}
        placeholder={placeholder}
        disabled={orders.loading || items.length === 0}
        options={items.map((order) => ({
          value: order.id,
          label: t("mobile.support.order_option", { p0: order.items[0]?.ticket?.event_title ?? t("common.event"), p1: dateLabel(order.created_at, { dateStyle: "medium" }) }),
        }))}
        onChange={onChange}
      />
      <FormMessage message={orders.error ?? ""} />
    </>
  );
}
