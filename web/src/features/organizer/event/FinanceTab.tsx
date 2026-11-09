import { t, useLocale } from "../../../i18n";
import { getEventFinance } from "../../../api/finance";
import type { EventView } from "../../../api/types";
import { ErrorPanel, FactList, Loading, NotAvailableYet, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, priceLabel } from "../../../utils/format";
import { orPlanned } from "../utils/planned";
import { SimulatedNote } from "./paid-sales/SimulatedNote";

// Per-event money summary on the PLANNED finance contract.
export function FinanceTab({ event }: { event: EventView }) {
  useLocale();
  const finance = useRequest(() => orPlanned(() => getEventFinance(event.id)), [event.id]);

  return (
    <div className="stack">
      <SimulatedNote>{t("org.finance_demo_hint")}</SimulatedNote>
      <Panel>
        <PanelHeading title={t("organizer.finance")} subtitle={t("org.finance_intro")} trailing={<StatusPill tone="neutral">KZT</StatusPill>} />
        {finance.loading ? <Loading label={t("org.finance_loading")} /> : null}
        {finance.error ? <ErrorPanel title={t("org.finance_error")} message={finance.error} onRetry={finance.reload} /> : null}
        {finance.data?.planned ? <NotAvailableYet feature={t("org.event_finance")} /> : null}
        {finance.data && !finance.data.planned ? (
          <FactList
            items={[
              { label: t("org.gross_sales"), value: priceLabel(finance.data.value.gross_minor) },
              { label: t("org.processing_fees"), value: `− ${priceLabel(finance.data.value.fees_minor)}` },
              { label: t("event.refunds"), value: `− ${priceLabel(finance.data.value.refunds_minor)}` },
              { label: t("org.estimated_payout"), value: <strong>{priceLabel(finance.data.value.estimated_payout_minor)}</strong> },
              { label: t("org.calculated"), value: dateLabel(finance.data.value.generated_at) },
            ]}
          />
        ) : null}
      </Panel>
    </div>
  );
}
