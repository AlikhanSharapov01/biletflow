import { request } from "./client";
import type { PublicSettings } from "./types/settings";

let cached: Promise<PublicSettings> | null = null;

// Public platform settings. The answer is shared by every caller of one page
// view; a failed read is forgotten so the next caller tries again.
export function getPublicSettings(): Promise<PublicSettings> {
  if (!cached) {
    cached = request<PublicSettings>("/api/v1/settings/public").catch((failure: unknown) => {
      cached = null;
      throw failure;
    });
  }
  return cached;
}

// Admins may change a setting at any time; their settings page calls this so
// the next read sees the new value.
export function forgetPublicSettings(): void {
  cached = null;
}
