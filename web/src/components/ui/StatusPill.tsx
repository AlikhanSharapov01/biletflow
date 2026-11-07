import type { ReactNode } from "react";
import type { StatusTone } from "../../utils/status";

// Rounded status label with a leading dot, in one of four tones.
export function StatusPill({ tone = "positive", children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}
