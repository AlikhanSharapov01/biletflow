// The access token lives only in memory; the HttpOnly refresh cookie set by the
// backend restores it after a reload. Components never read the token directly:
// the API client attaches it, and AuthProvider listens for expiry.

type Listener = () => void;

let accessToken = "";
const expiryListeners = new Set<Listener>();

export const session = {
  get token(): string {
    return accessToken;
  },
  set(token: string): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = "";
  },
  // Called by the client when a refresh fails: the user must sign in again.
  expire(): void {
    accessToken = "";
    for (const listener of expiryListeners) listener();
  },
  onExpired(listener: Listener): () => void {
    expiryListeners.add(listener);
    return () => expiryListeners.delete(listener);
  },
};

// The backend puts the session id in the JWT `sid` claim; the account page uses
// it to mark the current device. Decoding here is for display only — the server
// remains the authority on what the token means.
export function sessionIdFromToken(token: string): string {
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
