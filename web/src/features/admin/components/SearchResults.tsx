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
  if (loading) return <Loading label={`Searching ${noun}…`} />;
  if (error) return <ErrorPanel title={`We couldn’t load ${noun}.`} message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.items.length === 0) return <EmptyState>No {noun} match this search.</EmptyState>;
  return (
    <>
      {children(data.items)}
      <Pagination total={data.total} limit={data.limit} offset={offset} shown={data.items.length} onChange={onPage} label={`${noun} pages`} />
    </>
  );
}
