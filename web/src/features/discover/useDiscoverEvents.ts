import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listEvents } from "../../api/catalog";
import type { EventView } from "../../api/types";
import { useRequest } from "../../hooks/useRequest";
import { DISCOVER_PAGE_SIZE, discoverSearchParams, eventFilters, type DiscoverQuery } from "./discoverQuery";

interface ExtraPages {
  /** The search these pages belong to; pages of another search are ignored. */
  key: string;
  events: EventView[];
  /** Rows received so far, duplicates included: the next offset. */
  rows: number;
  /** Size of the last page received. */
  lastSize: number;
}

export interface DiscoverEvents {
  /** The first page, then every page loaded after it. Empty until the first page arrives. */
  events: EventView[];
  /** True once a first page has arrived, possibly for an earlier search while the next one loads. */
  loaded: boolean;
  /** The first page is loading or reloading. */
  loading: boolean;
  error: string | null;
  /** Fetches the first page again and drops the extra pages. */
  reload: () => void;
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  loadMoreFailed: boolean;
}

/**
 * Events of a Discover search, paged by offset. The first page comes from useRequest
 * (stale responses are ignored and the previous page stays until the next arrives);
 * later pages are tagged with the search they belong to and only appended while it is
 * still the current one.
 */
export function useDiscoverEvents(query: DiscoverQuery, enabled = true): DiscoverEvents {
  const key = discoverSearchParams(query).toString();
  // One clock reading per search, so every page asks for the same date window.
  const now = useMemo(() => new Date(), [key]);
  const first = useRequest(
    () => (enabled ? listEvents(eventFilters(query, now, { limit: DISCOVER_PAGE_SIZE, offset: 0 })) : Promise.resolve([] as EventView[])),
    [key, enabled],
  );

  const [extra, setExtra] = useState<ExtraPages | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const busy = useRef(false);
  // Bumped whenever a search or reload makes in-flight pages obsolete.
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    busy.current = false;
  }, [key]);

  const current = extra?.key === key ? extra : null;
  const firstPage = first.data;
  const events = useMemo(() => (firstPage ? [...firstPage, ...(current?.events ?? [])] : []), [firstPage, current]);
  const lastSize = current ? current.lastSize : (firstPage?.length ?? 0);

  const loadMore = useCallback(() => {
    if (busy.current || !firstPage) return;
    busy.current = true;
    const ticket = generation.current;
    setPending(key);
    setFailed(null);
    const offset = firstPage.length + (current?.rows ?? 0);
    listEvents(eventFilters(query, now, { limit: DISCOVER_PAGE_SIZE, offset }))
      .then((page) => {
        if (ticket !== generation.current) return;
        setExtra((previous) => {
          const base = previous?.key === key ? previous : { key, events: [], rows: 0, lastSize: 0 };
          const known = new Set([...firstPage, ...base.events].map((event) => event.id));
          return {
            key,
            events: [...base.events, ...page.filter((event) => !known.has(event.id))],
            rows: base.rows + page.length,
            lastSize: page.length,
          };
        });
      })
      .catch(() => {
        if (ticket === generation.current) setFailed(key);
      })
      .finally(() => {
        if (ticket !== generation.current) return;
        busy.current = false;
        setPending(null);
      });
  }, [current, firstPage, key, now, query]);

  const reload = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    setExtra(null);
    setPending(null);
    setFailed(null);
    first.reload();
  }, [first.reload]);

  return {
    events,
    loaded: firstPage !== null,
    loading: first.loading,
    error: first.error,
    reload,
    hasMore: !first.loading && firstPage !== null && lastSize >= DISCOVER_PAGE_SIZE,
    loadMore,
    loadingMore: pending === key,
    loadMoreFailed: failed === key,
  };
}
