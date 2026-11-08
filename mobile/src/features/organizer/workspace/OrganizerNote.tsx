import { StyleSheet } from "react-native";

import { Eyebrow, Panel, SerifText } from "@/components/ui";

import { Intro } from "../components/Intro";

// Pale green aside with a tip (web .organizer-note).
export function OrganizerNote({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  return (
    <Panel tone="note" style={styles.note}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <SerifText style={styles.title}>{title}</SerifText>
      <Intro>{children}</Intro>
    </Panel>
  );
}

const styles = StyleSheet.create({
  note: { gap: 6 },
  title: { fontSize: 20, lineHeight: 25 },
});
