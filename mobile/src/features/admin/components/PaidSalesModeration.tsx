import { useMemo, useState } from "react";
import { View } from "react-native";

import { getEventPaidSales, moderatePaidSales } from "@/api/admin";
import { ErrorPanel, FactList, LoadingState, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { createRetryKeys } from "@/features/support/utils/retryKey";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";
import { amountLabel, dateLabel, statusLabel } from "@/utils/format";

import { formStyles } from "../../organizer/components/formStyles";
import { Intro } from "../../organizer/components/Intro";
import { ModerationDialog, type ModerationRequest } from "./ModerationDialog";

// Paid-sales activation record for one event and the platform's
// suspend/reinstate decision (SRS 4.5). Suspension stops new paid orders
// only; free tickets, sold tickets and refunds are untouched.
export function PaidSalesModeration({ eventId }: { eventId: string }) {
  useLocale();
  const { notify } = useToast();
  const record = useRequest(() => getEventPaidSales(eventId), [eventId]);
  const [pending, setPending] = useState<ModerationRequest | null>(null);
  // A retried decision with the same reason reuses its Idempotency-Key.
  const keys = useMemo(() => createRetryKeys(), []);

  if (record.loading && !record.data) return <LoadingState message={t("mobile.admin.paid_sales_loading")} />;
  if (record.error || !record.data) {
    return <ErrorPanel title={t("mobile.admin.paid_sales_error")} message={record.error ?? ""} onRetry={record.reload} />;
  }

  const checklist = record.data;
  const suspended = checklist.status === "suspended";
  const decidable = suspended || checklist.status === "active";
  const tone = suspended ? "blocked" : checklist.status === "active" ? "positive" : "pending";

  const ask = () =>
    setPending({
      title: suspended ? t("mobile.admin.reinstate_paid_sales") : t("mobile.admin.suspend_paid_sales"),
      message: suspended ? t("admin.reason_reinstate") : t("mobile.admin.reason_suspend_paid_sales"),
      confirmLabel: suspended ? t("mobile.admin.reinstate_paid_sales") : t("mobile.admin.suspend_paid_sales"),
      run: async (reason) => {
        const action = suspended ? "reinstate" : "suspend";
        await moderatePaidSales(eventId, action, reason, keys.keyFor({ eventId, action, reason }));
        keys.reset();
        notify(suspended ? t("mobile.admin.paid_sales_reinstated") : t("mobile.admin.paid_sales_suspended"));
        record.reload();
      },
    });

  return (
    <View style={formStyles.inline}>
      <FactList
        items={[
          { label: t("organizer.paid_sales"), value: <StatusPill tone={tone} label={statusLabel(checklist.status)} /> },
          { label: t("mobile.admin.activated_at"), value: dateLabel(checklist.activated_at) },
          { label: t("mobile.admin.purpose_activation"), value: amountLabel(checklist.activation_fee_minor) },
          {
            label: t("mobile.admin.missing_steps"),
            value: checklist.missing.length ? checklist.missing.map(statusLabel).join(", ") : t("mobile.admin.none"),
          },
          ...(checklist.suspension_reason ? [{ label: t("mobile.admin.suspension_reason"), value: checklist.suspension_reason }] : []),
        ]}
      />
      {decidable ? (
        <SubtleButton
          danger={!suspended}
          label={suspended ? t("mobile.admin.reinstate_paid_sales") : t("mobile.admin.suspend_paid_sales")}
          onPress={ask}
        />
      ) : (
        <Intro>{t("mobile.admin.paid_sales_not_active")}</Intro>
      )}
      <ModerationDialog request={pending} onClose={() => setPending(null)} />
    </View>
  );
}
