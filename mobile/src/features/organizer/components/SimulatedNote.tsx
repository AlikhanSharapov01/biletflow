import { StyleSheet } from "react-native";

import { Panel, StatusPill } from "@/components/ui";

import { Intro } from "./Intro";

// Shown on every money screen: BiletFlow is an academic simulation.
export function SimulatedNote({ children }: { children?: string }) {
  return (
    <Panel tone="note" style={styles.note}>
      <StatusPill tone="pending" label="Simulated — no real money" />
      <Intro>
        {children ?? "Payments, payouts and identity checks here are demonstrations. No card numbers or bank details are collected and nothing is charged."}
      </Intro>
    </Panel>
  );
}

const styles = StyleSheet.create({
  note: { gap: 8 },
});
