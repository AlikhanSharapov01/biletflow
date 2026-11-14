import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { listModerationActions } from "@/api/admin";
import { EmptyState, ErrorPanel, LoadingState, Panel, PanelHeading, SubtleButton } from "@/components/ui";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useRequest } from "@/hooks/useRequest";
import { colors, fonts } from "@/theme";
import { dateLabel, statusLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

const LIMIT = 50;

// Append-only record of every suspend / reinstate decision, newest first.
export function AdminModerationPage() {
  useLocale();
  const [offset, setOffset] = useState(0);
  const log = useRequest(() => listModerationActions(LIMIT, offset), [offset]);

  return (
    <Panel>
      <PanelHeading title={t("admin.moderation_log")} />
      <SectionNote text={t("admin.moderation_hint")} />
      {log.loading ? <LoadingState message={t("admin.loading_moderation")} /> : null}
      {log.error ? (
        <ErrorPanel title={t("admin.moderation_error")} message={log.error} onRetry={log.reload} />
      ) : null}
      {log.data && !log.loading ? (
        log.data.length === 0 ? (
          <EmptyState message={t("admin.no_moderation")} />
        ) : (
          <View>
            {log.data.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <Text style={styles.time}>{dateLabel(entry.created_at)}</Text>
                <Text style={styles.action}>{statusLabel(entry.action)}</Text>
                <Text style={styles.reason}>{entry.reason}</Text>
                <Text style={styles.small}>
                  {entry.target_user_id ? t("admin.user_id", { p0: entry.target_user_id }) : t("admin.event_id", { p0: entry.target_event_id ?? "unknown" })} {t("admin.by_admin_suffix")}{" "}
                  {entry.actor_user_id.slice(0, 8)}
                </Text>
              </View>
            ))}
          </View>
        )
      ) : null}
      <View style={styles.pager}>
        <SubtleButton label={t("support.newer")} disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - LIMIT))} style={styles.page} />
        <SubtleButton label={t("support.older")} disabled={(log.data?.length ?? 0) < LIMIT} onPress={() => setOffset(offset + LIMIT)} style={styles.page} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  entry: { gap: 3, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  time: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12 },
  action: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
  reason: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  small: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
  pager: { flexDirection: "row", gap: 8, marginTop: 12 },
  page: { flex: 1 },
});
