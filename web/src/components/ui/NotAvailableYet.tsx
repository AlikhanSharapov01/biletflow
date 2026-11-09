import { t, useLocale } from "../../i18n";
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
  useLocale();
  return (
    <div className="not-available" role="status">
      <StatusPill tone="neutral">{t("common.not_available_yet")}</StatusPill>
      <strong>{feature}{" "}{t("common.coming_soon_suffix")}</strong>
      <p>{children ?? t("common.coming_soon_copy")}</p>
    </div>
  );
}
