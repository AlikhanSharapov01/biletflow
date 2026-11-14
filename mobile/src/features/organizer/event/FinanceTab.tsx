import { getEventFinance } from "@/api/finance";
import type { EventView } from "@/api/types";
import { ErrorPanel, FactList, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { amountLabel, dateLabel } from "@/utils/format";

import { SectionHeading } from "../components/SectionHeading";
import { SimulatedNote } from "../components/SimulatedNote";
import { PayoutsPanel } from "./finance/PayoutsPanel";
import { t, useLocale } from "@/i18n";

// Per-event money summary and simulated payouts (backend/FINANCE_API.md).
export function FinanceTab({ event }: { event: EventView }) {
  useLocale();
  const finance = useRequest(() => getEventFinance(event.id), [event.id]);
  const data = finance.data;

  return (
    <>
      <SimulatedNote>{t("mobile.org.finance_note")}</SimulatedNote>
      <Panel>
        <SectionHeading
          title={t("organizer.finance")}
          subtitle={t("mobile.org.finance_hint")}
          trailing={<StatusPill tone="neutral" label={data?.currency ?? "KZT"} />}
        />
        {finance.loading && !data ? <LoadingState message={t("org.finance_loading")} /> : null}
        {finance.error ? <ErrorPanel title={t("org.finance_error")} message={finance.error} onRetry={finance.reload} /> : null}
        {data ? (
          <FactList
            items={[
              { label: t("org.gross_sales"), value: amountLabel(data.gross_minor) },
              { label: t("org.discounts"), value: `− ${amountLabel(data.discount_minor)}` },
              { label: t("org.collected"), value: amountLabel(data.collected_minor) },
              { label: t("org.processing_fees"), value: `− ${amountLabel(data.fees_minor)}` },
              { label: t("event.refunds"), value: `− ${amountLabel(data.refunds_minor)}` },
              { label: t("mobile.org.activation_charges"), value: `− ${amountLabel(data.activation_charges_minor - data.activation_refunds_minor)}` },
              { label: t("org.net"), value: amountLabel(data.net_minor) },
              { label: t("mobile.org.paid_out"), value: amountLabel(data.sent_minor) },
              { label: t("mobile.org.reserved_for_payouts"), value: amountLabel(data.reserved_minor) },
              { label: t("mobile.org.pending_refunds"), value: amountLabel(data.pending_refunds_minor + data.pending_activation_refunds_minor) },
              { label: t("mobile.org.available_to_pay"), value: amountLabel(data.estimated_payout_minor) },
              { label: t("mobile.org.payouts_from"), value: dateLabel(data.payout_eligible_at) },
              { label: t("org.calculated"), value: dateLabel(data.generated_at) },
            ]}
          />
        ) : null}
      </Panel>
      {data ? <PayoutsPanel eventId={event.id} available={data.estimated_payout_minor} onChanged={finance.reload} /> : null}
    </>
  );
}
