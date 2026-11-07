import type { ReactNode } from "react";
import { Link } from "react-router";

interface PageHeadingProps {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  // Optional "← Back" link shown above the heading.
  back?: { to: string; label: string };
}

// Eyebrow, serif page title (the page's only h1), a line of copy and actions,
// matching mobile's ui/PageHeading.
export function PageHeading({ eyebrow, title, subtitle, actions, back }: PageHeadingProps) {
  return (
    <>
      {back ? (
        <Link className="back-link" to={back.to}>
          ← {back.label}
        </Link>
      ) : null}
      <div className="page-heading">
        <div className="page-heading-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="heading-actions">{actions}</div> : null}
      </div>
    </>
  );
}
