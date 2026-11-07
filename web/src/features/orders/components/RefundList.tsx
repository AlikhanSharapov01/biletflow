import type { RefundSummary } from "../../../api/types/payments";
import { ListRow, StatusPill } from "../../../components/ui";
import { priceLabel, statusLabel } from "../../../utils/format";
import type { StatusTone } from "../../../utils/status";

const REASON: Record<string, string> = {
  late_payment: "Payment arrived after the reservation expired",
  duplicate_charge: "Duplicate charge",
  blocked_fulfillment: "Tickets could not be issued",
};

function refundTone(status: string): StatusTone {
  if (status === "succeeded") return "positive";
  if (status === "failed") return "blocked";
  return "pending";
}

// Compensation refunds the server created for this order's charges.
export function RefundList({ refunds }: { refunds: RefundSummary[] }) {
  return (
    <div className="list">
      {refunds.map((refund) => (
        <ListRow
          key={refund.id}
          icon="↩"
          title={priceLabel(refund.amount_minor)}
          meta={REASON[refund.reason] ?? statusLabel(refund.reason)}
          note={refund.simulated ? "Simulated refund — no real money moves" : undefined}
          actions={<StatusPill tone={refundTone(refund.status)}>{statusLabel(refund.status)}</StatusPill>}
        />
      ))}
    </div>
  );
}
