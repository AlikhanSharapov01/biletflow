import { categoryName, t, useLocale } from "../../i18n";
import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listCategories, listEvents, listVenues } from "../../api/catalog";
import type { Category, EventView, Venue } from "../../api/types";
import { describeError } from "../../api/errors";
import { EmptyState, ErrorPanel, EventCard, Loading, PageHeading } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel } from "../../utils/format";
import { DiscoverFilters } from "./components/DiscoverFilters";
import {
  DISCOVER_PAGE_SIZE,
  discoverSearchParams,
  eventFilters,
  hasActiveFilters,
  parseDiscoverQuery,
  priceRangeError,
  type DiscoverQuery,
} from "./discoverQuery";

interface Lookups {
  categories: Category[];
  venues: Venue[];
}

export function DiscoverPage() {
  useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  // Parsed from the URL, so a hand-edited link is cleaned the same way as a submitted form.
  const query = useMemo(() => parseDiscoverQuery(new URLSearchParams(queryKey)), [queryKey]);

  // Categories and venues are loaded once per visit, not per search or page.
  const lookups = useRequest<Lookups>(async () => {
    const [categories, venues] = await Promise.all([listCategories(), listVenues()]);
    return { categories, venues };
  }, []);

  const cities = useMemo(() => lookups.data?.venues.map((venue) => venue.city) ?? [], [lookups.data]);
  const search = (next: DiscoverQuery) => setSearchParams(discoverSearchParams(next));
  const clear = () => setSearchParams(new URLSearchParams());

  return (
    <>
      <PageHeading
        eyebrow={t("discover.eyebrow")}
        title={t("discover.title")}
        subtitle={t("discover.subtitle")}
      />
      <DiscoverFilters query={query} categories={lookups.data?.categories ?? []} cities={cities} onSearch={search} onClear={clear} />
      {lookups.error ? (
        <ErrorPanel title={t("discover.load_error")} message={lookups.error} onRetry={lookups.reload} />
      ) : priceRangeError(query) ? null : (
        // A new search starts a fresh list: the key drops loaded pages and any request in flight.
        <DiscoverResults key={queryKey} query={query} lookups={lookups.data} onClear={clear} />
      )}
    </>
  );
}

interface DiscoverResultsProps {
  query: DiscoverQuery;
  lookups: Lookups | null;
  onClear: () => void;
}

function DiscoverResults({ query, lookups, onClear }: DiscoverResultsProps) {
  useLocale();
  // One clock reading per search, so every page asks for the same date window.
  const [now] = useState(() => new Date());
  const first = useRequest(() => listEvents(eventFilters(query, now, { limit: DISCOVER_PAGE_SIZE, offset: 0 })), []);
  const [more, setMore] = useState<{ events: EventView[]; lastSize: number | null }>({ events: [], lastSize: null });
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  const events = useMemo(() => [...(first.data ?? []), ...more.events], [first.data, more.events]);
  const lastSize = more.lastSize ?? first.data?.length ?? 0;
  const maps = useMemo(
    () => ({
      venues: new Map(lookups?.venues.map((venue) => [venue.id, venue] as const) ?? []),
      categories: new Map(lookups?.categories.map((category) => [category.id, category] as const) ?? []),
    }),
    [lookups],
  );

  const loadMore = () => {
    if (busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    listEvents(eventFilters(query, now, { limit: DISCOVER_PAGE_SIZE, offset: events.length }))
      .then((page) => {
        setMore((current) => {
          const known = new Set([...(first.data ?? []), ...current.events].map((event) => event.id));
          return { events: [...current.events, ...page.filter((event) => !known.has(event.id))], lastSize: page.length };
        });
      })
      .catch((failure: unknown) => setMoreError(describeError(failure)))
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  };

  if (first.error) return <ErrorPanel title={t("discover.load_error")} message={first.error} onRetry={first.reload} />;
  if (!first.data || !lookups) return <Loading label={t("discover.loading")} />;

  if (events.length === 0) {
    return (
      <div className="event-grid">
        <EmptyState wide>
          {hasActiveFilters(query) ? (
            <>
              <p>{t("discover.empty_filtered")}</p>
              <Button className="empty-action" onClick={onClear}>{t("discover.clear_filters")}</Button>
            </>
          ) : (
            t("discover.empty")
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="event-grid">
        {events.map((event, index) => {
          const venue = maps.venues.get(event.venue_id);
          const categoryLabel = categoryName(maps.categories.get(event.category_id));
          const path = `/events/${encodeURIComponent(event.id)}`;
          return (
            <EventCard
              key={event.id}
              art={{ index, letter: categoryLabel.slice(0, 1) }}
              cover={event.cover_image_url ? { src: event.cover_image_url, alt: event.images[0]?.alt_text ?? event.title } : null}
              eyebrow={categoryLabel}
              title={event.title}
              to={path}
              meta={`${dateLabel(event.starts_at)} · ${venue ? `${venue.name} · ${venue.city}` : t("discover.venue_missing")}`}
              footer={
                <>
                  <span className="price">{event.time_status === "completed" ? t("common.completed") : t("discover.tickets_available")}</span>
                  <Link className="text-button" to={path}>{t("discover.view_event")}{" "}</Link>
                </>
              }
            />
          );
        })}
      </div>
      <p className="visually-hidden" role="status">{t("discover.shown_count", { count: events.length })}</p>
      {moreError || lastSize >= DISCOVER_PAGE_SIZE ? (
        <div className="load-more">
          {moreError ? <p className="form-message" role="alert">{t("discover.load_more_error")}</p> : null}
          {/* Stays focusable while busy: aria-disabled, not disabled, keeps keyboard focus on it. */}
          <Button onClick={loadMore} aria-disabled={loadingMore || undefined} aria-busy={loadingMore || undefined}>
            {loadingMore ? t("common.loading") : moreError ? t("common.try_again") : t("discover.load_more")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
