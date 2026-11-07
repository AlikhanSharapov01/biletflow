import type { ReactNode } from "react";
import { StatusPill } from "./StatusPill";

interface NotAvailableYetProps {
  // What the screen will do once the backend ships it, e.g. "Promo campaigns".
  feature: string;
  children?: ReactNode;
}

// Shown where a screen is built on a planned API contract that the backend
// does not serve yet. Never filled with sample data.
export function NotAvailableYet({ feature, children }: NotAvailableYetProps) {
  return (
    <div className="not-available" role="status">
      <StatusPill tone="neutral">Not available yet</StatusPill>
      <strong>{feature} is coming soon.</strong>
      <p>{children ?? "This part of BiletFlow is designed and ready, and will start working once the server side is released."}</p>
    </div>
  );
}
