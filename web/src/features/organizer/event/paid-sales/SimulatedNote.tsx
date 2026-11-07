import { Panel, StatusPill } from "../../../../components/ui";

// Shown on every money screen: BiletFlow is an academic simulation.
export function SimulatedNote({ children }: { children?: string }) {
  return (
    <Panel as="aside" tone="note" className="simulated-note">
      <StatusPill tone="pending">Simulated — no real money</StatusPill>
      <p>{children ?? "Payments, payouts and identity checks here are demonstrations. No card numbers or bank details are collected and nothing is charged."}</p>
    </Panel>
  );
}
