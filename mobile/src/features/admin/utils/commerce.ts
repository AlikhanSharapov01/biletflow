import type { CommerceFilters, CommerceKind } from "@/api/types/admin";
import { t } from "@/i18n";
import type { StatusTone } from "@/utils/status";

import { readLocalInput } from "../../organizer/utils/dateInput";

// Statuses each list accepts (ADMIN_API.md); failed-payments is fixed to failed.
export const COMMERCE_STATUSES: Record<CommerceKind, string[]> = {
  payments: ["created", "pending", "failed", "succeeded"],
  "failed-payments": [],
  refunds: ["requested", "pending", "failed", "succeeded"],
};

export interface CommerceDraft {
  status: string;
  purpose: string;
  environment: string;
  event_id: string;
  order_id: string;
  // "YYYY-MM-DD HH:mm" as typed on the phone.
  from: string;
  to: string;
}

export const EMPTY_COMMERCE_DRAFT: CommerceDraft = { status: "", purpose: "", environment: "", event_id: "", order_id: "", from: "", to: "" };

export type CommerceFilterResult = { ok: true; filters: CommerceFilters } | { ok: false; error: string };

// Turns the form into exact server filters; empty fields are left out.
export function toCommerceFilters(draft: CommerceDraft): CommerceFilterResult {
  const from = draft.from.trim() ? readLocalInput(draft.from) : null;
  const to = draft.to.trim() ? readLocalInput(draft.to) : null;
  if ((draft.from.trim() && !from) || (draft.to.trim() && !to)) return { ok: false, error: t("mobile.ui.write_dates") };
  if (from && to && to <= from) return { ok: false, error: t("org.invalid_range") };
  const filters: CommerceFilters = {};
  if (draft.status) filters.status = draft.status;
  if (draft.purpose) filters.purpose = draft.purpose as CommerceFilters["purpose"];
  if (draft.environment) filters.environment = draft.environment as CommerceFilters["environment"];
  if (draft.event_id.trim()) filters.event_id = draft.event_id.trim();
  if (draft.order_id.trim()) filters.order_id = draft.order_id.trim();
  if (from) filters.from = from;
  if (to) filters.to = to;
  return { ok: true, filters };
}

export function commerceTone(status: string): StatusTone {
  if (status === "succeeded") return "positive";
  if (status === "failed") return "blocked";
  return "pending";
}

export function purposeLabel(purpose: string): string {
  if (purpose === "ticket_order") return t("mobile.admin.purpose_ticket_order");
  if (purpose === "activation") return t("mobile.admin.purpose_activation");
  return purpose;
}

// Demonstration records are always labelled as such (SRS 4.6).
export function environmentLabel(simulated: boolean, environment: string): string {
  if (simulated) return t("mobile.admin.env_simulation");
  return environment === "sandbox" ? t("mobile.admin.env_sandbox") : environment;
}
