import { View } from "react-native";

import { getCampaignReport } from "@/api/campaigns";
import { ErrorPanel, FactList, LoadingState } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, priceLabel } from "@/utils/format";

import { formStyles } from "../../components/formStyles";
import { t, useLocale } from "@/i18n";

export function CampaignReportView({ eventId, campaignId }: { eventId: string; campaignId: string }) {
  useLocale();
  const report = useRequest(() => getCampaignReport(eventId, campaignId), [eventId, campaignId]);
  if (report.loading) return <LoadingState message={t("org.loading_report")} />;
  if (report.error || !report.data) return <ErrorPanel title={t("org.report_error")} message={report.error ?? ""} onRetry={report.reload} />;
  const data = report.data;
  return (
    <View style={formStyles.inline}>
      <FactList
        items={[
          { label: t("org.redemptions"), value: data.redemptions },
          { label: t("org.orders_tickets"), value: `${data.orders} · ${data.tickets}` },
          { label: t("org.tickets_refunded_kept"), value: `${data.tickets_refunded} · ${data.tickets_kept}` },
          { label: t("org.gross_before_discount"), value: priceLabel(data.gross_minor) },
          { label: t("org.discount_given"), value: priceLabel(data.discount_minor) },
          { label: t("org.collected"), value: priceLabel(data.collected_minor) },
          { label: t("event.refunds"), value: priceLabel(data.refunds_minor) },
          { label: t("org.processing_retained"), value: priceLabel(data.fees_minor) },
          { label: t("org.net"), value: priceLabel(data.net_minor) },
          { label: t("org.generated"), value: dateLabel(data.generated_at) },
        ]}
      />
    </View>
  );
}
