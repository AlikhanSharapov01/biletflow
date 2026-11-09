import { t, useLocale } from "../../i18n";
import { useSearchParams } from "react-router";
import { listCases } from "../../api/support";
import { ApiError } from "../../api/errors";
import type { SupportCasePage, SupportCategory, SupportListView, SupportStatus } from "../../api/types/support";
import { Button, ButtonLink, EmptyState, ErrorPanel, Loading, PageHeading, Panel, TabPanel, Tabs } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { CaseFilters } from "./components/CaseFilters";
import { CaseRow } from "./components/CaseRow";

const PAGE_SIZE = 20;
const VIEWS = [
  { id: "mine" as const, get label() { return t("support.my_cases"); } },
  { id: "queue" as const, get label() { return t("support.queue"); } },
];

// The queue is only for organizer support staff and platform admins; anyone
// else gets an empty list (or a 403), which reads as "nothing to work on".
async function loadCases(view: SupportListView, status: SupportStatus | "", category: SupportCategory | "", offset: number) {
  try {
    return await listCases({ view, status, category, limit: PAGE_SIZE, offset });
  } catch (failure) {
    if (view === "queue" && failure instanceof ApiError && failure.status === 403) return "forbidden" as const;
    throw failure;
  }
}

export function SupportPage() {
  useLocale();
  const [params, setParams] = useSearchParams();
  const view: SupportListView = params.get("view") === "queue" ? "queue" : "mine";
  const status = (params.get("status") ?? "") as SupportStatus | "";
  const category = (params.get("category") ?? "") as SupportCategory | "";
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const cases = useRequest(() => loadCases(view, status, category, offset), [view, status, category, offset]);

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value && !(key === "view" && value === "mine") && !(key === "offset" && value === "0")) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  return (
    <>
      <PageHeading
        eyebrow={t("support.eyebrow")}
        title={t("support.title")}
        subtitle={t("support.subtitle")}
        actions={
          <ButtonLink variant="primary" to="/support/new">{t("support.new_case")}{" "}</ButtonLink>
        }
      />
      <Tabs label={t("support.case_lists")} idPrefix="support" items={VIEWS} value={view} onChange={(id) => update({ view: id, offset: "0" })} />
      <TabPanel idPrefix="support" active={view}>
        <Panel>
          <CaseFilters status={status} category={category} onChange={(filters) => update({ ...filters, offset: "0" })} />
          {cases.loading ? <Loading label={t("support.loading_cases")} /> : null}
          {cases.error ? <ErrorPanel title={t("support.load_error")} message={cases.error} onRetry={cases.reload} /> : null}
          {!cases.loading && cases.data ? <CaseList page={cases.data} view={view} onPage={(next) => update({ offset: String(next) })} /> : null}
        </Panel>
      </TabPanel>
    </>
  );
}

interface CaseListProps {
  page: SupportCasePage | "forbidden";
  view: SupportListView;
  onPage: (offset: number) => void;
}

function CaseList({ page, view, onPage }: CaseListProps) {
  useLocale();
  if (page === "forbidden" || page.items.length === 0) {
    return (
      <EmptyState>
        {view === "queue"
          ? t("support.empty_queue")
          : t("support.empty")}
      </EmptyState>
    );
  }
  const hasPrevious = page.offset > 0;
  const hasNext = page.offset + page.items.length < page.total;
  return (
    <>
      <div className="list">
        {page.items.map((item) => (
          <CaseRow key={item.id} supportCase={item} showRequester={view === "queue"} />
        ))}
      </div>
      {hasPrevious || hasNext ? (
        <div className="form-actions support-pager">
          <Button size="sm" disabled={!hasPrevious} onClick={() => onPage(Math.max(0, page.offset - page.limit))}>{t("common.previous")}</Button>
          <span className="field-note">
            {t("org.result_range", { p0: page.offset + 1, p1: page.offset + page.items.length, p2: page.total })}
          </span>
          <Button size="sm" disabled={!hasNext} onClick={() => onPage(page.offset + page.limit)}>{t("common.next")}</Button>
        </div>
      ) : null}
    </>
  );
}
