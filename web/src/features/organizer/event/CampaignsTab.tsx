import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { createCampaign, listCampaigns } from "../../../api/campaigns";
import { listTicketTypes } from "../../../api/catalog";
import { describeError } from "../../../api/errors";
import type { EventView } from "../../../api/types";
import type { CampaignInput } from "../../../api/types/campaigns";
import { EmptyState, ErrorPanel, Loading, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { CampaignForm } from "./campaigns/CampaignForm";
import { CampaignRow } from "./campaigns/CampaignRow";

// Confirmed contract: backend/CAMPAIGNS_API.md.
export function CampaignsTab({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState({ busy: false, message: "" });
  const page = useRequest(
    async () => {
      const [campaigns, types] = await Promise.all([listCampaigns(event.id), listTicketTypes(event.id)]);
      return { campaigns, types };
    },
    [event.id],
  );

  const create = async (input: CampaignInput) => {
    setState({ busy: true, message: "" });
    try {
      await createCampaign(event.id, input);
      notify(t("org.campaign_created"));
      setState({ busy: false, message: "" });
      page.reload();
      return true;
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
      return false;
    }
  };

  if (page.loading && !page.data) return <Loading label={t("org.campaign_loading")} />;
  if (page.error || !page.data) return <ErrorPanel title={t("org.campaign_error")} message={page.error ?? ""} onRetry={page.reload} />;
  const { campaigns, types } = page.data;

  return (
    <div className="stack">
      <Panel>
        <PanelHeading
          title={t("org.campaign_heading")}
          subtitle={t("org.campaign_hint")}
          trailing={<StatusPill tone="neutral">{campaigns.length}{" "}{t("word.campaigns")}</StatusPill>}
        />
        {campaigns.length === 0 ? (
          <EmptyState>{t("org.no_campaigns")}</EmptyState>
        ) : (
          <div className="list">
            {campaigns.map((campaign) => (
              <CampaignRow key={campaign.id} eventId={event.id} campaign={campaign} types={types} onChanged={page.reload} />
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <PanelHeading title={t("org.create_campaign_heading")} subtitle={t("org.campaign_form_hint")} />
        <CampaignForm
          types={types}
          submitLabel={t("org.create_campaign")}
          busy={state.busy}
          message={state.message}
          onSubmit={create}
          onInvalid={(error) => setState({ busy: false, message: error })}
        />
      </Panel>
    </div>
  );
}
