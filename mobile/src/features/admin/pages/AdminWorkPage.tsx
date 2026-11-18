import { useState } from "react";

import { searchDeliveries, searchJobs } from "@/api/admin";
import type { AdminDelivery, AdminJob, OpsFilters, Page, WorkKind } from "@/api/types/admin";
import { Panel, PanelHeading, SegmentedTabs, type TabItem } from "@/components/ui";
import { OpsFilterForm } from "@/features/admin/components/OpsFilterForm";
import { SearchResults } from "@/features/admin/components/SearchResults";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { DeliveryRows, JobRows } from "@/features/admin/components/WorkRows";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";

const LIMIT = 25;

const KINDS: Array<TabItem<WorkKind>> = [
  { id: "jobs", get label() { return t("mobile.admin.jobs"); } },
  { id: "notification-deliveries", get label() { return t("mobile.admin.deliveries"); } },
];

type Result = { kind: "jobs"; page: Page<AdminJob> } | { kind: "notification-deliveries"; page: Page<AdminDelivery> };

async function load(kind: WorkKind, filters: OpsFilters, offset: number): Promise<Result> {
  if (kind === "jobs") return { kind, page: await searchJobs(filters, LIMIT, offset) };
  return { kind, page: await searchDeliveries(filters, LIMIT, offset) };
}

// Background jobs and notification deliveries (BF-15/BF-21). A row the
// worker gave up on can be sent back once with a reason; email stays
// at-least-once, so a retry can deliver a duplicate.
export function AdminWorkPage() {
  useLocale();
  const [kind, setKind] = useState<WorkKind>("jobs");
  const [filters, setFilters] = useState<OpsFilters>({});
  const [offset, setOffset] = useState(0);
  const result = useRequest(() => load(kind, filters, offset), [kind, filters, offset]);
  const current = result.data && result.data.kind === kind ? result.data : null;
  const noun = KINDS.find((item) => item.id === kind)?.label ?? kind;

  return (
    <Panel>
      <PanelHeading title={t("mobile.admin.work_title")} />
      <SectionNote text={t("mobile.admin.work_note")} />
      <SegmentedTabs
        items={KINDS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setFilters({});
          setOffset(0);
        }}
      />
      <OpsFilterForm
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
          current?.kind === "jobs" ? (
            <JobRows items={current.page.items} onChanged={result.reload} />
          ) : current ? (
            <DeliveryRows items={current.page.items} onChanged={result.reload} />
          ) : null
        }
      </SearchResults>
    </Panel>
  );
}
