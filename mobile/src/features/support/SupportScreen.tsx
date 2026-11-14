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
import { t, useLocale } from "@/i18n";

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

export function SupportScreen() {
  useLocale();
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
        eyebrow={t("support.eyebrow")}
        title={t("support.title")}
        subtitle={t("support.subtitle")}
        actions={<PrimaryButton label={t("support.new_case")} onPress={() => router.push("/support/new")} />}
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
        {cases.loading ? <LoadingState message={t("support.loading_cases")} /> : null}
        {cases.error ? <ErrorPanel title={t("support.load_error")} message={cases.error} onRetry={cases.reload} /> : null}
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
