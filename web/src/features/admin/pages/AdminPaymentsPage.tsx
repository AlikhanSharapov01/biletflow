import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { downloadExport, searchFailedPayments, searchPayments, searchRefunds } from "../../../api/admin";
import { describeError } from "../../../api/errors";
import type { AdminPaymentRow, AdminRefundRow, CommerceFilters, CommerceKind, Page } from "../../../api/types/admin";
import { Button, Panel, PanelHeading, Tabs, useToast, type TabItem } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { CommerceFilterForm } from "../components/CommerceFilterForm";
import { PaymentRows, RefundRows } from "../components/CommerceRows";
import { SearchResults } from "../components/SearchResults";

const LIMIT = 25;

const KINDS: Array<TabItem<CommerceKind>> = [
  { id: "payments", get label() { return t("admin.payments"); } },
  { id: "failed-payments", get label() { return t("admin.failed_payments"); } },
  { id: "refunds", get label() { return t("event.refunds"); } },
];

type Result = { kind: "refunds"; page: Page<AdminRefundRow> } | { kind: "payments" | "failed-payments"; page: Page<AdminPaymentRow> };

async function load(kind: CommerceKind, filters: CommerceFilters, offset: number): Promise<Result> {
  if (kind === "refunds") return { kind, page: await searchRefunds(filters, LIMIT, offset) };
  return { kind, page: await (kind === "payments" ? searchPayments : searchFailedPayments)(filters, LIMIT, offset) };
}

// Read-only payment, payment-failure and refund monitoring (SRS 4.12). No
// admin action rewrites money; records are simulation or sandbox only.
export function AdminPaymentsPage() {
  useLocale();
  const { notify } = useToast();
  const [kind, setKind] = useState<CommerceKind>("payments");
  const [filters, setFilters] = useState<CommerceFilters>({});
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const result = useRequest(() => load(kind, filters, offset), [kind, filters, offset]);
  const current = result.data && result.data.kind === kind ? result.data : null;
  const noun = KINDS.find((item) => item.id === kind)?.label ?? kind;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadExport(kind, filters);
      notify(t("admin.csv_downloaded", { p0: kind }));
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Panel>
      <PanelHeading
        title={t("admin.payments_title")}
        subtitle={t("admin.payments_hint")}
        trailing={<Button size="sm" disabled={exporting} onClick={() => void exportCsv()}>{t("admin.export_csv")}</Button>}
      />
      <Tabs
        label={t("admin.payments_title")}
        items={KINDS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setFilters({});
          setOffset(0);
        }}
      />
      <CommerceFilterForm
        key={kind}
        kind={kind}
        onApply={(next) => {
          setFilters(next);
          setOffset(0);
        }}
      />
      <SearchResults
        noun={noun}
        data={(current?.page ?? null) as Page<unknown> | null}
        loading={result.loading}
        error={result.error}
        reload={result.reload}
        offset={offset}
        onPage={setOffset}
      >
        {() =>
          current?.kind === "refunds" ? <RefundRows items={current.page.items} /> : current ? <PaymentRows items={current.page.items} /> : null
        }
      </SearchResults>
    </Panel>
  );
}
