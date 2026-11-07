import { getEventFinance } from "../../../api/finance";
import type { EventView } from "../../../api/types";
import { ErrorPanel, FactList, Loading, NotAvailableYet, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, priceLabel } from "../../../utils/format";
import { orPlanned } from "../utils/planned";
import { SimulatedNote } from "./paid-sales/SimulatedNote";

// Per-event money summary on the PLANNED finance contract.
export function FinanceTab({ event }: { event: EventView }) {
  const finance = useRequest(() => orPlanned(() => getEventFinance(event.id)), [event.id]);

  return (
    <div className="stack">
      <SimulatedNote>Figures come from simulated payments. Payouts are estimates and no money is transferred.</SimulatedNote>
      <Panel>
        <PanelHeading title="Finance" subtitle="Gross sales, processing fees, refunds and the estimated organizer payout." trailing={<StatusPill tone="neutral">KZT</StatusPill>} />
        {finance.loading ? <Loading label="Loading finance…" /> : null}
        {finance.error ? <ErrorPanel title="We couldn’t load finance." message={finance.error} onRetry={finance.reload} /> : null}
        {finance.data?.planned ? <NotAvailableYet feature="Event finance" /> : null}
        {finance.data && !finance.data.planned ? (
          <FactList
            items={[
              { label: "Gross sales", value: priceLabel(finance.data.value.gross_minor) },
              { label: "Processing fees", value: `− ${priceLabel(finance.data.value.fees_minor)}` },
              { label: "Refunds", value: `− ${priceLabel(finance.data.value.refunds_minor)}` },
              { label: "Estimated payout", value: <strong>{priceLabel(finance.data.value.estimated_payout_minor)}</strong> },
              { label: "Calculated", value: dateLabel(finance.data.value.generated_at) },
            ]}
          />
        ) : null}
      </Panel>
    </div>
  );
}
