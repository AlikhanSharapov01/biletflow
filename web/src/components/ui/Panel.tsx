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
}

// Panel title row (h2) with optional supporting line and trailing element.
export function PanelHeading({ title, subtitle, trailing }: PanelHeadingProps) {
  return (
    <div className="panel-heading">
      <div className="panel-heading-copy">
        <h2>{title}</h2>
        {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
      </div>
      {trailing}
    </div>
  );
}
