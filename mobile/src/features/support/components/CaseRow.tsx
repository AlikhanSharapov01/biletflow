import type { SupportCase } from "@/api/types/support";
import { ListRow, StatusPill } from "@/components/ui";
import { dateLabel } from "@/utils/format";

import { categoryLabel, supportStatusLabel, supportStatusTone } from "../utils/supportLabels";
import { t, useLocale } from "@/i18n";

interface CaseRowProps {
  supportCase: SupportCase;
  // The queue shows who asked; "My cases" does not need it.
  showRequester?: boolean;
  onOpen: (caseId: string) => void;
}

export function CaseRow({ supportCase, showRequester = false, onOpen }: CaseRowProps) {
  useLocale();
  const people = [
    showRequester ? t("support.from", { p0: supportCase.requester.display_name }) : null,
    supportCase.assigned_to ? t("support.assigned_name", { p0: supportCase.assigned_to.display_name }) : null,
    supportCase.escalated_at ? t("support.escalated") : null,
  ].filter(Boolean);
  return (
    <ListRow
      icon="?"
      title={supportCase.subject}
      meta={t("support.updated_meta", { p0: categoryLabel(supportCase.category), p1: dateLabel(supportCase.updated_at) })}
      note={people.length ? people.join(" · ") : undefined}
      trailing={<StatusPill tone={supportStatusTone(supportCase.status)} label={supportStatusLabel(supportCase.status)} />}
      onPress={() => onOpen(supportCase.id)}
      accessibilityLabel={t("mobile.support.open_case", { p0: supportCase.subject })}
    />
  );
}
