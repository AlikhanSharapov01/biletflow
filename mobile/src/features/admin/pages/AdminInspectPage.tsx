import { useState } from "react";

import { searchActivations, searchCampaigns, searchSupportCases, searchSyncConflicts } from "@/api/admin";
import type {
  AdminActivationRow,
  AdminCampaignRow,
  AdminSupportCaseRow,
  AdminSyncConflictRow,
  InspectKind,
  OpsFilters,
  Page,
} from "@/api/types/admin";
import { Panel, PanelHeading, SegmentedTabs, type TabItem } from "@/components/ui";
import { ActivationRows, CampaignRows, SupportCaseRows, SyncConflictRows } from "@/features/admin/components/InspectRows";
import { OpsFilterForm } from "@/features/admin/components/OpsFilterForm";
import { SearchResults } from "@/features/admin/components/SearchResults";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";

const LIMIT = 25;

const KINDS: Array<TabItem<InspectKind>> = [
  { id: "support-cases", get label() { return t("mobile.admin.support_cases"); } },
  { id: "activations", get label() { return t("mobile.admin.activations"); } },
  { id: "campaigns", get label() { return t("organizer.campaigns"); } },
  { id: "sync-conflicts", get label() { return t("mobile.admin.sync_conflicts"); } },
];

type Result =
  | { kind: "support-cases"; page: Page<AdminSupportCaseRow> }
  | { kind: "activations"; page: Page<AdminActivationRow> }
  | { kind: "campaigns"; page: Page<AdminCampaignRow> }
  | { kind: "sync-conflicts"; page: Page<AdminSyncConflictRow> };

async function load(kind: InspectKind, filters: OpsFilters, offset: number): Promise<Result> {
  switch (kind) {
    case "support-cases":
      return { kind, page: await searchSupportCases(filters, LIMIT, offset) };
    case "activations":
      return { kind, page: await searchActivations(filters, LIMIT, offset) };
    case "campaigns":
      return { kind, page: await searchCampaigns(filters, LIMIT, offset) };
    default:
      return { kind, page: await searchSyncConflicts(filters, LIMIT, offset) };
  }
}

function Rows({ result }: { result: Result }) {
  switch (result.kind) {
    case "support-cases":
      return <SupportCaseRows items={result.page.items} />;
    case "activations":
      return <ActivationRows items={result.page.items} />;
    case "campaigns":
      return <CampaignRows items={result.page.items} />;
    default:
      return <SyncConflictRows items={result.page.items} />;
  }
}

// Read-only operational inspection (BF-21): support triage, paid-sales
// activations, campaign activity and offline sync conflicts. Message text and
// attachments are never shown, and looking grants no role.
export function AdminInspectPage() {
  useLocale();
  const [kind, setKind] = useState<InspectKind>("support-cases");
  const [filters, setFilters] = useState<OpsFilters>({});
  const [offset, setOffset] = useState(0);
  const result = useRequest(() => load(kind, filters, offset), [kind, filters, offset]);
  const current = result.data && result.data.kind === kind ? result.data : null;
  const noun = KINDS.find((item) => item.id === kind)?.label ?? kind;

  return (
    <Panel>
      <PanelHeading title={t("mobile.admin.inspect_title")} />
      <SectionNote text={t("mobile.admin.inspect_note")} />
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
        {() => (current ? <Rows result={current} /> : null)}
      </SearchResults>
    </Panel>
  );
}
