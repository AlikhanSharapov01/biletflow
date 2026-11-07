import type { ReactNode } from "react";

interface ListRowProps {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  // Full-width content under the row, e.g. an inline edit form.
  children?: ReactNode;
}

// Icon tile, title with supporting lines, and trailing actions: sessions, team
// members, staff, ticket types and order items.
export function ListRow({ icon, title, meta, note, actions, children }: ListRowProps) {
  return (
    <article className="list-row">
      <div className="row-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="list-row-info">
        <strong className="list-row-title">{title}</strong>
        {meta ? <span className="list-row-meta">{meta}</span> : null}
        {note ? <small className="list-row-note">{note}</small> : null}
      </div>
      {actions ? <div className="list-row-actions">{actions}</div> : null}
      {children ? <div className="list-row-extra">{children}</div> : null}
    </article>
  );
}
