import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "aside" | "div";
  // "note" is the pale green aside used for guidance copy.
  tone?: "paper" | "note";
}

// Bordered paper card; children are spaced evenly.
export function Panel({ as: Tag = "section", tone = "paper", className, ...rest }: PanelProps) {
  const classes = ["panel", tone === "note" ? "panel-note" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag className={classes} {...rest} />;
}

interface PanelHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  // Lets a page link to the heading and move focus to it.
  headingId?: string;
  focusable?: boolean;
}

// Panel title row (h2) with optional supporting line and trailing element.
export function PanelHeading({ title, subtitle, trailing, headingId, focusable }: PanelHeadingProps) {
  return (
    <div className="panel-heading">
      <div className="panel-heading-copy">
        <h2 id={headingId} tabIndex={focusable ? -1 : undefined}>{title}</h2>
        {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
      </div>
      {trailing}
    </div>
  );
}
