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
  { id: "mine" as const, label: "My cases" },
  { id: "queue" as const, label: "Queue" },
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
        eyebrow="Help when you need it"
        title="Support."
        subtitle="Questions about an event, a ticket or your account."
        actions={
          <ButtonLink variant="primary" to="/support/new">
            New case
          </ButtonLink>
        }
      />
      <Tabs label="Case lists" idPrefix="support" items={VIEWS} value={view} onChange={(id) => update({ view: id, offset: "0" })} />
      <TabPanel idPrefix="support" active={view}>
        <Panel>
          <CaseFilters status={status} category={category} onChange={(filters) => update({ ...filters, offset: "0" })} />
          {cases.loading ? <Loading label="Loading cases…" /> : null}
          {cases.error ? <ErrorPanel title="We couldn’t load support cases." message={cases.error} onRetry={cases.reload} /> : null}
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
  if (page === "forbidden" || page.items.length === 0) {
    return (
      <EmptyState>
        {view === "queue"
          ? "No cases to work on. The queue lists cases from events where you are support staff, and escalated cases for platform admins."
          : "No support cases yet. Open one whenever you need help."}
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
          <Button size="sm" disabled={!hasPrevious} onClick={() => onPage(Math.max(0, page.offset - page.limit))}>
            Previous
          </Button>
          <span className="field-note">
            {page.offset + 1}–{page.offset + page.items.length} of {page.total}
          </span>
          <Button size="sm" disabled={!hasNext} onClick={() => onPage(page.offset + page.limit)}>
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}
