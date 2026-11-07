import { useState } from "react";
import { disableCampaign, updateCampaign } from "../../../../api/campaigns";
import { describeError } from "../../../../api/errors";
import type { TicketType } from "../../../../api/types";
import type { Campaign, CampaignInput } from "../../../../api/types/campaigns";
import { Button, ListRow, StatusPill, useToast } from "../../../../components/ui";
import { dateLabel, statusLabel } from "../../../../utils/format";
import { discountLabel, usageLabel } from "../../utils/campaignForm";
import { CampaignForm } from "./CampaignForm";
import { CampaignQr } from "./CampaignQr";
import { CampaignReportView } from "./CampaignReportView";

type Panel = "" | "edit" | "qr" | "report";

interface CampaignRowProps {
  eventId: string;
  campaign: Campaign;
  types: TicketType[];
  onChanged: () => void;
}

export function CampaignRow({ eventId, campaign, types, onChanged }: CampaignRowProps) {
  const { notify } = useToast();
  const [panel, setPanel] = useState<Panel>("");
  const [state, setState] = useState({ busy: false, message: "" });
  const disabled = campaign.status === "disabled";
  const toggle = (next: Panel) => setPanel(panel === next ? "" : next);
  const eligible = campaign.eligible_ticket_type_ids.length
    ? campaign.eligible_ticket_type_ids.map((id) => types.find((type) => type.id === id)?.name ?? "Removed type").join(", ")
    : "All ticket types";

  const save = async (input: CampaignInput) => {
    setState({ busy: true, message: "" });
    try {
      await updateCampaign(eventId, campaign.id, input);
      notify("Campaign saved.");
      setState({ busy: false, message: "" });
      setPanel("");
      onChanged();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  const disable = async () => {
    if (!window.confirm(`Disable “${campaign.name}”? Its link and code stop giving discounts.`)) return;
    try {
      await disableCampaign(eventId, campaign.id);
      notify("Campaign disabled.");
      onChanged();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <ListRow
      icon="%"
      title={
        <>
          {campaign.name}
          <StatusPill tone={campaign.status === "active" ? "positive" : disabled ? "blocked" : "neutral"}>{statusLabel(campaign.status)}</StatusPill>
        </>
      }
      meta={`${discountLabel(campaign)} · ${usageLabel(campaign.redemptions_used, campaign.max_redemptions)}${campaign.code ? ` · code ${campaign.code}` : ""}`}
      note={`${dateLabel(campaign.starts_at)} – ${dateLabel(campaign.ends_at)} · ${eligible}`}
      actions={
        <>
          <Button size="sm" onClick={() => toggle("qr")}>QR</Button>
          <Button size="sm" onClick={() => toggle("report")}>Report</Button>
          {!disabled ? <Button size="sm" onClick={() => toggle("edit")}>{panel === "edit" ? "Close" : "Edit"}</Button> : null}
          {!disabled ? <Button size="sm" variant="danger" onClick={() => void disable()}>Disable</Button> : null}
        </>
      }
    >
      {panel === "qr" ? <CampaignQr eventId={eventId} campaign={campaign} /> : null}
      {panel === "report" ? <CampaignReportView eventId={eventId} campaignId={campaign.id} /> : null}
      {panel === "edit" ? (
        <div className="inline-form">
          <CampaignForm
            types={types}
            initial={campaign}
            submitLabel="Save campaign"
            busy={state.busy}
            message={state.message}
            onSubmit={save}
            onInvalid={(error) => setState({ busy: false, message: error })}
            onCancel={() => setPanel("")}
          />
        </div>
      ) : null}
    </ListRow>
  );
}
