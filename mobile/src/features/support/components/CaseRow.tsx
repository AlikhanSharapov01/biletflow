import type { SupportCase } from "@/api/types/support";
import { ListRow, StatusPill } from "@/components/ui";
import { dateLabel } from "@/utils/format";

import { categoryLabel, supportStatusLabel, supportStatusTone } from "../utils/supportLabels";

interface CaseRowProps {
  supportCase: SupportCase;
  // The queue shows who asked; "My cases" does not need it.
  showRequester?: boolean;
  onOpen: (caseId: string) => void;
}

export function CaseRow({ supportCase, showRequester = false, onOpen }: CaseRowProps) {
  const people = [
    showRequester ? `From ${supportCase.requester.display_name}` : null,
    supportCase.assigned_to ? `Assigned to ${supportCase.assigned_to.display_name}` : null,
    supportCase.escalated_at ? "Escalated" : null,
  ].filter(Boolean);
  return (
    <ListRow
      icon="?"
      title={supportCase.subject}
      meta={`${categoryLabel(supportCase.category)} · updated ${dateLabel(supportCase.updated_at)}`}
      note={people.length ? people.join(" · ") : undefined}
      trailing={<StatusPill tone={supportStatusTone(supportCase.status)} label={supportStatusLabel(supportCase.status)} />}
      onPress={() => onOpen(supportCase.id)}
      accessibilityLabel={`Open case ${supportCase.subject}`}
    />
  );
}
