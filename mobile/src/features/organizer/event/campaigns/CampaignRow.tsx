import { useState } from "react";
import { View } from "react-native";

import { disableCampaign, updateCampaign } from "@/api/campaigns";
import { describeError } from "@/api/errors";
import type { TicketType } from "@/api/types";
import type { Campaign, CampaignInput } from "@/api/types/campaigns";
import { confirmAction, ListRow, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { dateLabel, statusLabel } from "@/utils/format";

import { formStyles } from "../../components/formStyles";
import { discountLabel, usageLabel } from "../../utils/campaignForm";
import { CampaignForm } from "./CampaignForm";
import { CampaignQr } from "./CampaignQr";
import { CampaignReportView } from "./CampaignReportView";
import { t, useLocale } from "@/i18n";

type Section = "" | "edit" | "qr" | "report";

interface CampaignRowProps {
  eventId: string;
  campaign: Campaign;
  types: TicketType[];
  onChanged: () => void;
}

export function CampaignRow({ eventId, campaign, types, onChanged }: CampaignRowProps) {
  useLocale();
  const { notify } = useToast();
  const [section, setSection] = useState<Section>("");
  const [state, setState] = useState({ busy: false, message: "" });
  const disabled = campaign.status === "disabled";
  const toggle = (next: Section) => setSection(section === next ? "" : next);
  const eligible = campaign.eligible_ticket_type_ids.length
    ? campaign.eligible_ticket_type_ids.map((id) => types.find((type) => type.id === id)?.name ?? t("organizer.removed_type")).join(", ")
    : t("organizer.all_types");

  const save = async (input: CampaignInput) => {
    setState({ busy: true, message: "" });
    try {
      await updateCampaign(eventId, campaign.id, input);
      notify(t("organizer.campaign_saved"));
      setState({ busy: false, message: "" });
      setSection("");
      onChanged();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  const disable = async () => {
    const confirmed = await confirmAction({
      title: t("mobile.org.disable_campaign", { p0: campaign.name }),
      message: t("mobile.org.disable_campaign_message"),
      confirmLabel: t("common.disable"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await disableCampaign(eventId, campaign.id);
      notify(t("organizer.campaign_disabled"));
      onChanged();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <ListRow
      icon="%"
      title={campaign.name}
      meta={t("mobile.org.campaign_row_meta", { p0: discountLabel(campaign), p1: usageLabel(campaign.redemptions_used, campaign.max_redemptions), p2: campaign.code })}
      note={`${dateLabel(campaign.starts_at)} – ${dateLabel(campaign.ends_at)} · ${eligible}`}
      trailing={<StatusPill tone={campaign.status === "active" ? "positive" : disabled ? "blocked" : "neutral"} label={statusLabel(campaign.status)} />}
    >
      <View style={formStyles.stack}>
        <View style={formStyles.actions}>
          <SubtleButton label="QR" onPress={() => toggle("qr")} />
          <SubtleButton label={t("common.report")} onPress={() => toggle("report")} />
          {!disabled ? <SubtleButton label={section === "edit" ? t("common.close") : t("common.edit")} onPress={() => toggle("edit")} /> : null}
          {!disabled ? <SubtleButton danger label={t("common.disable")} onPress={() => void disable()} /> : null}
        </View>
        {section === "qr" ? <CampaignQr eventId={eventId} campaign={campaign} /> : null}
        {section === "report" ? <CampaignReportView eventId={eventId} campaignId={campaign.id} /> : null}
        {section === "edit" ? (
          <View style={formStyles.inline}>
            <CampaignForm
              types={types}
              initial={campaign}
              submitLabel={t("organizer.save_campaign")}
              busy={state.busy}
              message={state.message}
              onSubmit={save}
              onInvalid={(error) => setState({ busy: false, message: error })}
              onCancel={() => setSection("")}
            />
          </View>
        ) : null}
      </View>
    </ListRow>
  );
}
