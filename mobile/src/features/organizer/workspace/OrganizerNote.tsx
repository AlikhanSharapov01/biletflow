import { StyleSheet } from "react-native";

import { Eyebrow, Panel, DisplayText } from "@/components/ui";

import { Intro } from "../components/Intro";
import { useLocale } from "@/i18n";

// Pale green aside with a tip (web .organizer-note).
export function OrganizerNote({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  useLocale();
  return (
    <Panel tone="note" style={styles.note}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <DisplayText style={styles.title}>{title}</DisplayText>
      <Intro>{children}</Intro>
    </Panel>
  );
}

const styles = StyleSheet.create({
  note: { gap: 6 },
  title: { fontSize: 20, lineHeight: 25 },
});
