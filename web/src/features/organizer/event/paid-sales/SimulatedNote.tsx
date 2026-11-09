import { t, useLocale } from "../../../../i18n";
import { Panel, StatusPill } from "../../../../components/ui";

// Shown on every money screen: BiletFlow is an academic simulation.
export function SimulatedNote({ children }: { children?: string }) {
  useLocale();
  return (
    <Panel as="aside" tone="note" className="simulated-note">
      <StatusPill tone="pending">{t("org.simulated_money")}</StatusPill>
      <p>{children ?? t("org.demo_payment_notice")}</p>
    </Panel>
  );
}
