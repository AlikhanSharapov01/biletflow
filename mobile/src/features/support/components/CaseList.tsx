import { StyleSheet, Text, View } from "react-native";

import type { SupportCasePage, SupportListView } from "@/api/types/support";
import { EmptyState, SubtleButton } from "@/components/ui";
import { colors, fonts } from "@/theme";

import { CaseRow } from "./CaseRow";

interface CaseListProps {
  page: SupportCasePage | "forbidden";
  view: SupportListView;
  onPage: (offset: number) => void;
  onOpen: (caseId: string) => void;
}

// One page of cases with Previous/Next when there is more than one page.
export function CaseList({ page, view, onPage, onOpen }: CaseListProps) {
  if (page === "forbidden" || page.items.length === 0) {
    return (
      <EmptyState
        message={
          view === "queue"
            ? "No cases to work on. The queue lists cases from events where you are support staff, and escalated cases for platform admins."
            : "No support cases yet. Open one whenever you need help."
        }
      />
    );
  }
  const hasPrevious = page.offset > 0;
  const hasNext = page.offset + page.items.length < page.total;
  return (
    <>
      {page.items.map((item) => (
        <CaseRow key={item.id} supportCase={item} showRequester={view === "queue"} onOpen={onOpen} />
      ))}
      {hasPrevious || hasNext ? (
        <View style={styles.pager}>
          <SubtleButton label="Previous" disabled={!hasPrevious} onPress={() => onPage(Math.max(0, page.offset - page.limit))} />
          <Text style={styles.range}>
            {page.offset + 1}–{page.offset + page.items.length} of {page.total}
          </Text>
          <SubtleButton label="Next" disabled={!hasNext} onPress={() => onPage(page.offset + page.limit)} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 },
  range: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
});
