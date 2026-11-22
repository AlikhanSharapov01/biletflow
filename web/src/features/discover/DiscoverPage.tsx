import { categoryName, t, useLocale } from "../../i18n";
import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { listCategories, listVenues } from "../../api/catalog";
import type { Category, Venue } from "../../api/types";
import { EmptyState, ErrorPanel, EventCard, Loading, PageHeading } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel } from "../../utils/format";
import { DiscoverFilters } from "./components/DiscoverFilters";
import { discoverSearchParams, hasActiveFilters, parseDiscoverQuery, priceRangeError, type DiscoverQuery } from "./discoverQuery";
import { useDiscoverEvents, type DiscoverEvents } from "./useDiscoverEvents";

interface Lookups {
  categories: Category[];
  venues: Venue[];
}

// While a new search loads, show the loading state instead of the previous search's
// cards. Set to true to keep the old cards on screen until the new ones arrive.
const KEEP_PREVIOUS_CARDS = false;

export function DiscoverPage() {
  useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  // Parsed from the URL, so a hand-edited link is cleaned the same way as a submitted form.
  const urlKey = searchParams.toString();
  const query = useMemo(() => parseDiscoverQuery(new URLSearchParams(urlKey)), [urlKey]);
  const key = discoverSearchParams(query).toString();
  const rangeError = priceRangeError(query);

  // Categories and venues are loaded once per visit, not per search or page.
  const lookups = useRequest<Lookups>(async () => {
    const [categories, venues] = await Promise.all([listCategories(), listVenues()]);
    return { categories, venues };
  }, []);
  const found = useDiscoverEvents(query, !rangeError);

  const cities = useMemo(() => lookups.data?.venues.map((venue) => venue.city) ?? [], [lookups.data]);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearch = useRef(false);
  useEffect(() => {
    if (focusSearch.current && key === "") {
      focusSearch.current = false;
      searchRef.current?.focus();
    }
  }, [key]);

  const search = (next: DiscoverQuery) => {
    const params = discoverSearchParams(next);
    // The same search again refreshes the results instead of adding a history entry.
    if (params.toString() === key) found.reload();
    else setSearchParams(params);
  };
  // The button that was pressed goes away, so the search box takes the focus.
  const clear = () => {
    focusSearch.current = true;
    setSearchParams(new URLSearchParams());
  };

  // One live region outside the results, so every search is announced.
  const settled = !lookups.error && !rangeError && !found.error && found.loaded && !found.loading;
  const announcement = !settled
    ? ""
    : found.events.length === 0
      ? hasActiveFilters(query) ? t("discover.empty_filtered") : t("discover.empty")
      : t("discover.shown_count", { count: found.events.length });

  return (
    <>
      <PageHeading
        eyebrow={t("discover.eyebrow")}
        title={t("discover.title")}
        subtitle={t("discover.subtitle")}
      />
      <DiscoverFilters query={query} categories={lookups.data?.categories ?? []} cities={cities} searchRef={searchRef} onSearch={search} onClear={clear} />
      <p className="visually-hidden" role="status">{announcement}</p>
      {lookups.error ? (
        <ErrorPanel title={t("discover.load_error")} message={lookups.error} onRetry={lookups.reload} />
      ) : rangeError ? null : (
        <DiscoverResults found={found} lookups={lookups.data} filtered={hasActiveFilters(query)} onClear={clear} />
      )}
    </>
  );
}

interface DiscoverResultsProps {
  found: DiscoverEvents;
  lookups: Lookups | null;
  filtered: boolean;
  onClear: () => void;
}

function DiscoverResults({ found, lookups, filtered, onClear }: DiscoverResultsProps) {
  useLocale();
  const grid = useRef<HTMLDivElement>(null);
  // Set when Load more had the focus, so it can follow the new cards if the button goes away.
  const refocusFrom = useRef<number | null>(null);
  const maps = useMemo(
    () => ({
      venues: new Map(lookups?.venues.map((venue) => [venue.id, venue] as const) ?? []),
      categories: new Map(lookups?.categories.map((category) => [category.id, category] as const) ?? []),
    }),
    [lookups],
  );

  const { events, hasMore, loadingMore, loadMoreFailed } = found;
  useEffect(() => {
    if (refocusFrom.current === null || loadingMore) return;
    const from = refocusFrom.current;
    refocusFrom.current = null;
    if (hasMore || loadMoreFailed) return;
    const cards = grid.current?.querySelectorAll<HTMLAnchorElement>("a");
    const links = [...(cards ?? [])];
    const target = events[from] ?? events.at(-1);
    const path = target ? `/events/${encodeURIComponent(target.id)}` : "";
    (links.find((link) => link.getAttribute("href") === path) ?? links.at(-1))?.focus();
  }, [events, hasMore, loadingMore, loadMoreFailed]);

  if (found.error) return <ErrorPanel title={t("discover.load_error")} message={found.error} onRetry={found.reload} />;
  if (!lookups || !found.loaded || (found.loading && !KEEP_PREVIOUS_CARDS)) return <Loading label={t("discover.loading")} />;

  if (events.length === 0) {
    return (
      <div className="event-grid">
        <EmptyState wide>
          {filtered ? (
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
      <div className="event-grid" ref={grid}>
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
      {hasMore || loadingMore || loadMoreFailed ? (
        <div className="load-more">
          {loadMoreFailed ? <p className="form-message" role="alert">{t("discover.load_more_error")}</p> : null}
          {/* Stays focusable while busy: aria-disabled, not disabled, keeps keyboard focus on it. */}
          <Button
            onClick={(event) => {
              if (loadingMore) return;
              refocusFrom.current = event.currentTarget === document.activeElement ? events.length : null;
              found.loadMore();
            }}
            aria-disabled={loadingMore || undefined}
            aria-busy={loadingMore || undefined}
          >
            {loadingMore ? t("common.loading") : loadMoreFailed ? t("common.try_again") : t("discover.load_more")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
