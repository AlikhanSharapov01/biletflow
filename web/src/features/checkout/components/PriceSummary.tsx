import type { Order } from "../../../api/types/checkout";
import { priceLabel } from "../../../utils/format";

// Subtotal, discount, processing fee and total, straight from the server's
// saved quote. The fee is part of the total (an organizer cost), not extra.
export function PriceSummary({ order }: { order: Order }) {
  return (
    <dl className="price-summary">
      <div>
        <dt>Subtotal</dt>
        <dd>{priceLabel(order.gross_minor)}</dd>
      </div>
      {order.discount_minor > 0 ? (
        <div>
          <dt>Discount</dt>
          <dd>−{priceLabel(order.discount_minor)}</dd>
        </div>
      ) : null}
      <div>
        <dt>Processing fee</dt>
        <dd>{order.processing_fee_minor > 0 ? `${priceLabel(order.processing_fee_minor)} · included` : "None"}</dd>
      </div>
      <div className="price-summary-total">
        <dt>Total</dt>
        <dd>
          {priceLabel(order.payable_minor)} <small>{order.currency}</small>
        </dd>
      </div>
    </dl>
  );
}
