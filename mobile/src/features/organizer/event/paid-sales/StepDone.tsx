import { StatusPill } from "@/components/ui";
import { t, useLocale } from "@/i18n";

export function StepDone({ done }: { done: boolean }) {
  useLocale();
  return <StatusPill tone={done ? "positive" : "pending"} label={done ? t("org.done") : t("org.todo")} />;
}
