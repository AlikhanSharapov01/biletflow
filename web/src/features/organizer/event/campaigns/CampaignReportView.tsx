import { getCampaignReport } from "../../../../api/campaigns";
import { ErrorPanel, FactList, Loading } from "../../../../components/ui";
import { useRequest } from "../../../../hooks/useRequest";
import { dateLabel, priceLabel } from "../../../../utils/format";

export function CampaignReportView({ eventId, campaignId }: { eventId: string; campaignId: string }) {
  const report = useRequest(() => getCampaignReport(eventId, campaignId), [eventId, campaignId]);
  if (report.loading) return <Loading label="Loading report…" />;
  if (report.error || !report.data) return <ErrorPanel title="We couldn’t load the report." message={report.error ?? ""} onRetry={report.reload} />;
  const data = report.data;
  return (
    <div className="inline-form">
      <FactList
        items={[
          { label: "Redemptions", value: data.redemptions },
          { label: "Orders · tickets", value: `${data.orders} · ${data.tickets}` },
          { label: "Gross before discount", value: priceLabel(data.gross_minor) },
          { label: "Discount given", value: priceLabel(data.discount_minor) },
          { label: "Net", value: priceLabel(data.net_minor) },
          { label: "Generated", value: dateLabel(data.generated_at) },
        ]}
      />
    </div>
  );
}
