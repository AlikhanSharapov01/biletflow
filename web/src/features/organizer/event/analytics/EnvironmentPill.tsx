import { t, useLocale } from "../../../../i18n";
import { StatusPill } from "../../../../components/ui";

interface EnvironmentPillProps {
  simulated: boolean;
  environments: string[];
}

// Marks money figures as demonstration records (SRS 4.6): simulated or
// sandbox payments are never presented as real financial transactions.
export function EnvironmentPill({ simulated, environments }: EnvironmentPillProps) {
  useLocale();
  if (!simulated && environments.length === 0) return null;
  const sandbox = environments.includes("sandbox");
  const simulation = simulated || environments.includes("simulation");
  const label = sandbox && simulation ? t("org.env_mixed") : sandbox ? t("org.env_sandbox") : t("org.finance_demo");
  return <StatusPill tone="pending">{label}</StatusPill>;
}
