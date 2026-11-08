import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { PanelHeading } from "@/components/ui";

import { Intro } from "./Intro";

// PanelHeading with the web's optional subtitle line.
export function SectionHeading({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
  return (
    <View style={subtitle ? styles.withSubtitle : undefined}>
      <PanelHeading title={title} trailing={trailing} />
      {subtitle ? <Intro style={styles.subtitle}>{subtitle}</Intro> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  withSubtitle: { marginBottom: 14 },
  subtitle: { marginTop: -8 },
});
