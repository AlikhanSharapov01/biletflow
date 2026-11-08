import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { describeError } from "@/api/errors";
import { searchAttendees } from "@/api/scanner";
import type { AttendeeHit } from "@/api/types/scanner";
import { panelStyles } from "@/features/scanner/panelStyles";
import { colors, fonts } from "@/theme";

function seatText(hit: AttendeeHit): string {
  if (!hit.seat) return hit.ticket_type_name;
  return `${hit.ticket_type_name} · ${hit.seat.section_label} ${hit.seat.row_label}-${hit.seat.seat_label}`;
}

// Find a guest by name or exact email when their QR cannot be scanned, then
// check them in by ticket id (the server applies every rule of a scan).
export function AttendeeSearchPanel({
  eventId,
  onCheckIn,
  onClose,
}: {
  eventId: string;
  onCheckIn: (hit: AttendeeHit) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AttendeeHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setHits(null);
      setError(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      searchAttendees(eventId, trimmed)
        .then((result) => active && (setHits(result), setError(null)))
        .catch((failure: unknown) => active && setError(describeError(failure)))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [eventId, trimmed]);

  return (
    <View style={[panelStyles.panel, styles.panel]}>
      <Text style={panelStyles.panelTitle}>Find a guest</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Name or exact email"
        placeholderTextColor="rgba(255,255,255,0.6)"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        accessibilityLabel="Search guests"
      />
      {loading ? <ActivityIndicator color="#fff" /> : null}
      {error ? <Text style={styles.message}>{error}</Text> : null}
      {hits && hits.length === 0 && !loading ? <Text style={styles.message}>No guests match.</Text> : null}
      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {hits?.map((hit) => (
          <View key={hit.ticket_id} style={styles.hit}>
            <View style={styles.hitInfo}>
              <Text style={styles.hitName}>{hit.attendee_name}</Text>
              <Text style={styles.hitMeta}>{seatText(hit)}</Text>
              {hit.checked_in ? <Text style={styles.hitMeta}>Already checked in</Text> : null}
              {hit.status !== "valid" && !hit.checked_in ? <Text style={styles.hitMeta}>Ticket {hit.status.replace(/_/g, " ")}</Text> : null}
            </View>
            {!hit.checked_in && hit.status === "valid" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Check in ${hit.attendee_name}`}
                style={styles.hitButton}
                onPress={() => onCheckIn(hit)}
              >
                <Text style={panelStyles.panelButtonText}>Check in</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <View style={panelStyles.panelActions}>
        <Pressable
          accessibilityRole="button"
          style={[panelStyles.panelButton, panelStyles.panelButtonSecondary]}
          onPress={onClose}
        >
          <Text style={panelStyles.panelButtonText}>Back to camera</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { top: 16, backgroundColor: colors.greenStory },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
  },
  message: { color: "#fff", fontFamily: fonts.sans, fontSize: 14, paddingVertical: 6 },
  results: { flex: 1, marginTop: 6 },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.15)",
  },
  hitInfo: { flex: 1, gap: 2 },
  hitName: { color: "#fff", fontFamily: fonts.sans, fontSize: 16, fontWeight: "700" },
  hitMeta: { color: "rgba(255,255,255,0.8)", fontFamily: fonts.sans, fontSize: 13 },
  hitButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.green },
});
