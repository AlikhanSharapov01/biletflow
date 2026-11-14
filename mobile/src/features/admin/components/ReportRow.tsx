import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { reviewReport } from "@/api/admin";
import { describeError } from "@/api/errors";
import type { EventReport } from "@/api/types/admin";
import { ListRow, PrimaryButton, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { dateLabel, statusLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

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
  useLocale();
  const router = useRouter();
  const { notify } = useToast();
  const tone = report.status === "resolved" ? "neutral" : report.status === "reviewing" ? "pending" : "blocked";

  async function review() {
    try {
      await reviewReport(report.id);
      notify(t("admin.review_started"));
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
          <StatusPill label={statusLabel(report.status)} tone={tone} />
        </RowTitle>
      }
      meta={report.description}
      note={t("mobile.admin.report_meta", { p0: report.event_id.slice(0, 8), p1: dateLabel(report.created_at), p2: report.resolution ? t("admin.resolved_suffix", { p0: report.resolution }) : "" })}
    >
      <View style={styles.actions}>
        <TextButton
          label={t("mobile.admin.open_event")}
          onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: report.event_id } })}
          style={styles.link}
        />
        {report.status === "open" ? <SubtleButton label={t("admin.start_review")} onPress={() => void review()} /> : null}
        {report.status !== "resolved" ? <PrimaryButton label={t("org.resolve")} onPress={onResolve} style={styles.resolve} /> : null}
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  link: { flex: 1 },
  resolve: { minHeight: 40 },
});
