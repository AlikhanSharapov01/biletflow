import { getEventFinance } from "@/api/finance";
import type { EventView } from "@/api/types";
import { ErrorPanel, FactList, LoadingState, NotAvailableYet, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, priceLabel } from "@/utils/format";

import { SectionHeading } from "../components/SectionHeading";
import { SimulatedNote } from "../components/SimulatedNote";
import { orPlanned } from "../utils/planned";

// Per-event money summary on the PLANNED finance contract.
export function FinanceTab({ event }: { event: EventView }) {
  const finance = useRequest(() => orPlanned(() => getEventFinance(event.id)), [event.id]);
  const data = finance.data && !finance.data.planned ? finance.data.value : null;

  return (
    <>
      <SimulatedNote>Figures come from simulated payments. Payouts are estimates and no money is transferred.</SimulatedNote>
      <Panel>
        <SectionHeading
          title="Finance"
          subtitle="Gross sales, processing fees, refunds and the estimated organizer payout."
          trailing={<StatusPill tone="neutral" label="KZT" />}
        />
        {finance.loading ? <LoadingState message="Loading finance…" /> : null}
        {finance.error ? <ErrorPanel title="We couldn’t load finance." message={finance.error} onRetry={finance.reload} /> : null}
        {finance.data?.planned ? <NotAvailableYet feature="Event finance" /> : null}
        {data ? (
          <FactList
            items={[
              { label: "Gross sales", value: priceLabel(data.gross_minor) },
              { label: "Processing fees", value: `− ${priceLabel(data.fees_minor)}` },
              { label: "Refunds", value: `− ${priceLabel(data.refunds_minor)}` },
              { label: "Estimated payout", value: priceLabel(data.estimated_payout_minor) },
              { label: "Calculated", value: dateLabel(data.generated_at) },
            ]}
          />
        ) : null}
      </Panel>
    </>
  );
}
