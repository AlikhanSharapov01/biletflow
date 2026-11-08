import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { reviewReport } from "@/api/admin";
import { describeError } from "@/api/errors";
import type { EventReport } from "@/api/types/admin";
import { ListRow, PrimaryButton, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { dateLabel, statusLabel } from "@/utils/format";

// One event report with Start review / Resolve while it is still open.
export function ReportRow({
  report,
  onChanged,
  onResolve,
}: {
  report: EventReport;
  onChanged: () => void;
  onResolve: () => void;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const tone = report.status === "resolved" ? "neutral" : report.status === "reviewing" ? "pending" : "blocked";

  async function review() {
    try {
      await reviewReport(report.id);
      notify("Report marked as in review.");
      onChanged();
    } catch (failure) {
      notify(describeError(failure));
    }
  }

  return (
    <ListRow
      icon="!"
      title={
        <RowTitle text={statusLabel(report.category)}>
          <StatusPill label={report.status} tone={tone} />
        </RowTitle>
      }
      meta={report.description}
      note={`Event ${report.event_id.slice(0, 8)} · reported ${dateLabel(report.created_at)}${report.resolution ? ` · resolved: ${report.resolution}` : ""}`}
    >
      <View style={styles.actions}>
        <TextButton
          label="Open event"
          onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: report.event_id } })}
          style={styles.link}
        />
        {report.status === "open" ? <SubtleButton label="Start review" onPress={() => void review()} /> : null}
        {report.status !== "resolved" ? <PrimaryButton label="Resolve" onPress={onResolve} style={styles.resolve} /> : null}
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  link: { flex: 1 },
  resolve: { minHeight: 40 },
});
