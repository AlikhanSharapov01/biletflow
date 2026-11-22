import { request } from "./client";
import type { AdminMe } from "./types/admin";

// Kept apart from the full admin client so the signed-in nav can ask who the
// user is without loading every admin endpoint into the main bundle.
export function getAdminMe(): Promise<AdminMe> {
  return request<AdminMe>("/api/v1/admin/me");
}
