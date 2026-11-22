// Placeholders for content that is still loading. Each skeleton is one role="status" region
// named by a visually hidden label; the shapes are decoration and hidden from assistive tech.
// Their outer sizes follow the loaded layout (event card, page heading, panel), so nothing
// around them moves when the data arrives.

interface SkeletonCardProps {
  // Matches the date-tile row cards instead of the artwork cards.
  row?: boolean;
}

export function SkeletonCard({ row = false }: SkeletonCardProps) {
  return (
    <div className={["event-card", "skeleton-card", row ? "skeleton-row" : ""].filter(Boolean).join(" ")} aria-hidden="true">
      {row ? null : <div className="skeleton-art" />}
      <div className="event-card-body">
        {row ? <div className="skeleton-tile skeleton-shape" /> : null}
        <div className="event-card-copy">
          {/* Row cards (tickets, orders) have no eyebrow line. */}
          {row ? null : <span className="skeleton-eyebrow skeleton-shape" />}
          <span className="skeleton-title skeleton-shape" />
          <span className="skeleton-meta skeleton-shape" />
          {row ? <span className="skeleton-meta skeleton-shape" /> : null}
          <span className="skeleton-foot skeleton-shape" />
        </div>
      </div>
    </div>
  );
}

interface SkeletonGridProps {
  // Row grids (tickets, orders) stand in for a short list, so three rows by default.
  count?: number;
  row?: boolean;
  label: string;
}

export function SkeletonGrid({ count = 3, row = false, label }: SkeletonGridProps) {
  return (
    <div className={["event-grid", row ? "row-grid" : ""].filter(Boolean).join(" ")} role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} row={row} />
      ))}
    </div>
  );
}

// The event page while it loads: back link, heading, a status-pill row (it wraps under the heading on a
// phone) and the two panels.
export function SkeletonPage({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-page" aria-hidden="true">
        <div className="page-heading">
          <div className="page-heading-copy">
            <span className="skeleton-back skeleton-shape" />
            <span className="skeleton-eyebrow skeleton-shape" />
            <span className="skeleton-h1 skeleton-shape" />
            <span className="skeleton-subtitle skeleton-shape" />
          </div>
          <span className="skeleton-pill skeleton-shape" />
        </div>
        <div className="content-grid">
          {[0, 1].map((index) => (
            <div className="panel skeleton-panel" key={index}>
              <span className="skeleton-panel-title skeleton-shape" />
              <span className="skeleton-text skeleton-shape" />
              <span className="skeleton-text skeleton-shape" />
              <span className="skeleton-text skeleton-short skeleton-shape" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
