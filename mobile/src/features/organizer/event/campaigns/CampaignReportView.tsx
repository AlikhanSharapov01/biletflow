import { View } from "react-native";

import { getCampaignReport } from "@/api/campaigns";
import { ErrorPanel, FactList, LoadingState } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, priceLabel } from "@/utils/format";

import { formStyles } from "../../components/formStyles";

export function CampaignReportView({ eventId, campaignId }: { eventId: string; campaignId: string }) {
  const report = useRequest(() => getCampaignReport(eventId, campaignId), [eventId, campaignId]);
  if (report.loading) return <LoadingState message="Loading report…" />;
  if (report.error || !report.data) return <ErrorPanel title="We couldn’t load the report." message={report.error ?? ""} onRetry={report.reload} />;
  const data = report.data;
  return (
    <View style={formStyles.inline}>
      <FactList
        items={[
          { label: "Redemptions", value: data.redemptions },
          { label: "Orders · tickets", value: `${data.orders} · ${data.tickets}` },
          { label: "Tickets refunded · kept", value: `${data.tickets_refunded} · ${data.tickets_kept}` },
          { label: "Gross before discount", value: priceLabel(data.gross_minor) },
          { label: "Discount given", value: priceLabel(data.discount_minor) },
          { label: "Collected", value: priceLabel(data.collected_minor) },
          { label: "Refunds", value: priceLabel(data.refunds_minor) },
          { label: "Processing fees retained", value: priceLabel(data.fees_minor) },
          { label: "Net", value: priceLabel(data.net_minor) },
          { label: "Generated", value: dateLabel(data.generated_at) },
        ]}
      />
    </View>
  );
}
