import { getEventFinance } from "@/api/finance";
import type { EventView } from "@/api/types";
import { ErrorPanel, FactList, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { amountLabel, dateLabel } from "@/utils/format";

import { SectionHeading } from "../components/SectionHeading";
import { SimulatedNote } from "../components/SimulatedNote";
import { PayoutsPanel } from "./finance/PayoutsPanel";

// Per-event money summary and simulated payouts (backend/FINANCE_API.md).
export function FinanceTab({ event }: { event: EventView }) {
  const finance = useRequest(() => getEventFinance(event.id), [event.id]);
  const data = finance.data;

  return (
    <>
      <SimulatedNote>Figures come from simulated payments. Payouts are simulated and no money is transferred.</SimulatedNote>
      <Panel>
        <SectionHeading
          title="Finance"
          subtitle="Ticket sales, fees, refunds and activation charges, and what can be paid out."
          trailing={<StatusPill tone="neutral" label={data?.currency ?? "KZT"} />}
        />
        {finance.loading && !data ? <LoadingState message="Loading finance…" /> : null}
        {finance.error ? <ErrorPanel title="We couldn’t load finance." message={finance.error} onRetry={finance.reload} /> : null}
        {data ? (
          <FactList
            items={[
              { label: "Gross sales", value: amountLabel(data.gross_minor) },
              { label: "Discounts", value: `− ${amountLabel(data.discount_minor)}` },
              { label: "Collected", value: amountLabel(data.collected_minor) },
              { label: "Processing fees", value: `− ${amountLabel(data.fees_minor)}` },
              { label: "Refunds", value: `− ${amountLabel(data.refunds_minor)}` },
              { label: "Activation charges", value: `− ${amountLabel(data.activation_charges_minor - data.activation_refunds_minor)}` },
              { label: "Net", value: amountLabel(data.net_minor) },
              { label: "Paid out", value: amountLabel(data.sent_minor) },
              { label: "Reserved for payouts", value: amountLabel(data.reserved_minor) },
              { label: "Pending refunds", value: amountLabel(data.pending_refunds_minor + data.pending_activation_refunds_minor) },
              { label: "Available to pay out", value: amountLabel(data.estimated_payout_minor) },
              { label: "Payouts can be sent from", value: dateLabel(data.payout_eligible_at) },
              { label: "Calculated", value: dateLabel(data.generated_at) },
            ]}
          />
        ) : null}
      </Panel>
      {data ? <PayoutsPanel eventId={event.id} available={data.estimated_payout_minor} onChanged={finance.reload} /> : null}
    </>
  );
}
