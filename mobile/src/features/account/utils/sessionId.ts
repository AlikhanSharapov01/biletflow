// The access token is a JWT whose `sid` claim names the session it belongs
// to, so the sessions list can mark "This device". Any malformed token gives "".
export function sessionIdFromToken(token: string | null | undefined): string {
  if (!token) return "";
  try {
    const payload = token.split(".")[1] ?? "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as { sid?: unknown };
    return typeof claims.sid === "string" ? claims.sid : "";
  } catch {
    return "";
  }
}
