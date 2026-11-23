import { StyleSheet, Text, View } from "react-native";

import type { AdmissionCounts, AssignedEvent } from "@/api/types/scanner";
import { Eyebrow, DisplayText, TextButton } from "@/components/ui";
import { CountsBar } from "@/features/scanner/CountsBar";
import { fonts, colors } from "@/theme";
import { formatEventWindow } from "@/utils/eventTime";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// Dark-green card like the web check-in desk (.checkin-card + .checkin-count).
export function ScanHeader({
  event,
  counts,
  onBack,
}: {
  event: AssignedEvent;
  counts: AdmissionCounts | null;
  onBack: () => void;
}) {
  useLocale();
  return (
    <View style={styles.header}>
      <TextButton label={t("mobile.scan.change_event")} onPress={onBack} style={styles.back} light />
      <Eyebrow style={styles.eyebrow}>{t("mobile.scan.your_event")}</Eyebrow>
      <DisplayText style={styles.title} numberOfLines={1}>
        {event.title}
      </DisplayText>
      <Text style={styles.subtitle} numberOfLines={1}>
        {event.venue.name} · {formatEventWindow(event.starts_at, event.ends_at, event.time_zone)}
      </Text>
      {counts ? <CountsBar counts={counts} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 4,
  },
  back: {
    marginBottom: 8,
  },
  eyebrow: {
    color: colors.storyFoot,
  },
  title: {
    marginTop: 4,
    color: colors.onGreen,
    fontSize: 24,
    lineHeight: 28,
  },
  subtitle: {
    color: colors.storySoft,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
});
