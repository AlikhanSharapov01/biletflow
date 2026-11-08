import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { tokenFromLink } from "@/utils/format";

export interface TokenFlowState {
  busy: boolean;
  done: boolean;
  message: string;
}

export const TOKEN_FLOW_IDLE: TokenFlowState = { busy: false, done: false, message: "" };

// The emailed link (or just its token) pasted by the person, or a `token`
// route param when the screen was opened from the link itself.
export function useLinkToken() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const initial = Array.isArray(params.token) ? (params.token[0] ?? "") : (params.token ?? "");
  const [input, setInput] = useState(initial);
  const token = tokenFromLink(input);
  // Something was pasted, but it is a link without its token.
  const missing = input.trim() !== "" && token === "";
  return { input, setInput, token, missing };
}
