import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { getEventFinance } from "../../../api/finance";
import type { EventView } from "../../../api/types";
import { ErrorPanel, Loading, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { EnvironmentPill } from "./analytics/EnvironmentPill";
import { FinanceSummary } from "./finance/FinanceSummary";
import { PayoutList } from "./finance/PayoutList";
import { PayoutRequestForm } from "./finance/PayoutRequestForm";
import { SimulatedNote } from "./paid-sales/SimulatedNote";

// Per-event money and simulated payouts (backend/FINANCE_API.md). Needs the
// organization's `finance` permission.
export function FinanceTab({ event }: { event: EventView }) {
  useLocale();
  const finance = useRequest(() => getEventFinance(event.id), [event.id]);
  const [version, setVersion] = useState(0);
  const changed = () => {
    setVersion((current) => current + 1);
    finance.reload();
  };

  return (
    <div className="stack">
      <SimulatedNote>{t("org.finance_demo_hint")}</SimulatedNote>
      <Panel>
        <PanelHeading
          title={t("organizer.finance")}
          subtitle={t("org.finance_intro")}
          trailing={finance.data ? (
            <>
              <EnvironmentPill simulated={finance.data.simulated} environments={finance.data.environments} />
              <StatusPill tone="neutral">{finance.data.currency}</StatusPill>
            </>
          ) : null}
        />
        {finance.loading && !finance.data ? <Loading label={t("org.finance_loading")} /> : null}
        {finance.error ? <ErrorPanel title={t("org.finance_error")} message={finance.error} onRetry={finance.reload} /> : null}
        {finance.data ? <FinanceSummary finance={finance.data} /> : null}
      </Panel>
      {finance.data ? (
        <Panel>
          <PanelHeading title={t("org.payouts")} subtitle={t("org.payouts_intro")} />
          {finance.data.simulation_only ? (
            <PayoutRequestForm key={version} finance={finance.data} onRequested={changed} />
          ) : (
            <p className="form-intro">{t("org.payout_mixed_env")}</p>
          )}
          <PayoutList eventId={event.id} version={version} onChanged={changed} />
        </Panel>
      ) : null}
    </div>
  );
}
