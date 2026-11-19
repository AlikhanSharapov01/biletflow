import { useState, type ReactNode } from "react";
import { View } from "react-native";

import type { AdminActivationRow, AdminCampaignRow, AdminSupportCaseRow, AdminSyncConflictRow } from "@/api/types/admin";
import { ListRow, StatusPill, TextButton } from "@/components/ui";
import { t, useLocale } from "@/i18n";
import { dateLabel, priceLabel, statusLabel } from "@/utils/format";

import { categoryLabel, KIND_LABELS } from "@/features/support/utils/supportLabels";

import { campaignDiscount, opsTone, shortId } from "../utils/ops";
import { CampaignDetail, SupportCaseDetail, SyncConflictDetail } from "./InspectDetails";
import { RowTitle } from "./RowTitle";

// One open detail at a time per list, toggled from its row.
function useOpenRow() {
  const [open, setOpen] = useState("");
  return { open, toggle: (id: string) => setOpen((current) => (current === id ? "" : id)) };
}

function DetailToggle({ open, onPress, children }: { open: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <>
      <TextButton label={open ? t("common.close") : t("common.details")} onPress={onPress} />
      {open ? children : null}
    </>
  );
}

export function SupportCaseRows({ items }: { items: AdminSupportCaseRow[] }) {
  useLocale();
  const rows = useOpenRow();
  return (
    <View>
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="S"
          title={
            <RowTitle text={row.subject}>
              <StatusPill tone={opsTone(row.status)} label={statusLabel(row.status)} />
              {row.escalated_at ? <StatusPill tone="pending" label={t("support.escalated")} /> : null}
            </RowTitle>
          }
          meta={`${categoryLabel(row.category)} · ${KIND_LABELS[row.kind] ?? row.kind} · ${dateLabel(row.updated_at)}`}
          note={t("mobile.admin.case_ids", { p0: shortId(row.id), p1: shortId(row.event_id), p2: shortId(row.order_id) })}
        >
          <DetailToggle open={rows.open === row.id} onPress={() => rows.toggle(row.id)}>
            <SupportCaseDetail caseId={row.id} />
          </DetailToggle>
        </ListRow>
      ))}
    </View>
  );
}

// The activation record has no separate detail: the per-event checklist
// lives under Events > Paid sales.
export function ActivationRows({ items }: { items: AdminActivationRow[] }) {
  useLocale();
  return (
    <View>
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="₸"
          title={
            <RowTitle text={row.event_title}>
              <StatusPill tone={opsTone(row.status)} label={statusLabel(row.status)} />
            </RowTitle>
          }
          meta={`${priceLabel(row.activation_fee_minor)} · ${row.activated_at ? dateLabel(row.activated_at) : t("mobile.admin.not_activated")}`}
          note={row.suspension_reason ? `${t("mobile.admin.suspension_reason")}: ${row.suspension_reason}` : t("mobile.admin.event_short", { p0: shortId(row.event_id) })}
        />
      ))}
    </View>
  );
}

export function CampaignRows({ items }: { items: AdminCampaignRow[] }) {
  useLocale();
  const rows = useOpenRow();
  return (
    <View>
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="%"
          title={
            <RowTitle text={row.name}>
              <StatusPill tone={row.is_enabled ? "positive" : "neutral"} label={row.is_enabled ? t("mobile.admin.enabled") : t("common.disabled")} />
            </RowTitle>
          }
          meta={`${campaignDiscount(row)} · ${dateLabel(row.starts_at)} – ${dateLabel(row.ends_at)}`}
          note={t("mobile.admin.campaign_usage", { p0: row.redemptions, p1: row.active_reservations, p2: shortId(row.event_id) })}
        >
          <DetailToggle open={rows.open === row.id} onPress={() => rows.toggle(row.id)}>
            <CampaignDetail campaignId={row.id} />
          </DetailToggle>
        </ListRow>
      ))}
    </View>
  );
}

export function SyncConflictRows({ items }: { items: AdminSyncConflictRow[] }) {
  useLocale();
  const rows = useOpenRow();
  return (
    <View>
      {items.map((row) => (
        <ListRow
          key={row.id}
          icon="!"
          title={
            <RowTitle text={statusLabel(row.reason)}>
              <StatusPill tone={opsTone(row.status)} label={statusLabel(row.status)} />
            </RowTitle>
          }
          meta={`${statusLabel(row.operation_kind)} · ${dateLabel(row.created_at)}`}
          note={t("mobile.admin.conflict_ids", { p0: shortId(row.event_id), p1: shortId(row.ticket_id), p2: shortId(row.device_id) })}
        >
          <DetailToggle open={rows.open === row.id} onPress={() => rows.toggle(row.id)}>
            <SyncConflictDetail conflictId={row.id} />
          </DetailToggle>
        </ListRow>
      ))}
    </View>
  );
}
