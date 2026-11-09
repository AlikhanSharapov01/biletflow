import { t, useLocale } from "../../../i18n";
import type { RefundSummary } from "../../../api/types/payments";
import { ListRow, StatusPill } from "../../../components/ui";
import { priceLabel, statusLabel } from "../../../utils/format";
import type { StatusTone } from "../../../utils/status";

const REASON: Record<string, string> = {
  get late_payment() { return t("orders.late_payment"); },
  get duplicate_charge() { return t("orders.duplicate_charge"); },
  get blocked_fulfillment() { return t("checkout.tickets_not_issued"); },
};

function refundTone(status: string): StatusTone {
  if (status === "succeeded") return "positive";
  if (status === "failed") return "blocked";
  return "pending";
}

// Compensation refunds the server created for this order's charges.
export function RefundList({ refunds }: { refunds: RefundSummary[] }) {
  useLocale();
  return (
    <div className="list">
      {refunds.map((refund) => (
        <ListRow
          key={refund.id}
          icon="↩"
          title={priceLabel(refund.amount_minor)}
          meta={REASON[refund.reason] ?? statusLabel(refund.reason)}
          note={refund.simulated ? t("orders.simulated_refund") : undefined}
          actions={<StatusPill tone={refundTone(refund.status)}>{statusLabel(refund.status)}</StatusPill>}
        />
      ))}
    </div>
  );
}
