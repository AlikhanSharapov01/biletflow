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

// Confirmed contract: backend/CAMPAIGNS_API.md.
export function CampaignsTab({ event }: { event: EventView }) {
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
      notify("Campaign created.");
      setState({ busy: false, message: "" });
      page.reload();
      return true;
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
      return false;
    }
  };

  if (page.loading && !page.data) return <LoadingState message="Loading campaigns…" />;
  if (page.error || !page.data) return <ErrorPanel title="We couldn’t load campaigns." message={page.error ?? ""} onRetry={page.reload} />;
  const { campaigns, types } = page.data;

  return (
    <>
      <Panel>
        <SectionHeading
          title="Promo campaigns"
          subtitle="Discount links and codes for this event. A campaign QR opens the promo link; it never admits anyone."
          trailing={<StatusPill tone="neutral" label={`${campaigns.length} campaigns`} />}
        />
        {campaigns.length === 0 ? (
          <EmptyState message="No campaigns yet. Create one below." />
        ) : (
          campaigns.map((campaign) => <CampaignRow key={campaign.id} eventId={event.id} campaign={campaign} types={types} onChanged={page.reload} />)
        )}
      </Panel>
      <Panel>
        <SectionHeading title="Create a campaign" subtitle="Percent or fixed KZT discount, a time window, an optional redemption limit and code." />
        <CampaignForm
          types={types}
          submitLabel="Create campaign"
          busy={state.busy}
          message={state.message}
          onSubmit={create}
          onInvalid={(error) => setState({ busy: false, message: error })}
        />
      </Panel>
    </>
  );
}
