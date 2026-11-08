import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { ApiError } from "@/api/errors";
import { listCases } from "@/api/support";
import type { SupportCategory, SupportListView, SupportStatus } from "@/api/types/support";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, Panel, PrimaryButton, SegmentedTabs } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { CaseFilters } from "./components/CaseFilters";
import { CaseList } from "./components/CaseList";

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

export function SupportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<SupportListView>(params.view === "queue" ? "queue" : "mine");
  const [status, setStatus] = useState<SupportStatus | "">("");
  const [category, setCategory] = useState<SupportCategory | "">("");
  const [offset, setOffset] = useState(0);
  const cases = useRequest(() => loadCases(view, status, category, offset), [view, status, category, offset]);

  return (
    <ScrollScreen onRefresh={cases.reload}>
      <PageHeading
        eyebrow="Help when you need it"
        title="Support."
        subtitle="Questions about an event, a ticket or your account."
        actions={<PrimaryButton label="New case" onPress={() => router.push("/support/new")} />}
      />
      <SegmentedTabs
        items={VIEWS}
        value={view}
        fill
        onChange={(next) => {
          setView(next);
          setOffset(0);
        }}
      />
      <Panel>
        <CaseFilters
          status={status}
          category={category}
          onChange={(filters) => {
            setStatus(filters.status);
            setCategory(filters.category);
            setOffset(0);
          }}
        />
        {cases.loading ? <LoadingState message="Loading cases…" /> : null}
        {cases.error ? <ErrorPanel title="We couldn’t load support cases." message={cases.error} onRetry={cases.reload} /> : null}
        {!cases.loading && !cases.error && cases.data ? (
          <CaseList
            page={cases.data}
            view={view}
            onPage={setOffset}
            onOpen={(caseId) => router.push({ pathname: "/support/cases/[caseId]", params: { caseId } })}
          />
        ) : null}
      </Panel>
    </ScrollScreen>
  );
}
