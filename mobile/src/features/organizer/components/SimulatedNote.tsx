import { StyleSheet } from "react-native";

import { Panel, StatusPill } from "@/components/ui";

import { Intro } from "./Intro";
import { t, useLocale } from "@/i18n";

// Shown on every money screen: BiletFlow is an academic simulation.
export function SimulatedNote({ children }: { children?: string }) {
  useLocale();
  return (
    <Panel tone="note" style={styles.note}>
      <StatusPill tone="pending" label={t("org.simulated_money")} />
      <Intro>
        {children ?? t("org.demo_payment_notice")}
      </Intro>
    </Panel>
  );
}

const styles = StyleSheet.create({
  note: { gap: 8 },
});
