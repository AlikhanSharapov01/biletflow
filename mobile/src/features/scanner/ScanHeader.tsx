import { StyleSheet, Text, View } from "react-native";

import type { AdmissionCounts, AssignedEvent } from "@/api/types/scanner";
import { Eyebrow, SerifText, TextButton } from "@/components/ui";
import { CountsBar } from "@/features/scanner/CountsBar";
import { fonts } from "@/theme";
import { formatEventWindow } from "@/utils/eventTime";

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
  return (
    <View style={styles.header}>
      <TextButton label="‹ Change event" onPress={onBack} style={styles.back} light />
      <Eyebrow style={styles.eyebrow}>Your assigned event</Eyebrow>
      <SerifText style={styles.title} numberOfLines={1}>
        {event.title}
      </SerifText>
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
    color: "#c0d6c4",
  },
  title: {
    marginTop: 4,
    color: "#fff",
    fontSize: 24,
    lineHeight: 28,
  },
  subtitle: {
    color: "#d5e2d5",
    fontFamily: fonts.sans,
    fontSize: 13,
  },
});
