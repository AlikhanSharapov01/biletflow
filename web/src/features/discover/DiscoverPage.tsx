import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { listCategories, listEvents, listVenues } from "../../api/catalog";
import { EmptyState, ErrorPanel, EventCard, Loading, PageHeading } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel } from "../../utils/format";
import { DiscoverFilters } from "./components/DiscoverFilters";

export function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const categoryId = searchParams.get("category") ?? "";

  const page = useRequest(
    async () => {
      const [events, categories, venues] = await Promise.all([
        listEvents({ q: q || undefined, category_id: categoryId || undefined }),
        listCategories(),
        listVenues(),
      ]);
      return { events, categories, venues };
    },
    [q, categoryId],
  );

  const lookups = useMemo(() => {
    const venues = new Map(page.data?.venues.map((venue) => [venue.id, venue] as const) ?? []);
    const categories = new Map(page.data?.categories.map((category) => [category.id, category] as const) ?? []);
    return { venues, categories };
  }, [page.data]);

  const search = (filters: { q: string; category: string }) => {
    const next = new URLSearchParams();
    if (filters.q) next.set("q", filters.q);
    if (filters.category) next.set("category", filters.category);
    setSearchParams(next);
  };

  return (
    <>
      <PageHeading
        eyebrow="Your city, in good company"
        title="Find your next moment."
        subtitle="Discover what’s happening around you, from the people bringing it to life."
      />
      <DiscoverFilters q={q} categoryId={categoryId} categories={page.data?.categories ?? []} onSearch={search} />
      {page.loading ? <Loading label="Loading events…" /> : null}
      {page.error ? <ErrorPanel title="We couldn’t load events." message={page.error} onRetry={page.reload} /> : null}
      {page.data ? (
        <div className="event-grid">
          {page.data.events.length === 0 ? (
            <EmptyState wide>No events match those filters yet. Try another search or check back soon.</EmptyState>
          ) : (
            page.data.events.map((event, index) => {
              const venue = lookups.venues.get(event.venue_id);
              const categoryName = lookups.categories.get(event.category_id)?.name_en ?? "Community";
              const path = `/events/${encodeURIComponent(event.id)}`;
              return (
                <EventCard
                  key={event.id}
                  art={{ index, letter: categoryName.slice(0, 1) }}
                  eyebrow={categoryName}
                  title={event.title}
                  to={path}
                  meta={`${dateLabel(event.starts_at)} · ${venue ? `${venue.name} · ${venue.city}` : "Venue details unavailable"}`}
                  footer={
                    <>
                      <span className="price">{event.time_status === "completed" ? "Completed" : "Tickets available"}</span>
                      <Link className="text-button" to={path}>
                        View event →
                      </Link>
                    </>
                  }
                />
              );
            })
          )}
        </div>
      ) : null}
    </>
  );
}
