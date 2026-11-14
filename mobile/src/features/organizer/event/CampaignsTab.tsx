import { useState } from "react";

import { createCampaign, listCampaigns } from "@/api/campaigns";
import { listTicketTypes } from "@/api/catalog";
import { describeError } from "@/api/errors";
import type { EventView } from "@/api/types";
import type { CampaignInput } from "@/api/types/campaigns";
import { EmptyState, ErrorPanel, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";

import { SectionHeading } from "../components/SectionHeading";
import { CampaignForm } from "./campaigns/CampaignForm";
import { CampaignRow } from "./campaigns/CampaignRow";
import { t, useLocale } from "@/i18n";

// Confirmed contract: backend/CAMPAIGNS_API.md.
export function CampaignsTab({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState({ busy: false, message: "" });
  const page = useRequest(async () => {
    const [campaigns, types] = await Promise.all([listCampaigns(event.id), listTicketTypes(event.id)]);
    return { campaigns, types };
  }, [event.id]);

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

  if (page.loading && !page.data) return <LoadingState message={t("org.campaign_loading")} />;
  if (page.error || !page.data) return <ErrorPanel title={t("org.campaign_error")} message={page.error ?? ""} onRetry={page.reload} />;
  const { campaigns, types } = page.data;

  return (
    <>
      <Panel>
        <SectionHeading
          title={t("org.campaign_heading")}
          subtitle={t("org.campaign_hint")}
          trailing={<StatusPill tone="neutral" label={t("mobile.org.campaign_count", { p0: campaigns.length })} />}
        />
        {campaigns.length === 0 ? (
          <EmptyState message={t("org.no_campaigns")} />
        ) : (
          campaigns.map((campaign) => <CampaignRow key={campaign.id} eventId={event.id} campaign={campaign} types={types} onChanged={page.reload} />)
        )}
      </Panel>
      <Panel>
        <SectionHeading title={t("org.create_campaign_heading")} subtitle={t("org.campaign_form_hint")} />
        <CampaignForm
          types={types}
          submitLabel={t("org.create_campaign")}
          busy={state.busy}
          message={state.message}
          onSubmit={create}
          onInvalid={(error) => setState({ busy: false, message: error })}
        />
      </Panel>
    </>
  );
}
