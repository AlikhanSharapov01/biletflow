import { t, useLocale } from "../../../i18n";
import type { ReactNode } from "react";
import type { Page } from "../../../api/types/admin";
import { EmptyState, ErrorPanel, Loading } from "../../../components/ui";
import { Pagination } from "../../organizer/components/Pagination";

interface SearchResultsProps<T> {
  noun: string;
  data: Page<T> | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  offset: number;
  onPage: (offset: number) => void;
  children: (items: T[]) => ReactNode;
}

// Loading, error, empty and paging around one admin result list.
export function SearchResults<T>({ noun, data, loading, error, reload, offset, onPage, children }: SearchResultsProps<T>) {
  useLocale();
  if (loading) return <Loading label={t("admin.searching", { p0: noun })} />;
  if (error) return <ErrorPanel title={t("admin.load_error", { p0: noun })} message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.items.length === 0) return <EmptyState>{t("admin.no_search_results", { type: noun })}</EmptyState>;
  return (
    <>
      {children(data.items)}
      <Pagination total={data.total} limit={data.limit} offset={offset} shown={data.items.length} onChange={onPage} label={t("admin.pages", { p0: noun })} />
    </>
  );
}
