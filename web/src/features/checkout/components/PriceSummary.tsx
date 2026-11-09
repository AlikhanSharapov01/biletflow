import { t, useLocale } from "../../../i18n";
import type { Order, Pricing } from "../../../api/types/checkout";
import { priceLabel } from "../../../utils/format";

// Subtotal, discount, processing fee and total, straight from the server's
// saved quote. The fee is part of the total (an organizer cost), not extra.
export function PriceSummary({ order, pricing }: { order: Order; pricing?: never } | { order?: never; pricing: Pricing }) {
  useLocale();
  const quote = order ? { gross: order.gross_minor, discount: order.discount_minor, processing_fee: order.processing_fee_minor, payable: order.payable_minor } : pricing;
  const currency = order?.currency ?? "KZT";
  return (
    <dl className="price-summary">
      <div>
        <dt>{t("common.subtotal")}</dt>
        <dd>{priceLabel(quote.gross)}</dd>
      </div>
      {quote.discount > 0 ? (
        <div>
          <dt>{t("common.discount")}</dt>
          <dd>−{priceLabel(quote.discount)}</dd>
        </div>
      ) : null}
      <div>
        <dt>{t("checkout.processing_fee")}</dt>
        <dd>{quote.processing_fee > 0 ? t("checkout.included_fee", { amount: priceLabel(quote.processing_fee) }) : t("checkout.no_fee")}</dd>
      </div>
      <div className="price-summary-total">
        <dt>{t("common.total")}</dt>
        <dd>
          {priceLabel(quote.payable)} <small>{currency}</small>
        </dd>
      </div>
    </dl>
  );
}
