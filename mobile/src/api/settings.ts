import { request } from "./http";
import type { PublicSettings } from "./types/settings";

// Public: needs no session. Never cached by the server.
export function getPublicSettings(): Promise<PublicSettings> {
  return request<PublicSettings>("/api/v1/settings/public");
}
