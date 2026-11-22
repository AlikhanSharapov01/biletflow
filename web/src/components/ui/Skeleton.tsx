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
          <span className="skeleton-eyebrow skeleton-shape" />
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
  count: number;
  row?: boolean;
  label: string;
}

export function SkeletonGrid({ count, row = false, label }: SkeletonGridProps) {
  return (
    <div className={["event-grid", row ? "row-grid" : ""].filter(Boolean).join(" ")} role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} row={row} />
      ))}
    </div>
  );
}

interface SkeletonPageProps {
  label: string;
  // Panels under the heading: one full-width, or two as the event page lays them out.
  panels?: 1 | 2;
  // Room for the "Back" link above the heading.
  back?: boolean;
}

// A page heading and its panels, for pages that load as a whole.
export function SkeletonPage({ label, panels = 1, back = false }: SkeletonPageProps) {
  return (
    <div role="status">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-page" aria-hidden="true">
        <div>
          {back ? <span className="skeleton-back skeleton-shape" /> : null}
          <span className="skeleton-eyebrow skeleton-shape" />
          <span className="skeleton-h1 skeleton-shape" />
          <span className="skeleton-subtitle skeleton-shape" />
        </div>
        <div className={panels === 2 ? "content-grid" : "stack"}>
          {Array.from({ length: panels }, (_, index) => (
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
