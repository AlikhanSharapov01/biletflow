import { Link } from "react-router";
import type { SupportCase } from "../../../api/types/support";
import { ListRow, StatusPill } from "../../../components/ui";
import { dateLabel } from "../../../utils/format";
import { categoryLabel, supportStatusLabel, supportStatusTone } from "../supportLabels";

interface CaseRowProps {
  supportCase: SupportCase;
  // The queue shows who asked; "My cases" does not need it.
  showRequester?: boolean;
}

export function CaseRow({ supportCase, showRequester = false }: CaseRowProps) {
  const path = `/support/cases/${encodeURIComponent(supportCase.id)}`;
  const people = [
    showRequester ? `From ${supportCase.requester.display_name}` : null,
    supportCase.assigned_to ? `Assigned to ${supportCase.assigned_to.display_name}` : null,
    supportCase.escalated_at ? "Escalated" : null,
  ].filter(Boolean);
  return (
    <ListRow
      icon="?"
      title={
        <>
          <Link to={path}>{supportCase.subject}</Link>
          <StatusPill tone={supportStatusTone(supportCase.status)}>{supportStatusLabel(supportCase.status)}</StatusPill>
        </>
      }
      meta={`${categoryLabel(supportCase.category)} · updated ${dateLabel(supportCase.updated_at)}`}
      note={people.length ? people.join(" · ") : undefined}
    />
  );
}
