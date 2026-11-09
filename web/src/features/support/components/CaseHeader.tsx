import { t, useLocale } from "../../../i18n";
import type { SupportCase } from "../../../api/types/support";
import { FactList, Panel, StatusPill } from "../../../components/ui";
import { dateLabel } from "../../../utils/format";
import { caseContext, categoryLabel, supportStatusLabel, supportStatusTone } from "../supportLabels";
import { ContextChips } from "./ContextChips";

// Status, category, people and the records the case is about.
export function CaseHeader({ supportCase }: { supportCase: SupportCase }) {
  useLocale();
  const isRequester = supportCase.viewer_roles.includes("requester");
  const facts = [
    { label: t("common.status"), value: <StatusPill tone={supportStatusTone(supportCase.status)}>{supportStatusLabel(supportCase.status)}</StatusPill> },
    { label: t("discover.category"), value: categoryLabel(supportCase.category) },
    { label: t("support.opened_by"), value: isRequester ? t("support.you") : supportCase.requester.display_name },
    { label: t("support.assigned_to"), value: supportCase.assigned_to?.display_name ?? t("support.not_assigned_yet") },
    { label: t("support.opened"), value: dateLabel(supportCase.created_at) },
  ];
  if (supportCase.escalated_at) facts.push({ label: t("support.escalated"), value: dateLabel(supportCase.escalated_at) });
  if (supportCase.resolved_at) facts.push({ label: t("support.resolved"), value: dateLabel(supportCase.resolved_at) });

  return (
    <Panel className="support-case-facts">
      <FactList items={facts} />
      <ContextChips context={caseContext(supportCase)} ownsRecords={isRequester} />
    </Panel>
  );
}
