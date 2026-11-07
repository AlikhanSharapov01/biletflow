import { useState } from "react";
import { consumeHashToken } from "../../utils/format";

// Pages reached from emailed links read the `#token=…` fragment once, so a
// reload or React StrictMode never spends a single-use token twice.
export function useHashToken(): string {
  const [token] = useState(() => consumeHashToken());
  return token;
}

export interface TokenFlowState {
  busy: boolean;
  done: boolean;
  message: string;
}

export const TOKEN_FLOW_IDLE: TokenFlowState = { busy: false, done: false, message: "" };
