import { t, useLocale } from "../../../../i18n";
import type { EventFinance } from "../../../../api/types/finance";
import { FactList } from "../../../../components/ui";
import { dateLabel, moneyLabel } from "../../../../utils/format";

// The server's finance figures (FINANCE_API.md), in its own order: ticket
// money, then activation charges, then payouts. Nothing is recomputed here.
export function FinanceSummary({ finance }: { finance: EventFinance }) {
  useLocale();
  const money = (minor: number) => moneyLabel(minor, finance.currency);
  const less = (minor: number) => (minor === 0 ? money(0) : `− ${money(minor)}`);
  const activationNet = finance.activation_charges_minor - finance.activation_refunds_minor;
  return (
    <div className="finance-groups">
      <section aria-labelledby="finance-sales">
        <h3 id="finance-sales" className="finance-group-title">{t("org.finance_sales")}</h3>
        <FactList
          items={[
            { label: t("org.gross_sales"), value: money(finance.gross_minor) },
            { label: t("org.discounts"), value: less(finance.discount_minor) },
            { label: t("org.collected"), value: money(finance.collected_minor) },
            { label: t("org.processing_fees"), value: less(finance.fees_minor) },
            { label: t("event.refunds"), value: less(finance.refunds_minor) },
            { label: t("org.pending_refunds"), value: money(finance.pending_refunds_minor) },
            { label: t("org.activation_charges"), value: less(activationNet) },
            { label: t("org.net_revenue"), value: <strong>{money(finance.net_minor)}</strong> },
          ]}
        />
      </section>
      <section aria-labelledby="finance-payouts">
        <h3 id="finance-payouts" className="finance-group-title">{t("org.payouts")}</h3>
        <FactList
          items={[
            { label: t("org.payouts_sent"), value: less(finance.sent_minor) },
            { label: t("org.balance"), value: money(finance.balance_minor) },
            { label: t("org.reserved"), value: money(finance.reserved_minor) },
            { label: t("org.estimated_payout"), value: <strong>{money(finance.estimated_payout_minor)}</strong> },
            { label: t("org.payout_eligible_at"), value: dateLabel(finance.payout_eligible_at) },
            { label: t("org.calculated"), value: dateLabel(finance.generated_at) },
          ]}
        />
      </section>
    </div>
  );
}
