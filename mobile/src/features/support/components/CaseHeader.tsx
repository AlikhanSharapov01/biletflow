import { StyleSheet } from "react-native";

import type { SupportCase } from "@/api/types/support";
import { FactList, Panel, StatusPill, type Fact } from "@/components/ui";
import { dateLabel } from "@/utils/format";

import { caseContext, categoryLabel, supportStatusLabel, supportStatusTone } from "../utils/supportLabels";
import { ContextChips } from "./ContextChips";

// Status, category, people and the records the case is about.
export function CaseHeader({ supportCase }: { supportCase: SupportCase }) {
  const isRequester = supportCase.viewer_roles.includes("requester");
  const facts: Fact[] = [
    {
      label: "Status",
      value: <StatusPill tone={supportStatusTone(supportCase.status)} label={supportStatusLabel(supportCase.status)} />,
    },
    { label: "Category", value: categoryLabel(supportCase.category) },
    { label: "Opened by", value: isRequester ? "You" : supportCase.requester.display_name },
    { label: "Assigned to", value: supportCase.assigned_to?.display_name ?? "Not assigned yet" },
    { label: "Opened", value: dateLabel(supportCase.created_at) },
  ];
  if (supportCase.escalated_at) facts.push({ label: "Escalated", value: dateLabel(supportCase.escalated_at) });
  if (supportCase.resolved_at) facts.push({ label: "Resolved", value: dateLabel(supportCase.resolved_at) });

  return (
    <Panel style={styles.panel}>
      <FactList items={facts} />
      <ContextChips context={caseContext(supportCase)} ownsRecords={isRequester} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
});
