import { useMemo, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { listCategories, listEvents, listVenues } from "../api/catalog";
import { EmptyState, ErrorPanel, Loading } from "../components/Feedback";
import { useRequest } from "../hooks/useRequest";
import { dateLabel } from "../utils/format";

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

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const query = String(data.get("q") ?? "").trim();
    const category = String(data.get("category") ?? "");
    if (query) next.set("q", query);
    if (category) next.set("category", category);
    setSearchParams(next);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your city, in good company</p>
          <h1 className="serif">Find your next moment.</h1>
          <p>Discover what’s happening around you, from the people bringing it to life.</p>
        </div>
      </div>
      <form className="panel live-filters" onSubmit={handleSearch}>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input name="q" defaultValue={q} key={q} placeholder="Search event titles" aria-label="Search events" />
        </label>
        <label className="field compact-field">
          <span>Category</span>
          <select name="category" defaultValue={categoryId} key={`${categoryId}-${page.data?.categories.length ?? 0}`}>
            <option value="">All categories</option>
            {page.data?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_en}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit">
          Search events
        </button>
      </form>
      {page.loading ? <Loading label="Loading events…" /> : null}
      {page.error ? <ErrorPanel title="We couldn’t load events." message={page.error} onRetry={page.reload} /> : null}
      {page.data ? (
        <div className="event-cards live-event-cards">
          {page.data.events.length === 0 ? (
            <EmptyState wide>No events match those filters yet. Try another search or check back soon.</EmptyState>
          ) : (
            page.data.events.map((event, index) => {
              const venue = lookups.venues.get(event.venue_id);
              const categoryName = lookups.categories.get(event.category_id)?.name_en ?? "Community";
              return (
                <article className="discover-card" key={event.id}>
                  <div className={`live-art live-art-${index % 4}`} aria-hidden="true">
                    <span>{categoryName.slice(0, 1)}</span>
                  </div>
                  <div className="discover-copy">
                    <p className="eyebrow">{categoryName}</p>
                    <h3>
                      <Link to={`/events/${encodeURIComponent(event.id)}`}>{event.title}</Link>
                    </h3>
                    <p>
                      {dateLabel(event.starts_at)} · {venue ? `${venue.name} · ${venue.city}` : "Venue details unavailable"}
                    </p>
                    <div className="discover-foot">
                      <span className="price">{event.time_status === "completed" ? "Completed" : "Tickets available"}</span>
                      <Link className="text-button" to={`/events/${encodeURIComponent(event.id)}`}>
                        View event →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </>
  );
}
