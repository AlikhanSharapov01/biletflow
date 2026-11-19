import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import type { CommerceFilters, CommerceKind } from "../../../api/types/admin";
import { Button, FormMessage, SelectField, TextField } from "../../../components/ui";
import { localInputToIso, statusLabel } from "../../../utils/format";

// Statuses each list accepts (ADMIN_API.md); failed-payments is fixed to failed.
const STATUSES: Record<CommerceKind, string[]> = {
  payments: ["created", "pending", "failed", "succeeded"],
  "failed-payments": [],
  refunds: ["requested", "pending", "failed", "succeeded"],
};

interface Draft {
  status: string;
  purpose: string;
  environment: string;
  event_id: string;
  order_id: string;
  from: string;
  to: string;
}

const EMPTY: Draft = { status: "", purpose: "", environment: "", event_id: "", order_id: "", from: "", to: "" };

// Turns the form into exact server filters; empty fields are left out.
export function toCommerceFilters(draft: Draft): CommerceFilters {
  const filters: CommerceFilters = {};
  if (draft.status) filters.status = draft.status;
  if (draft.purpose) filters.purpose = draft.purpose as CommerceFilters["purpose"];
  if (draft.environment) filters.environment = draft.environment as CommerceFilters["environment"];
  if (draft.event_id.trim()) filters.event_id = draft.event_id.trim();
  if (draft.order_id.trim()) filters.order_id = draft.order_id.trim();
  const from = draft.from ? localInputToIso(draft.from) : null;
  const to = draft.to ? localInputToIso(draft.to) : null;
  if (from) filters.from = from;
  if (to) filters.to = to;
  return filters;
}

interface CommerceFilterFormProps {
  kind: CommerceKind;
  onApply: (filters: CommerceFilters) => void;
}

export function CommerceFilterForm({ kind, onApply }: CommerceFilterFormProps) {
  useLocale();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState("");
  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.from && draft.to && draft.to <= draft.from) {
      setMessage(t("org.invalid_range"));
      return;
    }
    setMessage("");
    onApply(toCommerceFilters(draft));
  };

  return (
    <form className="filter-bar" role="search" aria-label={t("admin.commerce_filters")} onSubmit={submit}>
      {STATUSES[kind].length ? (
        <SelectField label={t("common.status")} value={draft.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">{t("admin.any")}</option>
          {STATUSES[kind].map((status) => (
            <option key={status} value={status}>{statusLabel(status)}</option>
          ))}
        </SelectField>
      ) : null}
      <SelectField label={t("admin.purpose")} value={draft.purpose} onChange={(e) => set("purpose", e.target.value)}>
        <option value="">{t("admin.any")}</option>
        <option value="ticket_order">{t("admin.purpose_ticket_order")}</option>
        <option value="activation">{t("admin.purpose_activation")}</option>
      </SelectField>
      <SelectField label={t("admin.environment")} value={draft.environment} onChange={(e) => set("environment", e.target.value)}>
        <option value="">{t("admin.any")}</option>
        <option value="simulation">{t("admin.env_simulation")}</option>
        <option value="sandbox">{t("org.env_sandbox")}</option>
      </SelectField>
      <TextField label={t("admin.event_id_filter")} value={draft.event_id} onChange={(e) => set("event_id", e.target.value)} maxLength={36} />
      <TextField label={t("admin.order_id")} value={draft.order_id} onChange={(e) => set("order_id", e.target.value)} maxLength={36} />
      <TextField label={t("org.from")} type="datetime-local" value={draft.from} onChange={(e) => set("from", e.target.value)} />
      <TextField label={t("org.to")} type="datetime-local" value={draft.to} onChange={(e) => set("to", e.target.value)} />
      <div className="filter-actions">
        <Button variant="primary" size="sm" type="submit">{t("common.apply")}</Button>
      </div>
      <FormMessage message={message} />
    </form>
  );
}
