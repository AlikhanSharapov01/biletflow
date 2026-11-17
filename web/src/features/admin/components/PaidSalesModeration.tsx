import { t, useLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import { getEventPaidSales, moderatePaidSales } from "../../../api/admin";
import { Button, ErrorPanel, FactList, Loading, StatusPill, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, moneyLabel, statusLabel } from "../../../utils/format";
import { createRetryKeys } from "../../support/retryKey";
import { ReasonForm } from "./ReasonForm";

// Paid-sales activation record for one event and the platform's
// suspend/reinstate decision (SRS 4.5). Suspension stops new paid orders
// only; free tickets, sold tickets and refunds are untouched.
export function PaidSalesModeration({ eventId }: { eventId: string }) {
  useLocale();
  const { notify } = useToast();
  const record = useRequest(() => getEventPaidSales(eventId), [eventId]);
  const [deciding, setDeciding] = useState(false);
  // A retried decision with the same reason reuses its Idempotency-Key.
  const keys = useMemo(() => createRetryKeys(), []);

  if (record.loading) return <Loading label={t("admin.paid_sales_loading")} />;
  if (record.error || !record.data) return <ErrorPanel title={t("admin.paid_sales_error")} message={record.error ?? ""} onRetry={record.reload} />;

  const checklist = record.data;
  const suspended = checklist.status === "suspended";
  const decidable = suspended || checklist.status === "active";

  return (
    <div className="stack">
      <FactList
        items={[
          { label: t("organizer.paid_sales"), value: <StatusPill tone={suspended ? "blocked" : checklist.status === "active" ? "positive" : "pending"}>{statusLabel(checklist.status)}</StatusPill> },
          { label: t("admin.activated_at"), value: dateLabel(checklist.activated_at) },
          { label: t("org.activation_charges"), value: moneyLabel(checklist.activation_fee_minor, checklist.currency) },
          { label: t("admin.missing_steps"), value: checklist.missing.length ? checklist.missing.map(statusLabel).join(", ") : t("admin.none") },
          ...(checklist.suspension_reason ? [{ label: t("admin.suspension_reason"), value: checklist.suspension_reason }] : []),
        ]}
      />
      {!decidable ? <p className="form-intro">{t("admin.paid_sales_not_active")}</p> : null}
      {decidable && !deciding ? (
        <div className="form-actions">
          <Button size="sm" variant={suspended ? "subtle" : "danger"} onClick={() => setDeciding(true)}>
            {suspended ? t("admin.reinstate_paid_sales") : t("admin.suspend_paid_sales")}
          </Button>
        </div>
      ) : null}
      {decidable && deciding ? (
        <ReasonForm
          label={suspended ? t("admin.reason_reinstate") : t("admin.reason_suspend_paid_sales")}
          submitLabel={suspended ? t("admin.reinstate_paid_sales") : t("admin.suspend_paid_sales")}
          danger={!suspended}
          onCancel={() => setDeciding(false)}
          onSubmit={async (reason) => {
            const action = suspended ? "reinstate" : "suspend";
            await moderatePaidSales(eventId, action, reason, keys.keyFor({ eventId, action, reason }));
            keys.reset();
            notify(suspended ? t("admin.paid_sales_reinstated") : t("admin.paid_sales_suspended"));
            setDeciding(false);
            record.reload();
          }}
        />
      ) : null}
    </div>
  );
}
