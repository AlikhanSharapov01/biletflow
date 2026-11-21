import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent, type ReactNode } from "react";
import { inspect } from "../../../api/admin";
import type { InspectionFilters, InspectionKind, InspectionRows } from "../../../api/types/admin";
import { SUPPORT_STATUSES } from "../../../api/types/support";
import { Button, Panel, PanelHeading, SelectField, StatusPill, TextField } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, moneyLabel, statusLabel } from "../../../utils/format";
import { InspectionDetail } from "../components/InspectionDetail";
import { SearchResults } from "../components/SearchResults";

const LIMIT = 25;

interface Column<T> {
  label: string;
  cell: (row: T) => ReactNode;
}

interface KindConfig<K extends InspectionKind> {
  label: string;
  noun: string;
  // Support cases and campaigns take free text; the others filter by event.
  text: "q" | "event_id";
  statuses: Array<{ value: string; label: string }>;
  columns: Array<Column<InspectionRows[K]>>;
}

const shortId = (value: string | null) => (value ? <code className="id-code">{value.slice(0, 8)}</code> : <span className="cell-note">{t("admin.none")}</span>);
const options = (values: readonly string[]) => values.map((value) => ({ value, label: statusLabel(value) }));

function campaignDiscount(row: InspectionRows["campaigns"]): string {
  if (row.percentage_bps !== null) return `${row.percentage_bps / 100}%`;
  if (row.fixed_minor !== null) return moneyLabel(row.fixed_minor, "KZT");
  return statusLabel(row.discount_kind);
}

const KINDS: { [K in InspectionKind]: KindConfig<K> } = {
  "support-cases": {
    get label() { return t("admin.inspect_support_cases"); },
    get noun() { return t("admin.inspect_support_cases_noun"); },
    text: "q",
    get statuses() { return options(SUPPORT_STATUSES); },
    get columns() {
      return [
        { label: t("admin.inspect_subject"), cell: (row) => <>{row.subject}<small className="cell-note">{statusLabel(row.kind)} · {statusLabel(row.category)}</small></> },
        { label: t("common.status"), cell: (row) => <StatusPill tone={row.status === "resolved" ? "neutral" : "pending"}>{statusLabel(row.status)}</StatusPill> },
        { label: t("admin.inspect_escalated"), cell: (row) => (row.escalated_at ? dateLabel(row.escalated_at) : t("common.no")) },
        { label: t("admin.inspect_last_activity"), cell: (row) => dateLabel(row.updated_at) },
      ] satisfies Array<Column<InspectionRows["support-cases"]>>;
    },
  },
  activations: {
    get label() { return t("admin.inspect_activations"); },
    get noun() { return t("admin.inspect_activations_noun"); },
    text: "event_id",
    get statuses() { return options(["incomplete", "pending", "active", "failed", "suspended"]); },
    get columns() {
      return [
        { label: t("common.event"), cell: (row) => <>{row.event_title}<small className="cell-note">{shortId(row.event_id)}</small></> },
        { label: t("common.status"), cell: (row) => <StatusPill tone={row.status === "active" ? "positive" : row.status === "suspended" || row.status === "failed" ? "blocked" : "pending"}>{statusLabel(row.status)}</StatusPill> },
        { label: t("org.activation_charges"), cell: (row) => moneyLabel(row.activation_fee_minor, row.currency) },
        { label: t("admin.activated_at"), cell: (row) => dateLabel(row.activated_at) },
        { label: t("admin.suspension_reason"), cell: (row) => row.suspension_reason ?? t("admin.none") },
      ] satisfies Array<Column<InspectionRows["activations"]>>;
    },
  },
  campaigns: {
    get label() { return t("admin.inspect_campaigns"); },
    get noun() { return t("admin.inspect_campaigns_noun"); },
    text: "q",
    get statuses() { return [{ value: "true", label: t("admin.inspect_enabled") }, { value: "false", label: t("admin.inspect_disabled") }]; },
    get columns() {
      return [
        { label: t("admin.inspect_name"), cell: (row) => <>{row.name}<small className="cell-note">{shortId(row.event_id)}</small></> },
        { label: t("admin.inspect_discount"), cell: campaignDiscount },
        { label: t("admin.inspect_redemptions"), cell: (row) => `${row.redemptions} · ${row.active_reservations}` },
        { label: t("common.status"), cell: (row) => <StatusPill tone={row.is_enabled ? "positive" : "neutral"}>{row.is_enabled ? t("admin.inspect_enabled") : t("admin.inspect_disabled")}</StatusPill> },
      ] satisfies Array<Column<InspectionRows["campaigns"]>>;
    },
  },
  "sync-conflicts": {
    get label() { return t("admin.inspect_conflicts"); },
    get noun() { return t("admin.inspect_conflicts_noun"); },
    text: "event_id",
    get statuses() { return options(["open", "resolved"]); },
    get columns() {
      return [
        { label: t("admin.inspect_operation"), cell: (row) => <>{statusLabel(row.operation_kind)}<small className="cell-note">{statusLabel(row.reason)}</small></> },
        { label: t("common.status"), cell: (row) => <StatusPill tone={row.status === "open" ? "pending" : "neutral"}>{statusLabel(row.status)}</StatusPill> },
        { label: t("admin.inspect_ticket"), cell: (row) => shortId(row.ticket_id) },
        { label: t("admin.inspect_device"), cell: (row) => shortId(row.device_id) },
        { label: t("admin.created"), cell: (row) => dateLabel(row.created_at) },
      ] satisfies Array<Column<InspectionRows["sync-conflicts"]>>;
    },
  },
};

const KIND_ORDER: InspectionKind[] = ["support-cases", "activations", "campaigns", "sync-conflicts"];

function toFilters(kind: InspectionKind, text: string, status: string): InspectionFilters {
  const config = KINDS[kind];
  const filters: InspectionFilters = config.text === "q" ? { q: text } : { event_id: text };
  if (kind === "campaigns") return { ...filters, enabled: status === "" ? undefined : status === "true" };
  return { ...filters, status: status || undefined };
}

// Read-only search across support cases, paid-sales activations, campaigns and
// offline sync conflicts, with a detail view per record (ADMIN_API.md).
export function AdminInspectPage() {
  useLocale();
  const [kind, setKind] = useState<InspectionKind>("support-cases");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState({ kind: "support-cases" as InspectionKind, filters: {} as InspectionFilters });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<{ kind: InspectionKind; id: string; title: string } | null>(null);
  // The rows carry their kind, so columns never render against another kind's
  // rows during the render before a new search starts loading.
  const result = useRequest(async () => ({ kind: applied.kind, page: await inspect(applied.kind, applied.filters, LIMIT, offset) }), [applied, offset]);
  const shownKind = result.data?.kind ?? applied.kind;
  const config = KINDS[shownKind] as KindConfig<InspectionKind>;
  const formConfig = KINDS[kind];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied({ kind, filters: toFilters(kind, text, status) });
    setOffset(0);
    setSelected(null);
  };

  return (
    <div className="stack">
      <Panel>
        <PanelHeading title={t("admin.inspect")} subtitle={t("admin.inspect_hint")} />
        <form className="filter-bar" role="search" aria-label={t("admin.inspect")} onSubmit={submit}>
          <SelectField
            label={t("admin.inspect_kind")}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as InspectionKind);
              setStatus("");
            }}
          >
            {KIND_ORDER.map((value) => (
              <option key={value} value={value}>{KINDS[value].label}</option>
            ))}
          </SelectField>
          <TextField
            label={formConfig.text === "q" ? t("common.search") : t("admin.inspect_event_id")}
            className="filter-wide"
            value={text}
            maxLength={100}
            placeholder={formConfig.text === "q" ? t("admin.inspect_text_placeholder") : t("admin.inspect_event_placeholder")}
            onChange={(event) => setText(event.target.value)}
          />
          <SelectField label={t("common.status")} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{t("admin.any")}</option>
            {formConfig.statuses.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </SelectField>
          <div className="filter-actions">
            <Button variant="primary" size="sm" type="submit">{t("common.search")}</Button>
          </div>
        </form>
        <SearchResults noun={config.noun} {...result} data={result.data?.page ?? null} offset={offset} onPage={setOffset}>
          {(items) => (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {config.columns.map((column) => (
                      <th key={column.label} scope="col">{column.label}</th>
                    ))}
                    <th scope="col">
                      <span className="visually-hidden">{t("admin.inspect_details")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      {config.columns.map((column) => (
                        <td key={column.label}>{column.cell(row)}</td>
                      ))}
                      <td>
                        <Button size="sm" onClick={() => setSelected({ kind: shownKind, id: row.id, title: config.label })}>
                          {t("admin.inspect_view")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SearchResults>
      </Panel>
      {selected ? <InspectionDetail key={selected.id} kind={selected.kind} recordId={selected.id} title={selected.title} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
