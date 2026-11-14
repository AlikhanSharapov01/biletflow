import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { EventSeat } from "@/api/types/checkout";
import { colors, fonts, radii } from "@/theme";
import { seatLook, type SeatSection } from "../utils/seats";
import { SeatButton } from "./SeatButton";
import { t, useLocale } from "@/i18n";

interface SeatMapProps {
  sections: SeatSection[];
  selected: ReadonlySet<string>;
  priceText: (seat: EventSeat) => string;
  canSelect: (seat: EventSeat) => boolean;
  onToggle: (seat: EventSeat) => void;
}

// Sections, then rows, then seat buttons. Wide rows scroll sideways instead
// of shrinking, so every seat keeps a finger-sized target without pinching.
export function SeatMap({ sections, selected, priceText, canSelect, onToggle }: SeatMapProps) {
  useLocale();
  return (
    <View style={styles.frame}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          <Text style={styles.stage} accessibilityElementsHidden importantForAccessibility="no">
            {t("checkout.stage")}
          </Text>
          {sections.map((section) => (
            <View style={styles.section} key={section.label} accessibilityLabel={t("format.section", { section: section.label })}>
              <Text style={styles.sectionTitle}>{t("format.section", { section: section.label })}</Text>
              {section.rows.map((row) => (
                <View style={styles.row} key={row.label} accessibilityLabel={t("format.row", { section: section.label, row: row.label })}>
                  <Text style={styles.rowLabel} accessibilityElementsHidden importantForAccessibility="no">
                    {row.label}
                  </Text>
                  {row.seats.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      look={seatLook(seat, selected)}
                      priceText={priceText(seat)}
                      selectable={canSelect(seat)}
                      onToggle={onToggle}
                    />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.panel, backgroundColor: colors.canvas, overflow: "hidden" },
  content: { flexGrow: 1, padding: 14 },
  inner: { flexGrow: 1, gap: 16 },
  stage: {
    alignSelf: "center",
    minWidth: 200,
    paddingVertical: 6,
    paddingHorizontal: 24,
    overflow: "hidden",
    borderRadius: radii.input,
    backgroundColor: colors.tabTrack,
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.3,
    textAlign: "center",
    textTransform: "uppercase",
  },
  section: { gap: 6 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowLabel: { width: 24, marginRight: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, fontWeight: "700", textAlign: "right" },
});
