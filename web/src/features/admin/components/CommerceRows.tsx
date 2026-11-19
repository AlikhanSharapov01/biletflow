import { t, useLocale } from "../../../i18n";
import type { AdminPaymentRow, AdminRefundRow } from "../../../api/types/admin";
import { ListRow, StatusPill } from "../../../components/ui";
import { dateLabel, moneyLabel, statusLabel } from "../../../utils/format";
import type { StatusTone } from "../../../utils/status";

function commerceTone(status: string): StatusTone {
  if (status === "succeeded") return "positive";
  if (status === "failed") return "blocked";
  return "pending";
}

function purposeLabel(purpose: string): string {
  if (purpose === "ticket_order") return t("admin.purpose_ticket_order");
  if (purpose === "activation") return t("admin.purpose_activation");
  return purpose;
}

// Demonstration records are always labelled as such (SRS 4.6).
function EnvironmentTag({ simulated, environment }: { simulated: boolean; environment: string }) {
  return <StatusPill tone="neutral">{simulated ? t("admin.env_simulation") : environment === "sandbox" ? t("org.env_sandbox") : environment}</StatusPill>;
}

export function PaymentRows({ items }: { items: AdminPaymentRow[] }) {
  useLocale();
  return (
    <div className="list">
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="₸"
          title={
            <>
              {moneyLabel(row.charged_minor ?? row.expected_minor, row.currency)}
              <StatusPill tone={commerceTone(row.status)}>{statusLabel(row.status)}</StatusPill>
              <EnvironmentTag simulated={row.simulated} environment={row.environment} />
            </>
          }
          meta={t("admin.payment_meta", { p0: purposeLabel(row.purpose), p1: dateLabel(row.created_at), p2: row.provider })}
          note={t("admin.commerce_ids", { p0: row.event_id, p1: row.order_id ?? row.activation_id ?? "—" })}
        >
          {row.processing_fee_minor !== null || row.confirmed_at ? (
            <small className="list-row-note">
              {t("admin.payment_detail", {
                p0: row.processing_fee_minor !== null ? moneyLabel(row.processing_fee_minor, row.currency) : "—",
                p1: dateLabel(row.confirmed_at),
              })}
            </small>
          ) : null}
        </ListRow>
      ))}
    </div>
  );
}

export function RefundRows({ items }: { items: AdminRefundRow[] }) {
  useLocale();
  return (
    <div className="list">
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="↩"
          title={
            <>
              {moneyLabel(row.amount_minor, row.currency)}
              <StatusPill tone={commerceTone(row.status)}>{statusLabel(row.status)}</StatusPill>
              <EnvironmentTag simulated={row.simulated} environment={row.environment} />
            </>
          }
          meta={t("admin.refund_meta", { p0: purposeLabel(row.purpose), p1: dateLabel(row.created_at), p2: row.latest_attempt_status ? statusLabel(row.latest_attempt_status) : "—" })}
          note={t("admin.commerce_ids", { p0: row.event_id, p1: row.order_id ?? row.activation_id ?? "—" })}
        >
          {row.reason ? <small className="list-row-note">{row.reason}</small> : null}
        </ListRow>
      ))}
    </div>
  );
}
