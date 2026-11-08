import type { ReactNode } from "react";
import { View } from "react-native";

import type { Page } from "@/api/types/admin";
import { EmptyState, ErrorPanel, LoadingState } from "@/components/ui";
import { Pagination } from "@/features/admin/components/Pagination";

// Loading, error, empty and paging around one admin result list.
export function SearchResults<T>({
  noun,
  data,
  loading,
  error,
  reload,
  offset,
  onPage,
  children,
}: {
  noun: string;
  data: Page<T> | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  offset: number;
  onPage: (offset: number) => void;
  children: (items: T[]) => ReactNode;
}) {
  if (loading) return <LoadingState message={`Searching ${noun}…`} />;
  if (error) return <ErrorPanel title={`We couldn’t load ${noun}.`} message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.items.length === 0) return <EmptyState message={`No ${noun} match this search.`} />;
  return (
    <View>
      {children(data.items)}
      <Pagination total={data.total} limit={data.limit} offset={offset} shown={data.items.length} onChange={onPage} />
    </View>
  );
}
