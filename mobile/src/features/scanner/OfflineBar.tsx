import { StyleSheet, Text, View } from "react-native";

import type { AssignedEvent } from "@/api/types/scanner";
import { TextButton } from "@/components/ui";
import type { OfflineScanning } from "@/features/scanner/useOfflineScanning";
import { fonts } from "@/theme";
import { formatEventMoment } from "@/utils/eventTime";

// Prepares this phone for a venue without signal and shows what still has to
// reach the server. A new list needs an empty queue: queued scans belong to the old one.
export function OfflineBar({ offline, event }: { offline: OfflineScanning; event: AssignedEvent }) {
  if (!offline.supported || !offline.loaded) return null;
  const { expiresAt, pending, busy, notice } = offline;
  const expired = expiresAt !== null && Date.parse(expiresAt) <= Date.now();
  const status =
    expiresAt === null
      ? "Offline scanning isn’t set up on this phone."
      : expired
        ? "Offline list expired."
        : `Offline list ready until ${formatEventMoment(expiresAt, event.time_zone)}.`;

  return (
    <View style={styles.bar}>
      <Text style={styles.line}>{status}</Text>
      {pending > 0 ? <Text style={styles.pending}>{pending} scans waiting to sync</Text> : null}
      {notice ? <Text style={styles.line}>{notice}</Text> : null}
      {busy ? (
        <Text style={styles.line}>Working…</Text>
      ) : pending > 0 ? (
        <TextButton label="Sync now" onPress={() => void offline.sync()} light />
      ) : (
        <TextButton
          label={expiresAt === null ? "Prepare for offline" : "Update offline list"}
          onPress={() => void offline.prepare(event)}
          light
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 4,
    alignItems: "flex-start",
  },
  line: {
    color: "#d5e2d5",
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  pending: {
    color: "#fff",
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: "700",
  },
});
