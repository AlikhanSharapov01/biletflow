import { useState } from "react";

import type { AdminSearch, Page } from "@/api/types/admin";
import { useRequest } from "@/hooks/useRequest";

export interface SearchQuery {
  q: string;
  status: string;
}

// Search text, status filter and offset for one admin list.
export function useAdminSearch<T>(search: (params: AdminSearch) => Promise<Page<T>>, limit = 25) {
  const [query, setQuery] = useState<SearchQuery>({ q: "", status: "" });
  const [offset, setOffset] = useState(0);
  const result = useRequest(
    () => search({ q: query.q, status: query.status || undefined, limit, offset }),
    [query, offset]
  );

  const apply = (next: SearchQuery) => {
    setQuery(next);
    setOffset(0);
  };

  return { ...result, query, apply, offset, setOffset, limit };
}
