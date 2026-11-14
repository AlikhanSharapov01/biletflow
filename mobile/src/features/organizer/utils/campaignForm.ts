import type { Campaign, CampaignInput, DiscountKind } from "@/api/types/campaigns";
import { priceLabel, tengeToMinor } from "@/utils/format";
import { readLocalInput, toLocalInput } from "./dateInput";
import { t } from "@/i18n";

// Campaign form model (strings as inputs produce them) and its conversion to
// the API payload.

export interface CampaignFormValues {
  name: string;
  discount_kind: DiscountKind;
  // Percent, or tenge for a fixed discount.
  value: string;
  starts_at: string;
  ends_at: string;
  max_redemptions: string;
  eligible_ticket_type_ids: string[];
  code: string;
}

export function campaignFormValues(initial?: Campaign): CampaignFormValues {
  return {
    name: initial?.name ?? "",
    discount_kind: initial?.discount_kind ?? "percent",
    value: initial ? String(initial.discount_kind === "fixed" ? initial.value / 100 : initial.value) : "10",
    starts_at: toLocalInput(initial?.starts_at),
    ends_at: toLocalInput(initial?.ends_at),
    max_redemptions: initial?.max_redemptions ? String(initial.max_redemptions) : "",
    eligible_ticket_type_ids: initial?.eligible_ticket_type_ids ?? [],
    code: initial?.code ?? "",
  };
}

export type CampaignFormResult = { ok: true; input: CampaignInput } | { ok: false; error: string };

export const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export function toCampaignInput(values: CampaignFormValues): CampaignFormResult {
  const name = values.name.trim();
  if (!name) return { ok: false, error: t("org.validation_campaign_name") };

  let value: number;
  if (values.discount_kind === "percent") {
    value = Number(values.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) return { ok: false, error: t("org.validation_percent") };
  } else {
    value = tengeToMinor(values.value);
    if (value <= 0) return { ok: false, error: t("org.validation_fixed_discount") };
  }

  const starts = readLocalInput(values.starts_at);
  const ends = readLocalInput(values.ends_at);
  if (!starts || !ends) return { ok: false, error: t("org.validation_campaign_window") };
  if (ends <= starts) return { ok: false, error: t("org.validation_campaign_end") };

  let maxRedemptions: number | null = null;
  if (values.max_redemptions.trim()) {
    maxRedemptions = Number(values.max_redemptions);
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) return { ok: false, error: t("org.validation_redemption_limit") };
  }

  const code = values.code.trim().toUpperCase();
  if (code && !CODE_PATTERN.test(code)) return { ok: false, error: t("org.validation_code") };

  return {
    ok: true,
    input: {
      name,
      discount_kind: values.discount_kind,
      value,
      starts_at: starts,
      ends_at: ends,
      max_redemptions: maxRedemptions,
      eligible_ticket_type_ids: values.eligible_ticket_type_ids,
      code: code || null,
    },
  };
}

export function discountLabel(campaign: Pick<Campaign, "discount_kind" | "value">): string {
  return campaign.discount_kind === "percent" ? t("checkout.percent_off", { p0: campaign.value }) : t("checkout.amount_off", { p0: priceLabel(campaign.value) });
}

export function usageLabel(used: number, limit: number | null): string {
  return limit ? t("org.campaign_usage", { p0: used, p1: limit }) : t("org.campaign_usage_unlimited", { p0: used });
}
