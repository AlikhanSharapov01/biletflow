import { View } from "react-native";

import type { AdminPaymentRow, AdminRefundRow } from "@/api/types/admin";
import { ListRow, StatusPill } from "@/components/ui";
import { t, useLocale } from "@/i18n";
import { amountLabel, dateLabel, statusLabel } from "@/utils/format";

import { commerceTone, environmentLabel, purposeLabel } from "../utils/commerce";
import { RowTitle } from "./RowTitle";

// Read-only rows: no admin action rewrites payment state.
export function PaymentRows({ items }: { items: AdminPaymentRow[] }) {
  useLocale();
  return (
    <View>
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="₸"
          title={
            <RowTitle text={amountLabel(row.charged_minor ?? row.expected_minor)}>
              <StatusPill tone={commerceTone(row.status)} label={statusLabel(row.status)} />
              <StatusPill tone="neutral" label={environmentLabel(row.simulated, row.environment)} />
            </RowTitle>
          }
          meta={t("mobile.admin.payment_meta", { p0: purposeLabel(row.purpose), p1: dateLabel(row.created_at), p2: row.provider })}
          note={[
            t("mobile.admin.commerce_ids", { p0: row.event_id, p1: row.order_id ?? row.activation_id ?? "—" }),
            row.processing_fee_minor !== null || row.confirmed_at
              ? t("mobile.admin.payment_detail", {
                  p0: row.processing_fee_minor !== null ? amountLabel(row.processing_fee_minor) : "—",
                  p1: dateLabel(row.confirmed_at),
                })
              : "",
          ]
            .filter(Boolean)
            .join("\n")}
        />
      ))}
    </View>
  );
}

export function RefundRows({ items }: { items: AdminRefundRow[] }) {
  useLocale();
  return (
    <View>
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="↩"
          title={
            <RowTitle text={amountLabel(row.amount_minor)}>
              <StatusPill tone={commerceTone(row.status)} label={statusLabel(row.status)} />
              <StatusPill tone="neutral" label={environmentLabel(row.simulated, row.environment)} />
            </RowTitle>
          }
          meta={t("mobile.admin.refund_meta", {
            p0: purposeLabel(row.purpose),
            p1: dateLabel(row.created_at),
            p2: row.latest_attempt_status ? statusLabel(row.latest_attempt_status) : "—",
          })}
          note={[t("mobile.admin.commerce_ids", { p0: row.event_id, p1: row.order_id ?? row.activation_id ?? "—" }), row.reason ?? ""]
            .filter(Boolean)
            .join("\n")}
        />
      ))}
    </View>
  );
}
