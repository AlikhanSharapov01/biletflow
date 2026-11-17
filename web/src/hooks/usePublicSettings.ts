import { getPublicSettings } from "../api/settings";
import type { PublicSettings } from "../api/types/settings";
import { useRequest } from "./useRequest";

// Current platform settings, or null while loading or when they cannot be
// read. Callers then skip their client-side pre-checks: the server still
// enforces every limit and its error message is shown.
export function usePublicSettings(): PublicSettings | null {
  return useRequest(getPublicSettings, []).data;
}
