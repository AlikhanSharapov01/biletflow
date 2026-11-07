import { useCallback, useEffect, useMemo, useState } from "react";

import { listCategories, listEvents, listVenues } from "@/api/catalog";
import { SessionExpiredError } from "@/api/session";
import type { CatalogEvent, Category, EventFilters, Venue } from "@/api/types/catalog";

type Catalog = {
  events: CatalogEvent[];
  categories: Category[];
  venues: Venue[];
};

// Loads published events for the applied filters, plus the categories and
// venues needed to label them; reloads whenever `filters` changes identity.
export function useDiscoverCatalog(filters: EventFilters) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (active: EventFilters) => {
    setError(null);
    try {
      const [events, categories, venues] = await Promise.all([
        listEvents(active),
        listCategories(),
        listVenues(),
      ]);
      setCatalog({ events, categories, venues });
    } catch (err) {
      // Session couldn't be renewed: AuthContext is already redirecting to login.
      if (err instanceof SessionExpiredError) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filters).finally(() => setLoading(false));
  }, [filters, load]);

  async function refresh() {
    setRefreshing(true);
    await load(filters);
    setRefreshing(false);
  }

  const lookup = useMemo(
    () => ({
      venue: new Map(catalog?.venues.map((venue) => [venue.id, venue])),
      category: new Map(catalog?.categories.map((category) => [category.id, category])),
    }),
    [catalog]
  );

  return { catalog, error, loading, refreshing, refresh, lookup };
}
